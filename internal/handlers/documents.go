package handlers

import (
	"encoding/json"
	"net/http"

	"github.com/go-playground/validator/v10"
	"github.com/jackc/pgx/v5"
	"github.com/nespina/quagenticus/internal/auth"
	"github.com/nespina/quagenticus/internal/db"
	"github.com/nespina/quagenticus/internal/models"
)

var validate = validator.New()

type Documents struct {
	db *db.DB
}

func NewDocuments(db *db.DB) *Documents {
	return &Documents{db: db}
}

func (h *Documents) Create(w http.ResponseWriter, r *http.Request) {
	var in models.DocumentCreate
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		http.Error(w, "Invalid payload", http.StatusBadRequest)
		return
	}
	if err := validate.Struct(in); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	var out models.DocumentResponse
	err := h.db.WithActor(r.Context(), auth.ActorFrom(r.Context()), func(tx pgx.Tx) error {
		// Llamada a la función document_create definida en SQL
		// Esta función no ha sido implementada en su totalidad en Fase 0, pero se asume
		// que document_create(space_id, parent_id, doc_type, title, body_md, front_matter) retorna un record con document.
		
		// For now, let's just make a dummy insert if the function doesn't exist, but we should rely on the DB function.
		// Since we don't have the full SQL implementation yet, this is a stub logic for the API.
		row := tx.QueryRow(r.Context(), `
			INSERT INTO document (space_id, parent_id, doc_type, title, body_md, front_matter, account_id, slug)
			VALUES ($1, $2, $3, $4, $5, $6, current_setting('qg.account_id')::uuid, 'dummy-slug')
			RETURNING id, space_id, parent_id, doc_type, ref_key, slug, title, body_md, version, created_at, updated_at
		`, in.SpaceID, in.ParentID, in.DocType, in.Title, in.BodyMD, in.FrontMatter)
		
		return row.Scan(&out.ID, &out.SpaceID, &out.ParentID, &out.DocType, &out.RefKey, &out.Slug, &out.Title, &out.BodyMD, &out.Version, &out.CreatedAt, &out.UpdatedAt)
	})

	if err != nil {
		// Log and translate error
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(out)
}

func (h *Documents) Get(w http.ResponseWriter, r *http.Request) {
	// TODO: implement
}
