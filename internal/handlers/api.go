// Package handlers implements the REST API. Most reads are projected to JSON
// directly by PostgreSQL (thick database); writes call database functions
// inside an actor transaction.
package handlers

import (
	"context"
	"encoding/json"
	"net/http"
	"sync"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/nespina/quagenticus/internal/auth"
	"github.com/nespina/quagenticus/internal/authz"
	"github.com/nespina/quagenticus/internal/config"
	"github.com/nespina/quagenticus/internal/db"
	"github.com/nespina/quagenticus/internal/httpx"
	"github.com/nespina/quagenticus/internal/storage"
)

type API struct {
	db      *db.DB
	cfg     config.Config
	guard   *authz.Guard
	store   storage.Storage
	signer  *storage.Signer
	limiter *auth.RateLimiter

	agentCache sync.Map // sha256(key) -> cachedAgent
}

func New(database *db.DB, cfg config.Config, store storage.Storage) *API {
	return &API{
		db:      database,
		cfg:     cfg,
		guard:   authz.NewGuard(database.Pool),
		store:   store,
		signer:  storage.NewSigner(cfg.SecretKey, 15*time.Minute),
		limiter: auth.NewRateLimiter(10, 15*time.Minute),
	}
}

func (a *API) Guard() *authz.Guard { return a.guard }

func actor(r *http.Request) auth.Actor { return auth.ActorFrom(r.Context()) }

// object responds with a single JSON object (404 when the query yields nothing).
func (a *API) object(w http.ResponseWriter, r *http.Request, sql string, args ...any) {
	raw, err := a.db.JSONObject(r.Context(), actor(r), sql, args...)
	if err != nil {
		httpx.RespondError(w, err)
		return
	}
	httpx.RespondRawJSON(w, http.StatusOK, raw)
}

// mutation responds with the row returned by an INSERT/UPDATE ... RETURNING.
func (a *API) mutation(w http.ResponseWriter, r *http.Request, status int, sql string, args ...any) {
	raw, err := a.db.JSONMutation(r.Context(), actor(r), sql, args...)
	if err != nil {
		httpx.RespondError(w, err)
		return
	}
	httpx.RespondRawJSON(w, status, raw)
}

// array responds with a JSON array of row objects.
func (a *API) array(w http.ResponseWriter, r *http.Request, sql string, args ...any) {
	raw, err := a.db.JSONArray(r.Context(), actor(r), sql, args...)
	if err != nil {
		httpx.RespondError(w, err)
		return
	}
	httpx.RespondRawJSON(w, http.StatusOK, raw)
}

// rawJSON responds with a query that already returns one json value.
func (a *API) rawJSON(w http.ResponseWriter, r *http.Request, status int, sql string, args ...any) {
	raw, err := a.db.JSON(r.Context(), actor(r), sql, args...)
	if err != nil {
		httpx.RespondError(w, err)
		return
	}
	httpx.RespondRawJSON(w, status, raw)
}

// tx runs fn inside an actor transaction.
func (a *API) tx(r *http.Request, fn func(ctx context.Context, tx pgx.Tx) error) error {
	ctx := r.Context()
	return a.db.WithActor(ctx, actor(r), func(tx pgx.Tx) error { return fn(ctx, tx) })
}

// exec runs a statement in an actor transaction and answers 204.
func (a *API) exec(w http.ResponseWriter, r *http.Request, sql string, args ...any) {
	err := a.tx(r, func(ctx context.Context, tx pgx.Tx) error {
		_, err := tx.Exec(ctx, sql, args...)
		return err
	})
	if err != nil {
		httpx.RespondError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func jsonParam(v any) string {
	b, _ := json.Marshal(v)
	return string(b)
}

func uuidOrNil(s string) any {
	if httpx.IsUUID(s) {
		return s
	}
	return nil
}
