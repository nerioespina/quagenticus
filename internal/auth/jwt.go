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

func Authenticate(secretKey string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			authHeader := r.Header.Get("Authorization")
			if authHeader == "" {
				next.ServeHTTP(w, r)
				return
			}

			parts := strings.Split(authHeader, " ")
			if len(parts) != 2 || parts[0] != "Bearer" {
				http.Error(w, "Invalid authorization header", http.StatusUnauthorized)
				return
			}

			tokenStr := parts[1]
			claims := &Claims{}
			token, err := jwt.ParseWithClaims(tokenStr, claims, func(token *jwt.Token) (interface{}, error) {
				return []byte(secretKey), nil
			})

			if err != nil || !token.Valid {
				http.Error(w, "Invalid token", http.StatusUnauthorized)
				return
			}

			actor := Actor{
				Type:      claims.Type,
				ID:        claims.Subject,
				AccountID: claims.AccountID,
				Scopes:    claims.Scopes,
				Via:       "session",
			}

			ctx := context.WithValue(r.Context(), actorKey{}, actor)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

type actorKey struct{}

func ActorFrom(ctx context.Context) Actor {
	if actor, ok := ctx.Value(actorKey{}).(Actor); ok {
		return actor
	}
	return Actor{Type: "system"}
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
