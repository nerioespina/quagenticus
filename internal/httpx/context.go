package httpx

import (
	"context"

	"github.com/go-chi/chi/v5/middleware"
)

func RequestIDFrom(ctx context.Context) string {
	return middleware.GetReqID(ctx)
}
