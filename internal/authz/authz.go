// Package authz enforces account isolation and space roles on every request.
package authz

import (
	"context"
	"errors"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/nespina/quagenticus/internal/auth"
	"github.com/nespina/quagenticus/internal/httpx"
)

type Role int

const (
	None Role = iota
	Viewer
	Contributor
	Maintainer
	Admin
)

func ParseRole(s string) Role {
	switch s {
	case "viewer":
		return Viewer
	case "contributor":
		return Contributor
	case "maintainer":
		return Maintainer
	case "admin":
		return Admin
	}
	return None
}

func (r Role) String() string {
	return [...]string{"", "viewer", "contributor", "maintainer", "admin"}[r]
}

// Access is the resolved permission of the current actor on a space.
type Access struct {
	SpaceID string
	Role    Role
}

type ctxKey struct{}

func From(ctx context.Context) Access {
	a, _ := ctx.Value(ctxKey{}).(Access)
	return a
}

// Resolver finds the space a request targets. It returns pgx.ErrNoRows (or
// an invalid id) when the resource does not exist.
type Resolver func(r *http.Request, pool *pgxpool.Pool) (string, error)

// SpaceParam reads the space id from a URL parameter.
func SpaceParam(name string) Resolver {
	return func(r *http.Request, _ *pgxpool.Pool) (string, error) {
		id := chi.URLParam(r, name)
		if !httpx.IsUUID(id) {
			return "", pgx.ErrNoRows
		}
		return id, nil
	}
}

// Lookup resolves the space with a query taking the URL parameter as $1.
func Lookup(param, sql string) Resolver {
	return func(r *http.Request, pool *pgxpool.Pool) (string, error) {
		id := chi.URLParam(r, param)
		if !httpx.IsUUID(id) {
			return "", pgx.ErrNoRows
		}
		var spaceID *string
		if err := pool.QueryRow(r.Context(), sql, id).Scan(&spaceID); err != nil {
			return "", err
		}
		if spaceID == nil {
			return "", pgx.ErrNoRows
		}
		return *spaceID, nil
	}
}

var (
	Document   = Lookup("id", `SELECT space_id::text FROM document WHERE id = $1`)
	Attachment = Lookup("id", `SELECT space_id::text FROM attachment WHERE id = $1`)
	Journal    = Lookup("id", `SELECT d.space_id::text FROM journal j JOIN document d ON d.id = j.document_id WHERE j.id = $1`)
	Milestone  = Lookup("id", `SELECT space_id::text FROM milestone WHERE id = $1`)
	Category   = Lookup("id", `SELECT space_id::text FROM category WHERE id = $1`)
	Label      = Lookup("id", `SELECT space_id::text FROM label WHERE id = $1 AND space_id IS NOT NULL`)
	Board      = Lookup("boardId", `SELECT space_id::text FROM board WHERE id = $1`)
	SavedView  = Lookup("id", `SELECT space_id::text FROM saved_view WHERE id = $1`)
	TimeEntry  = Lookup("id", `SELECT d.space_id::text FROM time_entry t JOIN document d ON d.id = t.document_id WHERE t.id = $1`)
)

type Guard struct {
	pool *pgxpool.Pool
}

func NewGuard(pool *pgxpool.Pool) *Guard {
	return &Guard{pool: pool}
}

// SpaceRole returns the actor's role in a space of its own account (None if
// the space does not exist, belongs to another account or the actor has no access).
func (g *Guard) SpaceRole(ctx context.Context, actor auth.Actor, spaceID string) (Role, error) {
	if !httpx.IsUUID(spaceID) || actor.ID == "" {
		return None, nil
	}
	var role *string
	err := g.pool.QueryRow(ctx, `
		SELECT space_member_role(s.id, $2, $3::uuid)::text
		  FROM space s
		 WHERE s.id = $1 AND s.account_id = $4::uuid AND NOT s.is_archived
	`, spaceID, actor.Type, actor.ID, actor.AccountID).Scan(&role)
	if errors.Is(err, pgx.ErrNoRows) {
		return None, nil
	}
	if err != nil {
		return None, err
	}
	if role == nil {
		return None, nil
	}
	return ParseRole(*role), nil
}

// Require resolves the target space and checks the minimum role. Missing
// resources and spaces the actor cannot see both answer 404, so ids never leak.
func (g *Guard) Require(resolve Resolver, min Role) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			actor := auth.ActorFrom(r.Context())
			spaceID, err := resolve(r, g.pool)
			if errors.Is(err, pgx.ErrNoRows) {
				httpx.RespondError(w, httpx.ErrNotFound)
				return
			}
			if err != nil {
				httpx.RespondError(w, err)
				return
			}
			role, err := g.SpaceRole(r.Context(), actor, spaceID)
			if err != nil {
				httpx.RespondError(w, err)
				return
			}
			if role == None {
				httpx.RespondError(w, httpx.ErrNotFound)
				return
			}
			if role < min {
				httpx.RespondError(w, httpx.NewError(http.StatusForbidden, "forbidden",
					"tu rol ("+role.String()+") no permite esta acción"))
				return
			}
			ctx := context.WithValue(r.Context(), ctxKey{}, Access{SpaceID: spaceID, Role: role})
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

// IsAccountAdmin reports whether the actor administers its account.
func (g *Guard) IsAccountAdmin(ctx context.Context, actor auth.Actor) bool {
	if actor.Type != "user" {
		return false
	}
	var ok bool
	err := g.pool.QueryRow(ctx, `
		SELECT is_account_admin FROM app_user
		 WHERE id = $1 AND account_id = $2 AND status = 'active'
	`, actor.ID, actor.AccountID).Scan(&ok)
	return err == nil && ok
}

// RequireAccountAdmin allows only account administrators.
func (g *Guard) RequireAccountAdmin(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !g.IsAccountAdmin(r.Context(), auth.ActorFrom(r.Context())) {
			httpx.RespondError(w, httpx.NewError(http.StatusForbidden, "forbidden", "solo un administrador de la cuenta puede hacer esto"))
			return
		}
		next.ServeHTTP(w, r)
	})
}

// RequireUser rejects agents on human-only endpoints.
func RequireUser(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if auth.ActorFrom(r.Context()).Type != "user" {
			httpx.RespondError(w, httpx.ErrForbidden)
			return
		}
		next.ServeHTTP(w, r)
	})
}
