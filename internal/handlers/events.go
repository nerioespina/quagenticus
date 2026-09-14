package handlers

import (
	"context"
	"net/http"
	"sync"
	"time"

	"github.com/nespina/quagenticus/internal/events"
)

// Events streams change notifications (SSE). Clients invalidate their caches
// when an event for a space/document they display arrives.
func (a *API) Events(hub *events.Hub) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		flusher, ok := w.(http.Flusher)
		if !ok {
			http.Error(w, "streaming unsupported", http.StatusInternalServerError)
			return
		}
		act := actor(r)

		var mu sync.RWMutex
		spaces := map[string]bool{}
		load := func(ctx context.Context) {
			rows, err := a.db.Pool.Query(ctx, `
				SELECT id::text FROM space
				 WHERE account_id = $1 AND space_member_role(id, $2, $3::uuid) IS NOT NULL`,
				act.AccountID, act.Type, act.ID)
			if err != nil {
				return
			}
			defer rows.Close()
			next := map[string]bool{}
			for rows.Next() {
				var id string
				if rows.Scan(&id) == nil {
					next[id] = true
				}
			}
			mu.Lock()
			spaces = next
			mu.Unlock()
		}
		load(r.Context())

		sub := &events.Subscriber{
			UserID: act.ID,
			Spaces: func() map[string]bool { mu.RLock(); defer mu.RUnlock(); return spaces },
			C:      make(chan []byte, 64),
		}
		hub.Subscribe(sub)
		defer hub.Unsubscribe(sub)

		h := w.Header()
		h.Set("Content-Type", "text/event-stream")
		h.Set("Cache-Control", "no-cache")
		h.Set("Connection", "keep-alive")
		h.Set("X-Accel-Buffering", "no")
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("retry: 5000\nevent: ready\ndata: {}\n\n")) //nolint:errcheck
		flusher.Flush()

		ping := time.NewTicker(25 * time.Second)
		refresh := time.NewTicker(2 * time.Minute)
		defer ping.Stop()
		defer refresh.Stop()

		for {
			select {
			case <-r.Context().Done():
				return
			case <-ping.C:
				w.Write([]byte(": ping\n\n")) //nolint:errcheck
				flusher.Flush()
			case <-refresh.C:
				load(r.Context())
			case msg := <-sub.C:
				w.Write([]byte("event: change\ndata: ")) //nolint:errcheck
				w.Write(msg)                             //nolint:errcheck
				w.Write([]byte("\n\n"))                  //nolint:errcheck
				flusher.Flush()
			}
		}
	}
}
