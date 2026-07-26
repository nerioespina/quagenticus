package auth

import (
	"net/http"

	"github.com/nespina/quagenticus/internal/httpx"
)

// RequireAuth rejects requests without a valid authenticated actor.
func RequireAuth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		actor := ActorFrom(r.Context())
		if actor.ID == "" {
			httpx.RespondJSON(w, http.StatusUnauthorized, httpx.ErrorResponse{
				Code:    "unauthorized",
				Message: "autenticación requerida",
			})
			return
		}
		next.ServeHTTP(w, r)
	})
}
