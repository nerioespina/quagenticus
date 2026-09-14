package httpx

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"regexp"
	"strconv"
	"strings"

	"github.com/go-playground/validator/v10"
)

var validate = validator.New()

var uuidRe = regexp.MustCompile(`^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$`)

// IsUUID reports whether s is a canonical UUID.
func IsUUID(s string) bool { return uuidRe.MatchString(s) }

// Decode reads a JSON body into v and validates struct tags.
func Decode(r *http.Request, v any) error {
	dec := json.NewDecoder(r.Body)
	if err := dec.Decode(v); err != nil {
		var maxBytes *http.MaxBytesError
		if errors.As(err, &maxBytes) {
			return err
		}
		if errors.Is(err, io.EOF) {
			return BadRequest("el cuerpo de la petición está vacío")
		}
		return BadRequest("payload inválido")
	}
	if err := validate.Struct(v); err != nil {
		var invalid *validator.InvalidValidationError
		if errors.As(err, &invalid) {
			return nil // non-struct values (maps) are not validated
		}
		return BadRequest(validationMessage(err))
	}
	return nil
}

// DecodeObject reads a JSON object body keeping only the allowed keys.
// Keys present with null values are preserved (PATCH semantics).
func DecodeObject(r *http.Request, allowed ...string) (map[string]json.RawMessage, error) {
	var raw map[string]json.RawMessage
	if err := json.NewDecoder(r.Body).Decode(&raw); err != nil {
		var maxBytes *http.MaxBytesError
		if errors.As(err, &maxBytes) {
			return nil, err
		}
		return nil, BadRequest("payload inválido: se esperaba un objeto JSON")
	}
	out := make(map[string]json.RawMessage, len(raw))
	for _, k := range allowed {
		if v, ok := raw[k]; ok {
			out[k] = v
		}
	}
	return out, nil
}

func validationMessage(err error) string {
	var verrs validator.ValidationErrors
	if !errors.As(err, &verrs) || len(verrs) == 0 {
		return "datos inválidos"
	}
	fe := verrs[0]
	field := strings.ToLower(fe.Field())
	switch fe.Tag() {
	case "required":
		return "el campo " + field + " es obligatorio"
	case "uuid":
		return "el campo " + field + " debe ser un identificador válido"
	case "email":
		return "el correo no es válido"
	case "min":
		return "el campo " + field + " es demasiado corto"
	case "max":
		return "el campo " + field + " es demasiado largo"
	case "oneof":
		return "el valor de " + field + " no es válido"
	}
	return "el campo " + field + " no es válido"
}

// QueryInt parses an integer query parameter with bounds.
func QueryInt(r *http.Request, name string, def, min, max int) int {
	v, err := strconv.Atoi(r.URL.Query().Get(name))
	if err != nil {
		return def
	}
	if v < min {
		return min
	}
	if v > max {
		return max
	}
	return v
}

// QueryList splits a comma-separated query parameter.
func QueryList(r *http.Request, name string) []string {
	v := strings.TrimSpace(r.URL.Query().Get(name))
	if v == "" {
		return nil
	}
	parts := strings.Split(v, ",")
	out := parts[:0]
	for _, p := range parts {
		if p = strings.TrimSpace(p); p != "" {
			out = append(out, p)
		}
	}
	return out
}
