package handlers

import (
	"encoding/json"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/nespina/quagenticus/internal/db"
	"github.com/nespina/quagenticus/internal/httpx"
)

type Categories struct {
	db *db.DB
}

func NewCategories(db *db.DB) *Categories {
	return &Categories{db: db}
}

type categoryRow struct {
	ID          string  `json:"id"`
	SpaceID     string  `json:"space_id"`
	Name        string  `json:"name"`
	Slug        string  `json:"slug"`
	Description *string `json:"description"`
}

func (h *Categories) List(w http.ResponseWriter, r *http.Request) {
	spaceID := chi.URLParam(r, "spaceId")
	rows, err := h.db.Pool.Query(r.Context(), `
		SELECT id, space_id, name, slug, description
		FROM category
		WHERE space_id = $1 AND is_active = true
		ORDER BY ord, name
	`, spaceID)
	if err != nil {
		httpx.RespondError(w, err)
		return
	}
	defer rows.Close()

	list := make([]categoryRow, 0)
	for rows.Next() {
		var c categoryRow
		if err := rows.Scan(&c.ID, &c.SpaceID, &c.Name, &c.Slug, &c.Description); err != nil {
			httpx.RespondError(w, err)
			return
		}
		list = append(list, c)
	}
	httpx.RespondJSON(w, http.StatusOK, list)
}

func (h *Categories) Create(w http.ResponseWriter, r *http.Request) {
	spaceID := chi.URLParam(r, "spaceId")
	var req struct {
		Name        string  `json:"name"`
		Slug        string  `json:"slug"`
		Description *string `json:"description"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Name == "" {
		http.Error(w, "invalid json or missing name", http.StatusBadRequest)
		return
	}
	if req.Slug == "" {
		req.Slug = strings.ToLower(strings.ReplaceAll(req.Name, " ", "-"))
	}

	var c categoryRow
	err := h.db.Pool.QueryRow(r.Context(), `
		INSERT INTO category (space_id, name, slug, description)
		VALUES ($1, $2, $3, $4)
		RETURNING id, space_id, name, slug, description
	`, spaceID, req.Name, req.Slug, req.Description).Scan(
		&c.ID, &c.SpaceID, &c.Name, &c.Slug, &c.Description,
	)
	if err != nil {
		httpx.RespondError(w, err)
		return
	}
	httpx.RespondJSON(w, http.StatusCreated, c)
}

func (h *Categories) Update(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var req struct {
		Name        *string `json:"name"`
		Description *string `json:"description"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid json", http.StatusBadRequest)
		return
	}

	_, err := h.db.Pool.Exec(r.Context(), `
		UPDATE category
		SET name = COALESCE($2, name),
		    description = COALESCE($3, description)
		WHERE id = $1
	`, id, req.Name, req.Description)
	if err != nil {
		httpx.RespondError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *Categories) Delete(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	_, err := h.db.Pool.Exec(r.Context(), `DELETE FROM category WHERE id = $1`, id)
	if err != nil {
		httpx.RespondError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
