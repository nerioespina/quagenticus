package handlers

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/nespina/quagenticus/internal/auth"
	"github.com/nespina/quagenticus/internal/db"
	"github.com/nespina/quagenticus/internal/httpx"
)

type Users struct {
	db *db.DB
}

func NewUsers(db *db.DB) *Users {
	return &Users{db: db}
}

type UserResponse struct {
	ID             string  `json:"id"`
	AccountID      string  `json:"account_id"`
	Email          string  `json:"email"`
	DisplayName    string  `json:"display_name"`
	AvatarURL      *string `json:"avatar_url"`
	IsAccountAdmin bool    `json:"is_account_admin"`
	Locale         string  `json:"locale"`
	Status         string  `json:"status"`
	CreatedAt      string  `json:"created_at"`
}

func (h *Users) List(w http.ResponseWriter, r *http.Request) {
	actor := auth.ActorFrom(r.Context())

	rows, err := h.db.Pool.Query(r.Context(), `
		SELECT id, account_id, email, display_name, avatar_url, is_account_admin, locale, status, created_at::text
		FROM app_user
		WHERE account_id = $1 AND status != 'deleted'
		ORDER BY display_name
	`, actor.AccountID)
	if err != nil {
		httpx.RespondError(w, err)
		return
	}
	defer rows.Close()

	list := make([]UserResponse, 0)
	for rows.Next() {
		var u UserResponse
		if err := rows.Scan(
			&u.ID, &u.AccountID, &u.Email, &u.DisplayName, &u.AvatarURL,
			&u.IsAccountAdmin, &u.Locale, &u.Status, &u.CreatedAt,
		); err != nil {
			httpx.RespondError(w, err)
			return
		}
		list = append(list, u)
	}

	httpx.RespondJSON(w, http.StatusOK, list)
}

type UserCreateRequest struct {
	Email          string `json:"email" validate:"required,email"`
	Password       string `json:"password" validate:"required,min=6"`
	DisplayName    string `json:"display_name" validate:"required"`
	IsAccountAdmin bool   `json:"is_account_admin"`
}

func (h *Users) Create(w http.ResponseWriter, r *http.Request) {
	actor := auth.ActorFrom(r.Context())

	var in UserCreateRequest
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		httpx.RespondJSON(w, http.StatusBadRequest, httpx.ErrorResponse{Code: "bad_request", Message: "payload inválido"})
		return
	}
	if err := validate.Struct(in); err != nil {
		httpx.RespondJSON(w, http.StatusBadRequest, httpx.ErrorResponse{Code: "bad_request", Message: err.Error()})
		return
	}

	var u UserResponse
	err := h.db.Pool.QueryRow(r.Context(), `
		INSERT INTO app_user (account_id, email, password, display_name, is_account_admin, status, creator_id)
		VALUES ($1, $2, crypt($3, gen_salt('bf')), $4, $5, 'active', $6)
		RETURNING id, account_id, email, display_name, avatar_url, is_account_admin, locale, status, created_at::text
	`, actor.AccountID, in.Email, in.Password, in.DisplayName, in.IsAccountAdmin, actor.ID).Scan(
		&u.ID, &u.AccountID, &u.Email, &u.DisplayName, &u.AvatarURL,
		&u.IsAccountAdmin, &u.Locale, &u.Status, &u.CreatedAt,
	)
	if err != nil {
		httpx.RespondError(w, err)
		return
	}

	httpx.RespondJSON(w, http.StatusCreated, u)
}

type UserUpdateRequest struct {
	DisplayName    *string `json:"display_name"`
	IsAccountAdmin *bool   `json:"is_account_admin"`
	Status         *string `json:"status"`
}

func (h *Users) Update(w http.ResponseWriter, r *http.Request) {
	userID := chi.URLParam(r, "id")

	var in UserUpdateRequest
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		httpx.RespondJSON(w, http.StatusBadRequest, httpx.ErrorResponse{Code: "bad_request", Message: "payload inválido"})
		return
	}

	_, err := h.db.Pool.Exec(r.Context(), `
		UPDATE app_user SET
			display_name = COALESCE($2, display_name),
			is_account_admin = COALESCE($3, is_account_admin),
			status = COALESCE($4::user_status, status),
			updated_at = now()
		WHERE id = $1
	`, userID, in.DisplayName, in.IsAccountAdmin, in.Status)
	if err != nil {
		httpx.RespondError(w, err)
		return
	}

	var u UserResponse
	err = h.db.Pool.QueryRow(r.Context(), `
		SELECT id, account_id, email, display_name, avatar_url, is_account_admin, locale, status, created_at::text
		FROM app_user WHERE id = $1
	`, userID).Scan(
		&u.ID, &u.AccountID, &u.Email, &u.DisplayName, &u.AvatarURL,
		&u.IsAccountAdmin, &u.Locale, &u.Status, &u.CreatedAt,
	)
	if err != nil {
		httpx.RespondError(w, err)
		return
	}

	httpx.RespondJSON(w, http.StatusOK, u)
}

type ChangePasswordRequest struct {
	NewPassword string `json:"new_password" validate:"required,min=6"`
}

func (h *Users) ChangePassword(w http.ResponseWriter, r *http.Request) {
	userID := chi.URLParam(r, "id")

	var in ChangePasswordRequest
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil || in.NewPassword == "" {
		httpx.RespondJSON(w, http.StatusBadRequest, httpx.ErrorResponse{Code: "bad_request", Message: "contraseña inválida"})
		return
	}

	_, err := h.db.Pool.Exec(r.Context(), `
		UPDATE app_user SET
			password = crypt($2, gen_salt('bf')),
			updated_at = now()
		WHERE id = $1
	`, userID, in.NewPassword)
	if err != nil {
		httpx.RespondError(w, err)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

type ChangeOwnPasswordRequest struct {
	CurrentPassword string `json:"current_password" validate:"required"`
	NewPassword     string `json:"new_password" validate:"required,min=6"`
}

func (h *Users) ChangeOwnPassword(w http.ResponseWriter, r *http.Request) {
	actor := auth.ActorFrom(r.Context())

	var in ChangeOwnPasswordRequest
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		httpx.RespondJSON(w, http.StatusBadRequest, httpx.ErrorResponse{Code: "bad_request", Message: "payload inválido"})
		return
	}
	if err := validate.Struct(in); err != nil {
		httpx.RespondJSON(w, http.StatusBadRequest, httpx.ErrorResponse{Code: "bad_request", Message: err.Error()})
		return
	}

	// Verify current password
	var dummy string
	err := h.db.Pool.QueryRow(r.Context(), `
		SELECT id FROM app_user WHERE id = $1 AND password = crypt($2, password)
	`, actor.ID, in.CurrentPassword).Scan(&dummy)
	if err != nil {
		httpx.RespondJSON(w, http.StatusUnauthorized, httpx.ErrorResponse{Code: "invalid_credentials", Message: "La contraseña actual es incorrecta"})
		return
	}

	_, err = h.db.Pool.Exec(r.Context(), `
		UPDATE app_user SET
			password = crypt($2, gen_salt('bf')),
			updated_at = now()
		WHERE id = $1
	`, actor.ID, in.NewPassword)
	if err != nil {
		httpx.RespondError(w, err)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}
