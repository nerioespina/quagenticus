package handlers

import (
	"encoding/json"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/nespina/quagenticus/internal/auth"
	"github.com/nespina/quagenticus/internal/db"
	"github.com/nespina/quagenticus/internal/httpx"
	"github.com/nespina/quagenticus/internal/models"
)

type Requirements struct {
	db *db.DB
}

func NewRequirements(db *db.DB) *Requirements {
	return &Requirements{db: db}
}

func (h *Requirements) List(w http.ResponseWriter, r *http.Request) {
	spaceID := chi.URLParam(r, "spaceId")
	q := r.URL.Query()
	statusID := q.Get("status_id")
	priorityID := q.Get("priority_id")

	query := `
		SELECT r.document_id, d.space_id, r.account_id, d.ref_key,
		       d.title, d.body_md,
		       r.tracker_id, r.status_id, r.priority_id,
		       r.category_id, r.milestone_id, r.reporter_id,
		       r.lead_user_id, r.board_position, r.readiness_score,
		       r.created_at, r.updated_at
		FROM requirement r
		JOIN document d ON d.id = r.document_id
		WHERE r.space_id = $1 AND d.is_archived = false
	`
	args := []any{spaceID}
	idx := 2
	if statusID != "" {
		query += ` AND r.status_id = $` + itoa(idx)
		args = append(args, statusID)
		idx++
	}
	if priorityID != "" {
		query += ` AND r.priority_id = $` + itoa(idx)
		args = append(args, priorityID)
		idx++
	}
	query += ` ORDER BY r.board_position, r.created_at`

	rows, err := h.db.Pool.Query(r.Context(), query, args...)
	if err != nil {
		httpx.RespondError(w, err)
		return
	}
	defer rows.Close()

	list := make([]models.RequirementResponse, 0)
	for rows.Next() {
		var rr models.RequirementResponse
		if err := rows.Scan(
			&rr.DocumentID, &rr.SpaceID, &rr.AccountID, &rr.RefKey,
			&rr.Title, &rr.BodyMD,
			&rr.TrackerID, &rr.StatusID, &rr.PriorityID,
			&rr.CategoryID, &rr.MilestoneID, &rr.ReporterID,
			&rr.LeadUserID, &rr.BoardPosition, &rr.ReadinessScore,
			&rr.CreatedAt, &rr.UpdatedAt,
		); err != nil {
			httpx.RespondError(w, err)
			return
		}
		list = append(list, rr)
	}

	httpx.RespondJSON(w, http.StatusOK, list)
}

func (h *Requirements) Create(w http.ResponseWriter, r *http.Request) {
	spaceID := chi.URLParam(r, "spaceId")
	actor := auth.ActorFrom(r.Context())

	var in models.RequirementCreate
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		httpx.RespondJSON(w, http.StatusBadRequest, httpx.ErrorResponse{Code: "bad_request", Message: "payload inválido"})
		return
	}
	if err := validate.Struct(in); err != nil {
		httpx.RespondJSON(w, http.StatusBadRequest, httpx.ErrorResponse{Code: "bad_request", Message: err.Error()})
		return
	}

	// PostgreSQL MVCC: a JOIN in the same statement as a data-modifying function
	// can't see the rows that function just inserted (same snapshot). Use two
	// separate statements within the same transaction instead.
	var out models.RequirementResponse
	err := h.db.WithActor(r.Context(), actor, func(tx pgx.Tx) error {
		var docID string
		if err := tx.QueryRow(r.Context(),
			`SELECT document_id FROM requirement_create($1, $2, $3, $4, $5, $6)`,
			spaceID, in.TrackerID, in.Title, in.BodyMD, in.PriorityID, in.CategoryID,
		).Scan(&docID); err != nil {
			return err
		}
		return tx.QueryRow(r.Context(), `
			SELECT r.document_id, d.space_id, r.account_id, d.ref_key,
			       d.title, d.body_md,
			       r.tracker_id, r.status_id, r.priority_id,
			       r.category_id, r.milestone_id, r.reporter_id,
			       r.lead_user_id, r.board_position, r.readiness_score,
			       r.created_at, r.updated_at
			FROM requirement r
			JOIN document d ON d.id = r.document_id
			WHERE r.document_id = $1
		`, docID).Scan(
			&out.DocumentID, &out.SpaceID, &out.AccountID, &out.RefKey,
			&out.Title, &out.BodyMD,
			&out.TrackerID, &out.StatusID, &out.PriorityID,
			&out.CategoryID, &out.MilestoneID, &out.ReporterID,
			&out.LeadUserID, &out.BoardPosition, &out.ReadinessScore,
			&out.CreatedAt, &out.UpdatedAt,
		)
	})
	if err != nil {
		httpx.RespondError(w, err)
		return
	}

	httpx.RespondJSON(w, http.StatusCreated, out)
}

func (h *Requirements) Get(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	var out models.RequirementResponse
	err := h.db.Pool.QueryRow(r.Context(), `
		SELECT r.document_id, d.space_id, r.account_id, d.ref_key,
		       d.title, d.body_md,
		       r.tracker_id, r.status_id, r.priority_id,
		       r.category_id, r.milestone_id, r.reporter_id,
		       r.lead_user_id, r.board_position, r.readiness_score,
		       r.created_at, r.updated_at
		FROM requirement r
		JOIN document d ON d.id = r.document_id
		WHERE r.document_id = $1
	`, id).Scan(
		&out.DocumentID, &out.SpaceID, &out.AccountID, &out.RefKey,
		&out.Title, &out.BodyMD,
		&out.TrackerID, &out.StatusID, &out.PriorityID,
		&out.CategoryID, &out.MilestoneID, &out.ReporterID,
		&out.LeadUserID, &out.BoardPosition, &out.ReadinessScore,
		&out.CreatedAt, &out.UpdatedAt,
	)
	if err != nil {
		httpx.RespondError(w, err)
		return
	}

	httpx.RespondJSON(w, http.StatusOK, out)
}

func (h *Requirements) Update(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	actor := auth.ActorFrom(r.Context())

	var in models.RequirementUpdate
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		httpx.RespondJSON(w, http.StatusBadRequest, httpx.ErrorResponse{Code: "bad_request", Message: "payload inválido"})
		return
	}

	err := h.db.WithActor(r.Context(), actor, func(tx pgx.Tx) error {
		_, err := tx.Exec(r.Context(), `
			SELECT requirement_update($1, $2, $3, $4, $5)
		`, id, in.Title, in.BodyMD, in.PriorityID, in.CategoryID)
		return err
	})
	if err != nil {
		httpx.RespondError(w, err)
		return
	}

	h.Get(w, r)
}

func (h *Requirements) Transition(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	actor := auth.ActorFrom(r.Context())

	var in models.TransitionRequest
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		httpx.RespondJSON(w, http.StatusBadRequest, httpx.ErrorResponse{Code: "bad_request", Message: "payload inválido"})
		return
	}
	if err := validate.Struct(in); err != nil {
		httpx.RespondJSON(w, http.StatusBadRequest, httpx.ErrorResponse{Code: "bad_request", Message: err.Error()})
		return
	}

	err := h.db.WithActor(r.Context(), actor, func(tx pgx.Tx) error {
		_, err := tx.Exec(r.Context(),
			`SELECT requirement_transition($1, $2, $3)`,
			id, in.ToStatusID, in.Comment)
		return err
	})
	if err != nil {
		httpx.RespondError(w, err)
		return
	}

	h.Get(w, r)
}

func (h *Requirements) AddMember(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	actor := auth.ActorFrom(r.Context())

	var in models.MemberAdd
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		httpx.RespondJSON(w, http.StatusBadRequest, httpx.ErrorResponse{Code: "bad_request", Message: "payload inválido"})
		return
	}
	if err := validate.Struct(in); err != nil {
		httpx.RespondJSON(w, http.StatusBadRequest, httpx.ErrorResponse{Code: "bad_request", Message: err.Error()})
		return
	}

	err := h.db.WithActor(r.Context(), actor, func(tx pgx.Tx) error {
		_, err := tx.Exec(r.Context(), `
			INSERT INTO requirement_member (document_id, subject_type, subject_id, is_lead, added_by)
			VALUES ($1, $2, $3, $4, current_setting('qg.actor_id')::uuid)
			ON CONFLICT (document_id, subject_type, subject_id) DO UPDATE SET is_lead = $4
		`, id, in.SubjectType, in.SubjectID, in.IsLead)
		return err
	})
	if err != nil {
		httpx.RespondError(w, err)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

func (h *Requirements) RemoveMember(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	userID := chi.URLParam(r, "userId")
	actor := auth.ActorFrom(r.Context())

	err := h.db.WithActor(r.Context(), actor, func(tx pgx.Tx) error {
		_, err := tx.Exec(r.Context(), `
			DELETE FROM requirement_member
			WHERE document_id = $1 AND subject_id = $2
		`, id, userID)
		return err
	})
	if err != nil {
		httpx.RespondError(w, err)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

func (h *Requirements) Readiness(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	var score *int
	var report map[string]interface{}
	err := h.db.Pool.QueryRow(r.Context(), `
		SELECT readiness_score, readiness_report FROM requirement WHERE document_id = $1
	`, id).Scan(&score, &report)
	if err != nil {
		httpx.RespondError(w, err)
		return
	}

	s := 0
	if score != nil {
		s = *score
	}
	httpx.RespondJSON(w, http.StatusOK, models.ReadinessResponse{Score: s, Report: report})
}

func (h *Requirements) UpdatePosition(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	actor := auth.ActorFrom(r.Context())

	var in models.PositionUpdate
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		httpx.RespondJSON(w, http.StatusBadRequest, httpx.ErrorResponse{Code: "bad_request", Message: "payload inválido"})
		return
	}

	err := h.db.WithActor(r.Context(), actor, func(tx pgx.Tx) error {
		_, err := tx.Exec(r.Context(),
			`SELECT requirement_reorder($1, $2, $3)`,
			id, in.Before, in.After)
		return err
	})
	if err != nil {
		httpx.RespondError(w, err)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

func itoa(n int) string {
	return strconv.Itoa(n)
}
