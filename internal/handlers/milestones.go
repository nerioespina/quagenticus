package handlers

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/nespina/quagenticus/internal/db"
	"github.com/nespina/quagenticus/internal/httpx"
)

type Milestones struct {
	db *db.DB
}

func NewMilestones(db *db.DB) *Milestones {
	return &Milestones{db: db}
}

type milestoneRow struct {
	ID          string  `json:"id"`
	SpaceID     string  `json:"space_id"`
	Name        string  `json:"name"`
	Description *string `json:"description"`
	DueDate     *string `json:"due_date"`
	Status      string  `json:"status"`
}

func (h *Milestones) List(w http.ResponseWriter, r *http.Request) {
	spaceID := chi.URLParam(r, "spaceId")
	rows, err := h.db.Pool.Query(r.Context(), `
		SELECT id, space_id, name, description, due_date::text, status
		FROM milestone
		WHERE space_id = $1
		ORDER BY name
	`, spaceID)
	if err != nil {
		httpx.RespondError(w, err)
		return
	}
	defer rows.Close()

	list := make([]milestoneRow, 0)
	for rows.Next() {
		var m milestoneRow
		if err := rows.Scan(&m.ID, &m.SpaceID, &m.Name, &m.Description, &m.DueDate, &m.Status); err != nil {
			httpx.RespondError(w, err)
			return
		}
		list = append(list, m)
	}
	httpx.RespondJSON(w, http.StatusOK, list)
}

func (h *Milestones) Create(w http.ResponseWriter, r *http.Request) {
	spaceID := chi.URLParam(r, "spaceId")
	var req struct {
		Name        string  `json:"name"`
		Description *string `json:"description"`
		DueDate     *string `json:"due_date"`
		Status      string  `json:"status"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Name == "" {
		http.Error(w, "invalid json or missing name", http.StatusBadRequest)
		return
	}
	if req.Status == "" {
		req.Status = "open"
	}

	var m milestoneRow
	err := h.db.Pool.QueryRow(r.Context(), `
		INSERT INTO milestone (space_id, name, description, due_date, status)
		VALUES ($1, $2, $3, $4, $5)
		RETURNING id, space_id, name, description, due_date::text, status
	`, spaceID, req.Name, req.Description, req.DueDate, req.Status).Scan(
		&m.ID, &m.SpaceID, &m.Name, &m.Description, &m.DueDate, &m.Status,
	)
	if err != nil {
		httpx.RespondError(w, err)
		return
	}
	httpx.RespondJSON(w, http.StatusCreated, m)
}

func (h *Milestones) Update(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var req struct {
		Name        *string `json:"name"`
		Description *string `json:"description"`
		DueDate     *string `json:"due_date"`
		Status      *string `json:"status"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid json", http.StatusBadRequest)
		return
	}

	_, err := h.db.Pool.Exec(r.Context(), `
		UPDATE milestone
		SET name = COALESCE($2, name),
		    description = COALESCE($3, description),
		    due_date = COALESCE($4, due_date),
		    status = COALESCE($5, status)
		WHERE id = $1
	`, id, req.Name, req.Description, req.DueDate, req.Status)
	if err != nil {
		httpx.RespondError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *Milestones) Delete(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	_, err := h.db.Pool.Exec(r.Context(), `DELETE FROM milestone WHERE id = $1`, id)
	if err != nil {
		httpx.RespondError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
