package httpx

import (
	"context"
)

type requestIDKey struct{}

func RequestIDFrom(ctx context.Context) string {
	if val, ok := ctx.Value(requestIDKey{}).(string); ok {
		return val
	}
	return ""
}
