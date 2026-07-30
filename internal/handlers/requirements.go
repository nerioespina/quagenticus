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
		       r.tracker_id, r.status_id, ws.key AS status_key, ws.name AS status_name,
		       r.priority_id, pr.key AS priority_key, pr.name AS priority_name,
		       r.category_id, r.milestone_id, r.reporter_id,
		       r.lead_user_id, r.board_position, r.readiness_score,
		       r.done_ratio, r.estimated_hours, r.spent_hours,
		       r.start_date::text, r.due_date::text,
		       r.created_at, r.updated_at
		FROM requirement r
		JOIN document d ON d.id = r.document_id
		JOIN workflow_status ws ON ws.id = r.status_id
		JOIN priority pr ON pr.id = r.priority_id
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
			&rr.TrackerID, &rr.StatusID, &rr.StatusKey, &rr.StatusName,
			&rr.PriorityID, &rr.PriorityKey, &rr.PriorityName,
			&rr.CategoryID, &rr.MilestoneID, &rr.ReporterID,
			&rr.LeadUserID, &rr.BoardPosition, &rr.ReadinessScore,
			&rr.DoneRatio, &rr.EstimatedHours, &rr.SpentHours,
			&rr.StartDate, &rr.DueDate,
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
		if in.MilestoneID != nil || in.ParentID != nil {
			if _, err := tx.Exec(r.Context(), `
				UPDATE requirement SET
					milestone_id = COALESCE($2, milestone_id),
					parent_id    = COALESCE($3, parent_id)
				WHERE document_id = $1
			`, docID, in.MilestoneID, in.ParentID); err != nil {
				return err
			}
		}
		return tx.QueryRow(r.Context(), `
			SELECT r.document_id, d.space_id, r.account_id, d.ref_key,
			       d.title, d.body_md,
			       r.tracker_id, r.status_id, ws.key AS status_key, ws.name AS status_name,
			       r.priority_id, pr.key AS priority_key, pr.name AS priority_name,
			       r.category_id, r.milestone_id, r.reporter_id,
			       r.lead_user_id, r.board_position, r.readiness_score,
			       r.done_ratio, r.estimated_hours, r.spent_hours,
			       r.start_date::text, r.due_date::text,
			       r.created_at, r.updated_at
			FROM requirement r
			JOIN document d ON d.id = r.document_id
			JOIN workflow_status ws ON ws.id = r.status_id
			JOIN priority pr ON pr.id = r.priority_id
			WHERE r.document_id = $1
		`, docID).Scan(
			&out.DocumentID, &out.SpaceID, &out.AccountID, &out.RefKey,
			&out.Title, &out.BodyMD,
			&out.TrackerID, &out.StatusID, &out.StatusKey, &out.StatusName,
			&out.PriorityID, &out.PriorityKey, &out.PriorityName,
			&out.CategoryID, &out.MilestoneID, &out.ReporterID,
			&out.LeadUserID, &out.BoardPosition, &out.ReadinessScore,
			&out.DoneRatio, &out.EstimatedHours, &out.SpentHours,
			&out.StartDate, &out.DueDate,
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
		       r.tracker_id, r.status_id, ws.key AS status_key, ws.name AS status_name,
		       r.priority_id, pr.key AS priority_key, pr.name AS priority_name,
		       r.category_id, r.milestone_id, r.reporter_id,
		       r.lead_user_id, r.board_position, r.readiness_score,
		       r.done_ratio, r.estimated_hours, r.spent_hours,
		       r.start_date::text, r.due_date::text,
		       r.created_at, r.updated_at
		FROM requirement r
		JOIN document d ON d.id = r.document_id
		JOIN workflow_status ws ON ws.id = r.status_id
		JOIN priority pr ON pr.id = r.priority_id
		WHERE r.document_id = $1
	`, id).Scan(
		&out.DocumentID, &out.SpaceID, &out.AccountID, &out.RefKey,
		&out.Title, &out.BodyMD,
		&out.TrackerID, &out.StatusID, &out.StatusKey, &out.StatusName,
		&out.PriorityID, &out.PriorityKey, &out.PriorityName,
		&out.CategoryID, &out.MilestoneID, &out.ReporterID,
		&out.LeadUserID, &out.BoardPosition, &out.ReadinessScore,
		&out.DoneRatio, &out.EstimatedHours, &out.SpentHours,
		&out.StartDate, &out.DueDate,
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
		if err != nil {
			return err
		}
		_, err = tx.Exec(r.Context(), `
			UPDATE requirement
			SET milestone_id = COALESCE($2, milestone_id),
			    done_ratio = COALESCE($3, done_ratio),
			    estimated_hours = COALESCE($4, estimated_hours),
			    spent_hours = COALESCE($5, spent_hours),
			    start_date = COALESCE($6::date, start_date),
			    due_date = COALESCE($7::date, due_date)
			WHERE document_id = $1
		`, id, in.MilestoneID, in.DoneRatio, in.EstimatedHours, in.SpentHours, in.StartDate, in.DueDate)
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

func (h *Requirements) Move(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	actor := auth.ActorFrom(r.Context())

	var in models.MoveRequest
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		httpx.RespondJSON(w, http.StatusBadRequest, httpx.ErrorResponse{Code: "bad_request", Message: "payload inválido"})
		return
	}

	err := h.db.WithActor(r.Context(), actor, func(tx pgx.Tx) error {
		_, err := tx.Exec(r.Context(),
			`SELECT requirement_move($1, $2, $3, $4)`,
			id, in.ToStatusID, in.BeforeID, in.AfterID)
		return err
	})
	if err != nil {
		httpx.RespondError(w, err)
		return
	}

	h.Get(w, r)
}

type MemberResponse struct {
	SubjectType string `json:"subject_type"`
	SubjectID   string `json:"subject_id"`
	IsLead      bool   `json:"is_lead"`
	AddedAt     string `json:"added_at"`
	DisplayName string `json:"display_name"`
	Email       string `json:"email"`
}

func (h *Requirements) ListMembers(w http.ResponseWriter, r *http.Request) {
	docID := chi.URLParam(r, "id")
	rows, err := h.db.Pool.Query(r.Context(), `
		SELECT rm.subject_type, rm.subject_id, rm.is_lead, rm.added_at::text,
		       COALESCE(u.display_name, '') AS display_name,
		       COALESCE(u.email, '') AS email
		FROM requirement_member rm
		LEFT JOIN app_user u ON u.id = rm.subject_id AND rm.subject_type = 'user'
		WHERE rm.document_id = $1
		ORDER BY rm.is_lead DESC, rm.added_at
	`, docID)
	if err != nil {
		httpx.RespondError(w, err)
		return
	}
	defer rows.Close()

	list := make([]MemberResponse, 0)
	for rows.Next() {
		var m MemberResponse
		if err := rows.Scan(&m.SubjectType, &m.SubjectID, &m.IsLead, &m.AddedAt, &m.DisplayName, &m.Email); err != nil {
			httpx.RespondError(w, err)
			return
		}
		list = append(list, m)
	}

	httpx.RespondJSON(w, http.StatusOK, list)
}

type SetLeadRequest struct {
	LeadUserID *string `json:"lead_user_id"`
}

func (h *Requirements) SetLead(w http.ResponseWriter, r *http.Request) {
	docID := chi.URLParam(r, "id")
	var req SetLeadRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid json", http.StatusBadRequest)
		return
	}

	_, err := h.db.Pool.Exec(r.Context(), `
		UPDATE requirement SET lead_user_id = $2 WHERE id = $1
	`, docID, req.LeadUserID)
	if err != nil {
		httpx.RespondError(w, err)
		return
	}

	h.Get(w, r)
}

func (h *Requirements) ListChildren(w http.ResponseWriter, r *http.Request) {
	parentID := chi.URLParam(r, "id")
	query := `
		SELECT r.document_id, d.space_id, r.account_id, d.ref_key,
		       d.title, d.body_md,
		       r.tracker_id, r.status_id, ws.key AS status_key, ws.name AS status_name,
		       r.priority_id, pr.key AS priority_key, pr.name AS priority_name,
		       r.category_id, r.milestone_id, r.reporter_id,
		       r.lead_user_id, r.board_position, r.readiness_score,
		       r.done_ratio, r.estimated_hours, r.spent_hours,
		       r.start_date::text, r.due_date::text,
		       r.created_at, r.updated_at
		FROM requirement r
		JOIN document d ON d.id = r.document_id
		JOIN workflow_status ws ON ws.id = r.status_id
		JOIN priority pr ON pr.id = r.priority_id
		WHERE r.parent_id = $1 AND d.is_archived = false
		ORDER BY r.board_position, r.created_at
	`
	rows, err := h.db.Pool.Query(r.Context(), query, parentID)
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
			&rr.TrackerID, &rr.StatusID, &rr.StatusKey, &rr.StatusName,
			&rr.PriorityID, &rr.PriorityKey, &rr.PriorityName,
			&rr.CategoryID, &rr.MilestoneID, &rr.ReporterID,
			&rr.LeadUserID, &rr.BoardPosition, &rr.ReadinessScore,
			&rr.DoneRatio, &rr.EstimatedHours, &rr.SpentHours,
			&rr.StartDate, &rr.DueDate,
			&rr.CreatedAt, &rr.UpdatedAt,
		); err != nil {
			httpx.RespondError(w, err)
			return
		}
		list = append(list, rr)
	}
	httpx.RespondJSON(w, http.StatusOK, list)
}

func (h *Requirements) ListLabels(w http.ResponseWriter, r *http.Request) {
	docID := chi.URLParam(r, "id")
	type labelRow struct {
		ID    string `json:"id"`
		Name  string `json:"name"`
		Color string `json:"color"`
	}
	rows, err := h.db.Pool.Query(r.Context(), `
		SELECT l.id, l.name, l.color
		FROM document_label dl
		JOIN label l ON l.id = dl.label_id
		WHERE dl.document_id = $1
		ORDER BY l.name
	`, docID)
	if err != nil {
		httpx.RespondError(w, err)
		return
	}
	defer rows.Close()

	list := make([]labelRow, 0)
	for rows.Next() {
		var lr labelRow
		if err := rows.Scan(&lr.ID, &lr.Name, &lr.Color); err != nil {
			httpx.RespondError(w, err)
			return
		}
		list = append(list, lr)
	}
	httpx.RespondJSON(w, http.StatusOK, list)
}

func (h *Requirements) AddLabel(w http.ResponseWriter, r *http.Request) {
	docID := chi.URLParam(r, "id")
	var req struct {
		LabelID string `json:"label_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.LabelID == "" {
		http.Error(w, "invalid json body or missing label_id", http.StatusBadRequest)
		return
	}
	actor := auth.ActorFrom(r.Context())
	_, err := h.db.Pool.Exec(r.Context(), `
		INSERT INTO document_label (document_id, label_id, creator_id)
		VALUES ($1, $2, $3)
		ON CONFLICT DO NOTHING
	`, docID, req.LabelID, actor.ID)
	if err != nil {
		httpx.RespondError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *Requirements) RemoveLabel(w http.ResponseWriter, r *http.Request) {
	docID := chi.URLParam(r, "id")
	labelID := chi.URLParam(r, "labelId")
	_, err := h.db.Pool.Exec(r.Context(), `
		DELETE FROM document_label WHERE document_id = $1 AND label_id = $2
	`, docID, labelID)
	if err != nil {
		httpx.RespondError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func itoa(n int) string {
	return strconv.Itoa(n)
}

