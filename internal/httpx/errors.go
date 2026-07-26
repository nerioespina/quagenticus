package httpx

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/jackc/pgx/v5/pgconn"
)

type ErrorResponse struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

// RespondError maps PostgreSQL QG-class errors to HTTP status codes.
func RespondError(w http.ResponseWriter, err error) {
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) {
		switch pgErr.Code {
		case "QG400":
			RespondJSON(w, http.StatusBadRequest, ErrorResponse{Code: "bad_request", Message: pgErr.Message})
			return
		case "QG401":
			RespondJSON(w, http.StatusUnauthorized, ErrorResponse{Code: "unauthorized", Message: pgErr.Message})
			return
		case "QG403":
			RespondJSON(w, http.StatusForbidden, ErrorResponse{Code: "forbidden", Message: pgErr.Message})
			return
		case "QG404":
			RespondJSON(w, http.StatusNotFound, ErrorResponse{Code: "not_found", Message: pgErr.Message})
			return
		case "QG409":
			RespondJSON(w, http.StatusConflict, ErrorResponse{Code: "conflict", Message: pgErr.Message})
			return
		case "QG422":
			RespondJSON(w, http.StatusUnprocessableEntity, ErrorResponse{Code: "unprocessable", Message: pgErr.Message})
			return
		case "QG429":
			RespondJSON(w, http.StatusTooManyRequests, ErrorResponse{Code: "too_many_requests", Message: pgErr.Message})
			return
		}
	}
	RespondJSON(w, http.StatusInternalServerError, ErrorResponse{Code: "server_error", Message: "error interno del servidor"})
}

func RespondJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(body) //nolint:errcheck
}
