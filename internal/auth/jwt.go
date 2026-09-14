package auth

import (
	"context"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

type Claims struct {
	jwt.RegisteredClaims
	Type      string   `json:"type"`
	AccountID string   `json:"account_id"`
	Scopes    []string `json:"scopes"`
}

// AgentAuthenticator validates agent API keys ("qga_...").
type AgentAuthenticator interface {
	AuthenticateAgent(ctx context.Context, key string) (Actor, error)
}

const AgentKeyPrefix = "qga_"

// Authenticate resolves the actor from a Bearer token: a session JWT or an
// agent API key. EventSource cannot send headers, so /events also accepts
// ?access_token=.
func Authenticate(secretKey string, agents AgentAuthenticator) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			tokenStr := ""
			if authHeader := r.Header.Get("Authorization"); authHeader != "" {
				parts := strings.SplitN(authHeader, " ", 2)
				if len(parts) != 2 || !strings.EqualFold(parts[0], "Bearer") {
					unauthorized(w, "cabecera Authorization inválida")
					return
				}
				tokenStr = strings.TrimSpace(parts[1])
			} else if strings.HasSuffix(r.URL.Path, "/events") {
				tokenStr = r.URL.Query().Get("access_token")
			}
			if tokenStr == "" {
				next.ServeHTTP(w, r)
				return
			}

			var actor Actor
			if strings.HasPrefix(tokenStr, AgentKeyPrefix) && agents != nil {
				a, err := agents.AuthenticateAgent(r.Context(), tokenStr)
				if err != nil {
					unauthorized(w, "API key inválida")
					return
				}
				actor = a
			} else {
				claims, err := ParseToken(secretKey, tokenStr)
				if err != nil {
					unauthorized(w, "token inválido o expirado")
					return
				}
				actor = Actor{
					Type:      claims.Type,
					ID:        claims.Subject,
					AccountID: claims.AccountID,
					Scopes:    claims.Scopes,
					Via:       "session",
				}
			}

			ctx := context.WithValue(r.Context(), actorKey{}, actor)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

func unauthorized(w http.ResponseWriter, msg string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusUnauthorized)
	w.Write([]byte(`{"code":"unauthorized","message":"` + msg + `"}`)) //nolint:errcheck
}

func ParseToken(secretKey, tokenStr string) (*Claims, error) {
	claims := &Claims{}
	token, err := jwt.ParseWithClaims(tokenStr, claims,
		func(token *jwt.Token) (interface{}, error) { return []byte(secretKey), nil },
		jwt.WithValidMethods([]string{jwt.SigningMethodHS256.Alg()}),
		jwt.WithExpirationRequired(),
	)
	if err != nil || !token.Valid {
		return nil, errors.New("invalid token")
	}
	return claims, nil
}

type actorKey struct{}

func ActorFrom(ctx context.Context) Actor {
	if actor, ok := ctx.Value(actorKey{}).(Actor); ok {
		return actor
	}
	return Actor{Type: "system"}
}

// WithActor returns a context carrying the actor (used by background jobs and tests).
func WithActor(ctx context.Context, a Actor) context.Context {
	return context.WithValue(ctx, actorKey{}, a)
}

func GenerateToken(secretKey string, actor Actor, duration time.Duration) (string, error) {
	if secretKey == "" {
		return "", errors.New("secret key is empty")
	}

	claims := &Claims{
		RegisteredClaims: jwt.RegisteredClaims{
			Subject:   actor.ID,
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(duration)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
		},
		Type:      actor.Type,
		AccountID: actor.AccountID,
		Scopes:    actor.Scopes,
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString([]byte(secretKey))
}
