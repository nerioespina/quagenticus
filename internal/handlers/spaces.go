package handlers

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/nespina/quagenticus/internal/auth"
	"github.com/nespina/quagenticus/internal/db"
	"github.com/nespina/quagenticus/internal/httpx"
	"github.com/nespina/quagenticus/internal/models"
	"github.com/jackc/pgx/v5"
)

type Spaces struct {
	db *db.DB
}

func NewSpaces(db *db.DB) *Spaces {
	return &Spaces{db: db}
}

func (h *Spaces) List(w http.ResponseWriter, r *http.Request) {
	actor := auth.ActorFrom(r.Context())

	rows, err := h.db.Pool.Query(r.Context(), `
		SELECT s.id, s.account_id, s.key, s.name,
		       coalesce(s.description_md, ''), s.icon, s.color,
		       s.is_archived, s.created_at, s.updated_at
		FROM space s
		JOIN space_member sm ON sm.space_id = s.id
		WHERE sm.subject_id = $1
		  AND sm.subject_type = 'user'
		  AND s.is_archived = false
		ORDER BY s.name
	`, actor.ID)
	if err != nil {
		httpx.RespondError(w, err)
		return
	}
	defer rows.Close()

	spaces := make([]models.SpaceResponse, 0)
	for rows.Next() {
		var s models.SpaceResponse
		if err := rows.Scan(
			&s.ID, &s.AccountID, &s.Key, &s.Name,
			&s.Description, &s.Icon, &s.Color,
			&s.IsArchived, &s.CreatedAt, &s.UpdatedAt,
		); err != nil {
			httpx.RespondError(w, err)
			return
		}
		spaces = append(spaces, s)
	}

	httpx.RespondJSON(w, http.StatusOK, spaces)
}

func (h *Spaces) Create(w http.ResponseWriter, r *http.Request) {
	actor := auth.ActorFrom(r.Context())

	var in models.SpaceCreate
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		httpx.RespondJSON(w, http.StatusBadRequest, httpx.ErrorResponse{Code: "bad_request", Message: "payload inválido"})
		return
	}
	if err := validate.Struct(in); err != nil {
		httpx.RespondJSON(w, http.StatusBadRequest, httpx.ErrorResponse{Code: "bad_request", Message: err.Error()})
		return
	}

	var s models.SpaceResponse
	err := h.db.WithActor(r.Context(), actor, func(tx pgx.Tx) error {
		return tx.QueryRow(r.Context(), `
			INSERT INTO space (account_id, key, name, description_md, creator_id)
			VALUES (
				current_setting('qg.account_id')::uuid,
				upper($1), $2, $3,
				current_setting('qg.actor_id')::uuid
			)
			RETURNING id, account_id, key, name, coalesce(description_md,''),
			          icon, color, is_archived, created_at, updated_at
		`, in.Key, in.Name, in.Description).Scan(
			&s.ID, &s.AccountID, &s.Key, &s.Name, &s.Description,
			&s.Icon, &s.Color, &s.IsArchived, &s.CreatedAt, &s.UpdatedAt,
		)
	})
	if err != nil {
		httpx.RespondError(w, err)
		return
	}

	// Auto-add creator as admin member
	h.db.Pool.Exec(r.Context(), `
		INSERT INTO space_member (space_id, subject_type, subject_id, role, granted_by)
		VALUES ($1, 'user', $2, 'admin', $2)
		ON CONFLICT DO NOTHING
	`, s.ID, actor.ID) //nolint:errcheck

	httpx.RespondJSON(w, http.StatusCreated, s)
}

func (h *Spaces) Get(w http.ResponseWriter, r *http.Request) {
	spaceID := chi.URLParam(r, "spaceId")

	var s models.SpaceResponse
	err := h.db.Pool.QueryRow(r.Context(), `
		SELECT id, account_id, key, name, coalesce(description_md,''),
		       icon, color, is_archived, created_at, updated_at
		FROM space WHERE id = $1
	`, spaceID).Scan(
		&s.ID, &s.AccountID, &s.Key, &s.Name, &s.Description,
		&s.Icon, &s.Color, &s.IsArchived, &s.CreatedAt, &s.UpdatedAt,
	)
	if err != nil {
		httpx.RespondError(w, err)
		return
	}

	httpx.RespondJSON(w, http.StatusOK, s)
}

func (h *Spaces) ListMembers(w http.ResponseWriter, r *http.Request) {
	spaceID := chi.URLParam(r, "spaceId")
	rows, err := h.db.Pool.Query(r.Context(), `
		SELECT sm.subject_id, u.display_name, u.email, sm.role
		FROM space_member sm
		JOIN app_user u ON sm.subject_id = u.id
		WHERE sm.space_id = $1 AND sm.subject_type = 'user'
		ORDER BY u.display_name
	`, spaceID)
	if err != nil {
		httpx.RespondError(w, err)
		return
	}
	defer rows.Close()

	type SpaceMember struct {
		ID          string `json:"id"`
		DisplayName string `json:"display_name"`
		Email       string `json:"email"`
		Role        string `json:"role"`
	}
	members := make([]SpaceMember, 0)
	for rows.Next() {
		var m SpaceMember
		if err := rows.Scan(&m.ID, &m.DisplayName, &m.Email, &m.Role); err != nil {
			httpx.RespondError(w, err)
			return
		}
		members = append(members, m)
	}
	httpx.RespondJSON(w, http.StatusOK, members)
}

type AddSpaceMemberRequest struct {
	UserID string `json:"user_id" validate:"required,uuid"`
	Role   string `json:"role" validate:"required,oneof=admin maintainer contributor viewer"`
}

func (h *Spaces) AddMember(w http.ResponseWriter, r *http.Request) {
	spaceID := chi.URLParam(r, "spaceId")
	actor := auth.ActorFrom(r.Context())

	var in AddSpaceMemberRequest
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		httpx.RespondJSON(w, http.StatusBadRequest, httpx.ErrorResponse{Code: "bad_request", Message: "payload inválido"})
		return
	}
	if err := validate.Struct(in); err != nil {
		httpx.RespondJSON(w, http.StatusBadRequest, httpx.ErrorResponse{Code: "bad_request", Message: err.Error()})
		return
	}

	_, err := h.db.Pool.Exec(r.Context(), `
		INSERT INTO space_member (space_id, subject_type, subject_id, role, granted_by)
		VALUES ($1, 'user', $2, $3::member_role, $4)
		ON CONFLICT (space_id, subject_type, subject_id) DO UPDATE SET role = $3::member_role
	`, spaceID, in.UserID, in.Role, actor.ID)
	if err != nil {
		httpx.RespondError(w, err)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

type UpdateSpaceMemberRequest struct {
	Role string `json:"role" validate:"required,oneof=admin maintainer contributor viewer"`
}

func (h *Spaces) UpdateMember(w http.ResponseWriter, r *http.Request) {
	spaceID := chi.URLParam(r, "spaceId")
	userID := chi.URLParam(r, "userId")

	var in UpdateSpaceMemberRequest
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		httpx.RespondJSON(w, http.StatusBadRequest, httpx.ErrorResponse{Code: "bad_request", Message: "payload inválido"})
		return
	}
	if err := validate.Struct(in); err != nil {
		httpx.RespondJSON(w, http.StatusBadRequest, httpx.ErrorResponse{Code: "bad_request", Message: err.Error()})
		return
	}

	_, err := h.db.Pool.Exec(r.Context(), `
		UPDATE space_member SET role = $3::member_role
		WHERE space_id = $1 AND subject_id = $2 AND subject_type = 'user'
	`, spaceID, userID, in.Role)
	if err != nil {
		httpx.RespondError(w, err)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

func (h *Spaces) RemoveMember(w http.ResponseWriter, r *http.Request) {
	spaceID := chi.URLParam(r, "spaceId")
	userID := chi.URLParam(r, "userId")

	_, err := h.db.Pool.Exec(r.Context(), `
		DELETE FROM space_member
		WHERE space_id = $1 AND subject_id = $2 AND subject_type = 'user'
	`, spaceID, userID)
	if err != nil {
		httpx.RespondError(w, err)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}


