package handlers

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/nespina/quagenticus/internal/auth"
	"github.com/nespina/quagenticus/internal/db"
	"github.com/nespina/quagenticus/internal/httpx"
	"github.com/nespina/quagenticus/internal/models"
)

type Journals struct {
	db *db.DB
}

func NewJournals(db *db.DB) *Journals {
	return &Journals{db: db}
}

func (h *Journals) ListByRequirement(w http.ResponseWriter, r *http.Request) {
	reqID := chi.URLParam(r, "id")
	if reqID == "" {
		http.Error(w, "missing requirement id", http.StatusBadRequest)
		return
	}

	rows, err := h.db.Pool.Query(r.Context(), `
		SELECT j.id, j.document_id, j.actor_type,
		       COALESCE(j.actor_user_id, j.actor_agent_id)::text,
		       COALESCE(u.display_name, 'Sistema'),
		       COALESCE(j.notes_md, ''), j.details, j.created_at
		FROM journal j
		LEFT JOIN app_user u ON j.actor_user_id = u.id
		WHERE j.document_id = $1
		ORDER BY j.created_at ASC
	`, reqID)
	if err != nil {
		httpx.RespondError(w, err)
		return
	}
	defer rows.Close()

	list := make([]models.JournalResponse, 0)
	for rows.Next() {
		var (
			j       models.JournalResponse
			actorID *string
		)
		if err := rows.Scan(&j.ID, &j.RequirementID, &j.ActorType, &actorID, &j.ActorName, &j.NotesMD, &j.Details, &j.CreatedAt); err != nil {
			httpx.RespondError(w, err)
			return
		}
		j.ActorID = actorID
		list = append(list, j)
	}

	httpx.RespondJSON(w, http.StatusOK, list)
}

func (h *Journals) Create(w http.ResponseWriter, r *http.Request) {
	reqID := chi.URLParam(r, "id")
	if reqID == "" {
		http.Error(w, "missing requirement id", http.StatusBadRequest)
		return
	}

	var req models.CreateJournalRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid json body", http.StatusBadRequest)
		return
	}
	if req.NotesMD == "" {
		http.Error(w, "notes_md cannot be empty", http.StatusBadRequest)
		return
	}

	actor := auth.ActorFrom(r.Context())

	var accountID string
	err := h.db.Pool.QueryRow(r.Context(), `SELECT account_id FROM document WHERE id = $1`, reqID).Scan(&accountID)
	if err != nil {
		if err == pgx.ErrNoRows {
			http.Error(w, "requirement not found", http.StatusNotFound)
			return
		}
		httpx.RespondError(w, err)
		return
	}

	var (
		j       models.JournalResponse
		actorID *string
	)
	err = h.db.Pool.QueryRow(r.Context(), `
		INSERT INTO journal (document_id, account_id, actor_type, actor_user_id, notes_md, details)
		VALUES ($1, $2, 'user', $3, $4, '[]'::jsonb)
		RETURNING id, document_id, actor_type, actor_user_id::text,
		          (SELECT display_name FROM app_user WHERE id = $3),
		          COALESCE(notes_md, ''), details, created_at
	`, reqID, accountID, actor.ID, req.NotesMD).Scan(
		&j.ID, &j.RequirementID, &j.ActorType, &actorID, &j.ActorName, &j.NotesMD, &j.Details, &j.CreatedAt,
	)
	if err != nil {
		httpx.RespondError(w, err)
		return
	}
	j.ActorID = actorID

	httpx.RespondJSON(w, http.StatusCreated, j)
}
