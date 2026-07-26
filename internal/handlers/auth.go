package handlers

import (
	"encoding/json"
	"net/http"
	"time"

	"github.com/nespina/quagenticus/internal/auth"
	"github.com/nespina/quagenticus/internal/db"
	"github.com/nespina/quagenticus/internal/httpx"
)

type Auth struct {
	db        *db.DB
	secretKey string
}

func NewAuth(db *db.DB, secretKey string) *Auth {
	return &Auth{db: db, secretKey: secretKey}
}

type loginRequest struct {
	Email    string `json:"email"    validate:"required,email"`
	Password string `json:"password" validate:"required"`
}

type loginResponse struct {
	AccessToken string `json:"access_token"`
	TokenType   string `json:"token_type"`
	ExpiresIn   int    `json:"expires_in"`
}

const accessTokenTTL = 24 * time.Hour

func (h *Auth) Login(w http.ResponseWriter, r *http.Request) {
	var in loginRequest
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		httpx.RespondJSON(w, http.StatusBadRequest, httpx.ErrorResponse{Code: "bad_request", Message: "payload inválido"})
		return
	}
	if err := validate.Struct(in); err != nil {
		httpx.RespondJSON(w, http.StatusBadRequest, httpx.ErrorResponse{Code: "bad_request", Message: err.Error()})
		return
	}

	var userID, accountID string
	err := h.db.Pool.QueryRow(r.Context(),
		`SELECT id, account_id FROM user_login($1::citext, $2)`,
		in.Email, in.Password,
	).Scan(&userID, &accountID)
	if err != nil {
		httpx.RespondError(w, err)
		return
	}

	actor := auth.Actor{
		Type:      "user",
		ID:        userID,
		AccountID: accountID,
		Via:       "session",
	}

	token, err := auth.GenerateToken(h.secretKey, actor, accessTokenTTL)
	if err != nil {
		httpx.RespondJSON(w, http.StatusInternalServerError, httpx.ErrorResponse{Code: "server_error", Message: "no se pudo generar el token"})
		return
	}

	httpx.RespondJSON(w, http.StatusOK, loginResponse{
		AccessToken: token,
		TokenType:   "Bearer",
		ExpiresIn:   int(accessTokenTTL.Seconds()),
	})
}

func (h *Auth) Me(w http.ResponseWriter, r *http.Request) {
	actor := auth.ActorFrom(r.Context())

	var result struct {
		ID          string `json:"id"`
		AccountID   string `json:"account_id"`
		Email       string `json:"email"`
		DisplayName string `json:"display_name"`
		AvatarURL   *string `json:"avatar_url"`
		Locale      string `json:"locale"`
	}

	err := h.db.Pool.QueryRow(r.Context(),
		`SELECT id, account_id, email, display_name, avatar_url, locale FROM app_user WHERE id = $1`,
		actor.ID,
	).Scan(&result.ID, &result.AccountID, &result.Email, &result.DisplayName, &result.AvatarURL, &result.Locale)
	if err != nil {
		httpx.RespondError(w, err)
		return
	}

	httpx.RespondJSON(w, http.StatusOK, result)
}
