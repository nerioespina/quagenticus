// Package events fans PostgreSQL NOTIFY events out to Server-Sent Events clients.
package events

import (
	"context"
	"encoding/json"
	"log/slog"
	"sync"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// Event is the payload published by qg_emit_event / notification_fanout.
type Event struct {
	Type       string   `json:"type"`
	SpaceID    string   `json:"space_id"`
	DocumentID string   `json:"document_id,omitempty"`
	UserIDs    []string `json:"user_ids,omitempty"`
	Raw        []byte   `json:"-"`
}

type Subscriber struct {
	UserID string
	Spaces func() map[string]bool // readable spaces, refreshed by the caller
	C      chan []byte
}

type Hub struct {
	pool *pgxpool.Pool
	mu   sync.RWMutex
	subs map[*Subscriber]struct{}
}

func NewHub(pool *pgxpool.Pool) *Hub {
	return &Hub{pool: pool, subs: make(map[*Subscriber]struct{})}
}

func (h *Hub) Subscribe(s *Subscriber) {
	h.mu.Lock()
	h.subs[s] = struct{}{}
	h.mu.Unlock()
}

func (h *Hub) Unsubscribe(s *Subscriber) {
	h.mu.Lock()
	delete(h.subs, s)
	h.mu.Unlock()
}

// Run keeps a dedicated LISTEN connection, reconnecting on failure.
func (h *Hub) Run(ctx context.Context) {
	for ctx.Err() == nil {
		if err := h.listen(ctx); err != nil && ctx.Err() == nil {
			slog.Warn("events listener stopped, retrying", "error", err)
			time.Sleep(3 * time.Second)
		}
	}
}

func (h *Hub) listen(ctx context.Context) error {
	conn, err := h.pool.Acquire(ctx)
	if err != nil {
		return err
	}
	defer conn.Release()
	if _, err := conn.Exec(ctx, "LISTEN qg_events"); err != nil {
		return err
	}
	for {
		n, err := conn.Conn().WaitForNotification(ctx)
		if err != nil {
			return err
		}
		var ev Event
		if err := json.Unmarshal([]byte(n.Payload), &ev); err != nil {
			continue
		}
		h.dispatch(ev, []byte(n.Payload))
	}
}

func (h *Hub) dispatch(ev Event, raw []byte) {
	h.mu.RLock()
	defer h.mu.RUnlock()
	for s := range h.subs {
		if ev.Type == "notification" {
			for _, u := range ev.UserIDs {
				if u == s.UserID {
					send(s, raw)
					break
				}
			}
			continue
		}
		if s.Spaces()[ev.SpaceID] {
			send(s, raw)
		}
	}
}

func send(s *Subscriber, raw []byte) {
	select {
	case s.C <- raw:
	default: // slow client: drop, it will refetch on next event
	}
}
