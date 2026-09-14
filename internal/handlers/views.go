package handlers

import (
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/nespina/quagenticus/internal/authz"
	"github.com/nespina/quagenticus/internal/httpx"
)

func (a *API) ListSavedViews(w http.ResponseWriter, r *http.Request) {
	acc := authz.From(r.Context())
	a.array(w, r, `
		SELECT id, space_id, user_id, name, filters, user_id IS NULL AS is_shared, created_at
		  FROM saved_view
		 WHERE space_id = $1 AND (user_id IS NULL OR user_id = $2::uuid)
		 ORDER BY user_id IS NULL, name`, acc.SpaceID, uuidOrNil(actor(r).ID))
}

type savedViewRequest struct {
	Name    string         `json:"name" validate:"required,max=80"`
	Filters map[string]any `json:"filters"`
	Shared  bool           `json:"shared"`
}

func (a *API) CreateSavedView(w http.ResponseWriter, r *http.Request) {
	var in savedViewRequest
	if err := httpx.Decode(r, &in); err != nil {
		httpx.RespondError(w, err)
		return
	}
	acc := authz.From(r.Context())
	if in.Shared && acc.Role < authz.Maintainer {
		httpx.RespondError(w, httpx.NewError(http.StatusForbidden, "forbidden", "solo mantenedores pueden compartir vistas"))
		return
	}
	var userID any = uuidOrNil(actor(r).ID)
	if in.Shared {
		userID = nil
	}
	a.mutation(w, r, http.StatusCreated, `
		INSERT INTO saved_view (account_id, space_id, user_id, name, filters)
		SELECT s.account_id, s.id, $2::uuid, btrim($3), coalesce($4::jsonb, '{}') FROM space s WHERE s.id = $1
		RETURNING id, space_id, user_id, name, filters, user_id IS NULL AS is_shared, created_at`,
		acc.SpaceID, userID, in.Name, jsonParam(in.Filters))
}

func (a *API) DeleteSavedView(w http.ResponseWriter, r *http.Request) {
	acc := authz.From(r.Context())
	a.exec(w, r, `DELETE FROM saved_view WHERE id = $1 AND (user_id = $2::uuid OR (user_id IS NULL AND $3))`,
		chi.URLParam(r, "id"), uuidOrNil(actor(r).ID), acc.Role >= authz.Maintainer)
}
