package handlers

import (
	"context"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/nespina/quagenticus/internal/httpx"
)

const userColumns = `id, account_id, email, handle, display_name, avatar_url, is_account_admin,
                     locale, timezone, status, last_login_at, created_at`

// ListUsers returns the users of the actor's account (any member may list them
// to invite people to spaces; only admins can change them).
func (a *API) ListUsers(w http.ResponseWriter, r *http.Request) {
	a.array(w, r, `SELECT `+userColumns+` FROM app_user
		WHERE account_id = $1 AND status <> 'deleted' ORDER BY display_name`, actor(r).AccountID)
}

type userCreateRequest struct {
	Email          string `json:"email"        validate:"required,email"`
	Password       string `json:"password"     validate:"required,min=8"`
	DisplayName    string `json:"display_name" validate:"required"`
	Handle         string `json:"handle"`
	IsAccountAdmin bool   `json:"is_account_admin"`
}

func (a *API) CreateUser(w http.ResponseWriter, r *http.Request) {
	var in userCreateRequest
	if err := httpx.Decode(r, &in); err != nil {
		httpx.RespondError(w, err)
		return
	}
	act := actor(r)
	a.mutation(w, r, http.StatusCreated, `
		INSERT INTO app_user (account_id, email, password, display_name, handle, is_account_admin, status, creator_id)
		VALUES ($1, $2, crypt($3, gen_salt('bf')), $4, nullif($5, ''), $6, 'active', $7)
		RETURNING `+userColumns,
		act.AccountID, in.Email, in.Password, in.DisplayName, in.Handle, in.IsAccountAdmin, act.ID)
}

func (a *API) UpdateUser(w http.ResponseWriter, r *http.Request) {
	userID := chi.URLParam(r, "id")
	if !httpx.IsUUID(userID) {
		httpx.RespondError(w, httpx.ErrNotFound)
		return
	}
	in, err := httpx.DecodeObject(r, "display_name", "is_account_admin", "status", "handle")
	if err != nil {
		httpx.RespondError(w, err)
		return
	}
	act := actor(r)
	if userID == act.ID {
		if v, ok := in["is_account_admin"]; ok && string(v) == "false" {
			httpx.RespondError(w, httpx.NewError(http.StatusUnprocessableEntity, "unprocessable", "no puedes quitarte a ti mismo el rol de administrador"))
			return
		}
		if _, ok := in["status"]; ok {
			httpx.RespondError(w, httpx.NewError(http.StatusUnprocessableEntity, "unprocessable", "no puedes cambiar tu propio estado"))
			return
		}
	}
	a.mutation(w, r, http.StatusOK, `
		UPDATE app_user SET
		    display_name     = CASE WHEN $3::jsonb ? 'display_name' THEN coalesce(nullif(btrim($3::jsonb->>'display_name'), ''), display_name) ELSE display_name END,
		    handle           = CASE WHEN $3::jsonb ? 'handle' THEN coalesce(nullif(lower(btrim($3::jsonb->>'handle')), ''), handle) ELSE handle END,
		    is_account_admin = CASE WHEN $3::jsonb ? 'is_account_admin' THEN ($3::jsonb->>'is_account_admin')::boolean ELSE is_account_admin END,
		    status           = CASE WHEN $3::jsonb ? 'status' THEN ($3::jsonb->>'status')::user_status ELSE status END,
		    updated_at       = now()
		 WHERE id = $1 AND account_id = $2
		RETURNING `+userColumns, userID, act.AccountID, jsonParam(in))
}

type adminPasswordRequest struct {
	NewPassword string `json:"new_password" validate:"required,min=8"`
}

func (a *API) ResetUserPassword(w http.ResponseWriter, r *http.Request) {
	userID := chi.URLParam(r, "id")
	var in adminPasswordRequest
	if err := httpx.Decode(r, &in); err != nil {
		httpx.RespondError(w, err)
		return
	}
	act := actor(r)
	err := a.tx(r, func(ctx context.Context, tx pgx.Tx) error {
		tag, err := tx.Exec(ctx, `
			UPDATE app_user SET password = crypt($3, gen_salt('bf')), updated_at = now()
			 WHERE id = $1 AND account_id = $2`, uuidOrNil(userID), act.AccountID, in.NewPassword)
		if err != nil {
			return err
		}
		if tag.RowsAffected() == 0 {
			return httpx.ErrNotFound
		}
		_, err = tx.Exec(ctx, `UPDATE refresh_token SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL`, userID)
		return err
	})
	if err != nil {
		httpx.RespondError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
