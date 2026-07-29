package handlers

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/nespina/quagenticus/internal/db"
	"github.com/nespina/quagenticus/internal/httpx"
	"github.com/nespina/quagenticus/internal/models"
)

type Links struct {
	db *db.DB
}

func NewLinks(db *db.DB) *Links {
	return &Links{db: db}
}

func (h *Links) ListByRequirement(w http.ResponseWriter, r *http.Request) {
	reqID := chi.URLParam(r, "id")
	if reqID == "" {
		http.Error(w, "missing requirement id", http.StatusBadRequest)
		return
	}

	rows, err := h.db.Pool.Query(r.Context(), `
		SELECT dl.id, dl.source_id, dl.target_id,
		       COALESCE(d.title, 'Documento'),
		       COALESCE(d.slug, ''),
		       d.doc_type::text,
		       dl.link_type::text,
		       COALESCE(dl.note, ''),
		       dl.created_at
		FROM document_link dl
		JOIN document d ON (
		  CASE WHEN dl.source_id = $1 THEN d.id = dl.target_id
		       ELSE d.id = dl.source_id END
		)
		WHERE dl.source_id = $1 OR dl.target_id = $1
		ORDER BY dl.created_at DESC
	`, reqID)
	if err != nil {
		httpx.RespondError(w, err)
		return
	}
	defer rows.Close()

	list := make([]models.DocumentLinkResponse, 0)
	for rows.Next() {
		var l models.DocumentLinkResponse
		if err := rows.Scan(
			&l.ID, &l.SourceID, &l.TargetID, &l.TargetTitle,
			&l.TargetSlug, &l.TargetType, &l.LinkType, &l.Note, &l.CreatedAt,
		); err != nil {
			httpx.RespondError(w, err)
			return
		}
		list = append(list, l)
	}

	httpx.RespondJSON(w, http.StatusOK, list)
}

func (h *Links) Create(w http.ResponseWriter, r *http.Request) {
	reqID := chi.URLParam(r, "id")
	if reqID == "" {
		http.Error(w, "missing requirement id", http.StatusBadRequest)
		return
	}

	var req models.CreateDocumentLinkRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid json body", http.StatusBadRequest)
		return
	}
	if req.TargetID == "" {
		http.Error(w, "target_id required", http.StatusBadRequest)
		return
	}
	if req.LinkType == "" {
		req.LinkType = "relates"
	}

	var l models.DocumentLinkResponse
	err := h.db.Pool.QueryRow(r.Context(), `
		INSERT INTO document_link (source_id, target_id, link_type, note, is_derived)
		VALUES ($1, $2, $3, $4, false)
		RETURNING id, source_id, target_id,
		          (SELECT title FROM document WHERE id = $2),
		          (SELECT slug FROM document WHERE id = $2),
		          (SELECT doc_type::text FROM document WHERE id = $2),
		          link_type::text, COALESCE(note, ''), created_at
	`, reqID, req.TargetID, req.LinkType, req.Note).Scan(
		&l.ID, &l.SourceID, &l.TargetID, &l.TargetTitle,
		&l.TargetSlug, &l.TargetType, &l.LinkType, &l.Note, &l.CreatedAt,
	)
	if err != nil {
		httpx.RespondError(w, err)
		return
	}

	httpx.RespondJSON(w, http.StatusCreated, l)
}

func (h *Links) Delete(w http.ResponseWriter, r *http.Request) {
	reqID := chi.URLParam(r, "id")
	linkID := chi.URLParam(r, "linkId")

	_, err := h.db.Pool.Exec(r.Context(), `
		DELETE FROM document_link
		WHERE id = $1 AND (source_id = $2 OR target_id = $2)
	`, linkID, reqID)
	if err != nil {
		httpx.RespondError(w, err)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}
