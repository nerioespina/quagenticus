package httpx

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

type ErrorResponse struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

// Error is an application error with an explicit HTTP status.
type Error struct {
	Status  int
	Code    string
	Message string
}

func (e *Error) Error() string { return e.Message }

func NewError(status int, code, message string) *Error {
	return &Error{Status: status, Code: code, Message: message}
}

var (
	ErrNotFound     = NewError(http.StatusNotFound, "not_found", "recurso no encontrado")
	ErrForbidden    = NewError(http.StatusForbidden, "forbidden", "no tienes permiso para esta acción")
	ErrUnauthorized = NewError(http.StatusUnauthorized, "unauthorized", "autenticación requerida")
)

func BadRequest(message string) *Error {
	return NewError(http.StatusBadRequest, "bad_request", message)
}

// RespondError maps application, pgx and PostgreSQL errors to HTTP responses.
// Custom QGnnn SQLSTATEs raised by database functions carry their HTTP status.
func RespondError(w http.ResponseWriter, err error) {
	var appErr *Error
	if errors.As(err, &appErr) {
		RespondJSON(w, appErr.Status, ErrorResponse{Code: appErr.Code, Message: appErr.Message})
		return
	}
	if errors.Is(err, pgx.ErrNoRows) {
		RespondJSON(w, http.StatusNotFound, ErrorResponse{Code: "not_found", Message: "recurso no encontrado"})
		return
	}
	var maxBytes *http.MaxBytesError
	if errors.As(err, &maxBytes) {
		RespondJSON(w, http.StatusRequestEntityTooLarge, ErrorResponse{Code: "too_large", Message: "el contenido excede el tamaño permitido"})
		return
	}

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
		case "22P02", "22007", "22008", "22003":
			// invalid_text_representation (bad uuid/enum), datetime format, numeric range
			RespondJSON(w, http.StatusBadRequest, ErrorResponse{Code: "bad_request", Message: "valor con formato inválido"})
			return
		case "23505":
			RespondJSON(w, http.StatusConflict, ErrorResponse{Code: "conflict", Message: "ya existe un registro con esos datos"})
			return
		case "23503":
			RespondJSON(w, http.StatusUnprocessableEntity, ErrorResponse{Code: "unprocessable", Message: "hace referencia a un registro inexistente o en uso"})
			return
		case "23514", "23502":
			RespondJSON(w, http.StatusUnprocessableEntity, ErrorResponse{Code: "unprocessable", Message: "los datos no cumplen las reglas de validación"})
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

// RespondRawJSON writes JSON produced by the database as-is.
func RespondRawJSON(w http.ResponseWriter, status int, raw []byte) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	w.Write(raw) //nolint:errcheck
}
