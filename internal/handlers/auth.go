package handlers

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"net"
	"net/http"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/nespina/quagenticus/internal/auth"
	"github.com/nespina/quagenticus/internal/httpx"
)

const (
	accessTokenTTL    = 15 * time.Minute
	refreshTokenTTL   = 30 * 24 * time.Hour
	refreshCookieName = "qg_refresh"
	refreshCookiePath = "/api/v1/auth"
)

type loginRequest struct {
	Email    string `json:"email"    validate:"required,email"`
	Password string `json:"password" validate:"required"`
}

type tokenResponse struct {
	AccessToken string `json:"access_token"`
	TokenType   string `json:"token_type"`
	ExpiresIn   int    `json:"expires_in"`
}

func clientIP(r *http.Request) string {
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}

func (a *API) Login(w http.ResponseWriter, r *http.Request) {
	var in loginRequest
	if err := httpx.Decode(r, &in); err != nil {
		httpx.RespondError(w, err)
		return
	}
	email := strings.ToLower(strings.TrimSpace(in.Email))
	ipKey, emailKey := "login-ip:"+clientIP(r), "login-email:"+email
	if !a.limiter.Allow(ipKey) || !a.limiter.Allow(emailKey) {
		httpx.RespondError(w, httpx.NewError(http.StatusTooManyRequests, "too_many_requests",
			"demasiados intentos; espera unos minutos antes de volver a intentarlo"))
		return
	}

	var userID, accountID string
	err := a.db.Pool.QueryRow(r.Context(),
		`SELECT id, account_id FROM user_login($1::citext, $2)`, email, in.Password,
	).Scan(&userID, &accountID)
	if err != nil {
		httpx.RespondError(w, err)
		return
	}
	a.limiter.Reset(emailKey)

	a.issueSession(w, r, auth.Actor{Type: "user", ID: userID, AccountID: accountID, Via: "session"})
}

func (a *API) issueSession(w http.ResponseWriter, r *http.Request, actor auth.Actor) {
	token, err := auth.GenerateToken(a.cfg.SecretKey, actor, accessTokenTTL)
	if err != nil {
		httpx.RespondError(w, err)
		return
	}

	secret := make([]byte, 32)
	if _, err := rand.Read(secret); err != nil {
		httpx.RespondError(w, err)
		return
	}
	refresh := hex.EncodeToString(secret)
	hash := sha256.Sum256([]byte(refresh))
	if _, err := a.db.Pool.Exec(r.Context(), `
		INSERT INTO refresh_token (user_id, token_hash, user_agent, expires_at)
		VALUES ($1, $2, $3, now() + $4::interval)
	`, actor.ID, hash[:], r.UserAgent(), refreshTokenTTL.String()); err != nil {
		httpx.RespondError(w, err)
		return
	}

	a.setRefreshCookie(w, r, refresh, int(refreshTokenTTL.Seconds()))
	httpx.RespondJSON(w, http.StatusOK, tokenResponse{
		AccessToken: token,
		TokenType:   "Bearer",
		ExpiresIn:   int(accessTokenTTL.Seconds()),
	})
}

func (a *API) setRefreshCookie(w http.ResponseWriter, r *http.Request, value string, maxAge int) {
	secure := a.cfg.CookieSecure || r.TLS != nil || r.Header.Get("X-Forwarded-Proto") == "https"
	http.SetCookie(w, &http.Cookie{
		Name:     refreshCookieName,
		Value:    value,
		Path:     refreshCookiePath,
		MaxAge:   maxAge,
		HttpOnly: true,
		Secure:   secure,
		SameSite: http.SameSiteStrictMode,
	})
}

// Refresh rotates the refresh token and issues a new access token.
func (a *API) Refresh(w http.ResponseWriter, r *http.Request) {
	c, err := r.Cookie(refreshCookieName)
	if err != nil || c.Value == "" {
		httpx.RespondError(w, httpx.ErrUnauthorized)
		return
	}
	hash := sha256.Sum256([]byte(c.Value))

	var userID, accountID string
	err = a.db.Pool.QueryRow(r.Context(), `
		UPDATE refresh_token rt SET revoked_at = now()
		  FROM app_user u
		 WHERE rt.token_hash = $1 AND rt.revoked_at IS NULL AND rt.expires_at > now()
		   AND u.id = rt.user_id AND u.status = 'active'
		RETURNING u.id, u.account_id
	`, hash[:]).Scan(&userID, &accountID)
	if err != nil {
		a.setRefreshCookie(w, r, "", -1)
		httpx.RespondError(w, httpx.ErrUnauthorized)
		return
	}
	a.issueSession(w, r, auth.Actor{Type: "user", ID: userID, AccountID: accountID, Via: "session"})
}

func (a *API) Logout(w http.ResponseWriter, r *http.Request) {
	if c, err := r.Cookie(refreshCookieName); err == nil && c.Value != "" {
		hash := sha256.Sum256([]byte(c.Value))
		a.db.Pool.Exec(r.Context(), `UPDATE refresh_token SET revoked_at = now() WHERE token_hash = $1`, hash[:]) //nolint:errcheck
	}
	a.setRefreshCookie(w, r, "", -1)
	w.WriteHeader(http.StatusNoContent)
}

func (a *API) Me(w http.ResponseWriter, r *http.Request) {
	act := actor(r)
	if act.Type == "agent" {
		a.object(w, r, `
			SELECT id, account_id, name AS display_name, 'agent' AS actor_type, scopes
			  FROM agent WHERE id = $1`, act.ID)
		return
	}
	a.object(w, r, `
		SELECT id, account_id, email, handle, display_name, avatar_url, locale, timezone,
		       is_account_admin, preferences, 'user' AS actor_type
		  FROM app_user WHERE id = $1 AND account_id = $2`, act.ID, act.AccountID)
}

func (a *API) UpdateMe(w http.ResponseWriter, r *http.Request) {
	in, err := httpx.DecodeObject(r, "display_name", "handle", "avatar_url", "locale", "timezone", "preferences")
	if err != nil {
		httpx.RespondError(w, err)
		return
	}
	act := actor(r)
	err = a.tx(r, func(ctx context.Context, tx pgx.Tx) error {
		_, err := tx.Exec(ctx, `
			UPDATE app_user SET
			    display_name = CASE WHEN $2::jsonb ? 'display_name' THEN coalesce(nullif(btrim($2::jsonb->>'display_name'), ''), display_name) ELSE display_name END,
			    handle       = CASE WHEN $2::jsonb ? 'handle' THEN coalesce(nullif(lower(btrim($2::jsonb->>'handle')), ''), handle) ELSE handle END,
			    avatar_url   = CASE WHEN $2::jsonb ? 'avatar_url' THEN nullif($2::jsonb->>'avatar_url', '') ELSE avatar_url END,
			    locale       = CASE WHEN $2::jsonb ? 'locale' THEN coalesce(nullif($2::jsonb->>'locale', ''), locale) ELSE locale END,
			    timezone     = CASE WHEN $2::jsonb ? 'timezone' THEN coalesce(nullif($2::jsonb->>'timezone', ''), timezone) ELSE timezone END,
			    preferences  = CASE WHEN $2::jsonb ? 'preferences' AND jsonb_typeof($2::jsonb->'preferences') = 'object'
			                        THEN preferences || ($2::jsonb->'preferences') ELSE preferences END,
			    updated_at   = now()
			 WHERE id = $1`, act.ID, jsonParam(in))
		return err
	})
	if err != nil {
		httpx.RespondError(w, err)
		return
	}
	a.Me(w, r)
}

type changeOwnPasswordRequest struct {
	CurrentPassword string `json:"current_password" validate:"required"`
	NewPassword     string `json:"new_password" validate:"required,min=8"`
}

func (a *API) ChangeOwnPassword(w http.ResponseWriter, r *http.Request) {
	var in changeOwnPasswordRequest
	if err := httpx.Decode(r, &in); err != nil {
		httpx.RespondError(w, err)
		return
	}
	act := actor(r)
	tag, err := a.db.Pool.Exec(r.Context(), `
		UPDATE app_user SET password = crypt($3, gen_salt('bf')), updated_at = now()
		 WHERE id = $1 AND password = crypt($2, password)
	`, act.ID, in.CurrentPassword, in.NewPassword)
	if err != nil {
		httpx.RespondError(w, err)
		return
	}
	if tag.RowsAffected() == 0 {
		httpx.RespondError(w, httpx.NewError(http.StatusUnauthorized, "invalid_credentials", "La contraseña actual es incorrecta"))
		return
	}
	// Other sessions must log in again.
	a.db.Pool.Exec(r.Context(), `UPDATE refresh_token SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL`, act.ID) //nolint:errcheck
	w.WriteHeader(http.StatusNoContent)
}

func (a *API) Health(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
	defer cancel()
	status, dbStatus := http.StatusOK, "ok"
	if err := a.db.Pool.Ping(ctx); err != nil {
		status, dbStatus = http.StatusServiceUnavailable, "down"
	}
	httpx.RespondJSON(w, status, map[string]string{"api": "ok", "database": dbStatus})
}

// ---------------------------------------------------------------- agents auth

type cachedAgent struct {
	actor   auth.Actor
	expires time.Time
}

// AuthenticateAgent validates an agent API key (bcrypt in the database) with
// a short in-memory cache to avoid hashing on every request.
func (a *API) AuthenticateAgent(ctx context.Context, key string) (auth.Actor, error) {
	sum := sha256.Sum256([]byte(key))
	cacheKey := hex.EncodeToString(sum[:])
	if v, ok := a.agentCache.Load(cacheKey); ok {
		c := v.(cachedAgent)
		if time.Now().Before(c.expires) {
			return c.actor, nil
		}
		a.agentCache.Delete(cacheKey)
	}
	var id, accountID string
	var scopes []string
	err := a.db.Pool.QueryRow(ctx, `SELECT id, account_id, scopes FROM agent_authenticate($1)`, key).
		Scan(&id, &accountID, &scopes)
	if err != nil {
		return auth.Actor{}, err
	}
	act := auth.Actor{Type: "agent", ID: id, AccountID: accountID, Scopes: scopes, Via: "api_key"}
	a.agentCache.Store(cacheKey, cachedAgent{actor: act, expires: time.Now().Add(time.Minute)})
	return act, nil
}
