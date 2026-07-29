package handlers

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/go-playground/validator/v10"
	"github.com/jackc/pgx/v5"
	"github.com/nespina/quagenticus/internal/auth"
	"github.com/nespina/quagenticus/internal/db"
	"github.com/nespina/quagenticus/internal/httpx"
	"github.com/nespina/quagenticus/internal/models"
)

var validate = validator.New()

type Documents struct {
	db *db.DB
}

func NewDocuments(db *db.DB) *Documents {
	return &Documents{db: db}
}

func (h *Documents) List(w http.ResponseWriter, r *http.Request) {
	spaceID := chi.URLParam(r, "spaceId")
	docType := r.URL.Query().Get("type")

	query := `
		SELECT id, space_id, parent_id, doc_type, ref_key, slug, title,
		       body_md, version, is_archived, created_at, updated_at
		FROM document
		WHERE space_id = $1 AND is_archived = false
	`
	args := []any{spaceID}
	if docType != "" {
		query += ` AND doc_type = $2`
		args = append(args, docType)
	}
	query += ` ORDER BY updated_at DESC`

	rows, err := h.db.Pool.Query(r.Context(), query, args...)
	if err != nil {
		httpx.RespondError(w, err)
		return
	}
	defer rows.Close()

	docs := make([]models.DocumentResponse, 0)
	for rows.Next() {
		var d models.DocumentResponse
		if err := rows.Scan(
			&d.ID, &d.SpaceID, &d.ParentID, &d.DocType, &d.RefKey, &d.Slug,
			&d.Title, &d.BodyMD, &d.Version, &d.IsArchived, &d.CreatedAt, &d.UpdatedAt,
		); err != nil {
			httpx.RespondError(w, err)
			return
		}
		docs = append(docs, d)
	}

	httpx.RespondJSON(w, http.StatusOK, docs)
}

func (h *Documents) Create(w http.ResponseWriter, r *http.Request) {
	spaceID := chi.URLParam(r, "spaceId")
	actor := auth.ActorFrom(r.Context())

	var in models.DocumentCreate
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		httpx.RespondJSON(w, http.StatusBadRequest, httpx.ErrorResponse{Code: "bad_request", Message: "payload inválido"})
		return
	}
	in.SpaceID = spaceID
	if err := validate.Struct(in); err != nil {
		httpx.RespondJSON(w, http.StatusBadRequest, httpx.ErrorResponse{Code: "bad_request", Message: err.Error()})
		return
	}

	var out models.DocumentResponse
	err := h.db.WithActor(r.Context(), actor, func(tx pgx.Tx) error {
		return tx.QueryRow(r.Context(), `
			SELECT id, space_id, parent_id, doc_type, ref_key, slug, title,
			       body_md, version, is_archived, created_at, updated_at
			FROM document_create($1, $2, $3, $4, $5, $6)
		`, in.SpaceID, in.ParentID, in.DocType, in.Title, in.BodyMD, in.FrontMatter,
		).Scan(
			&out.ID, &out.SpaceID, &out.ParentID, &out.DocType, &out.RefKey, &out.Slug,
			&out.Title, &out.BodyMD, &out.Version, &out.IsArchived, &out.CreatedAt, &out.UpdatedAt,
		)
	})
	if err != nil {
		httpx.RespondError(w, err)
		return
	}

	httpx.RespondJSON(w, http.StatusCreated, out)
}

func (h *Documents) Get(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	var out models.DocumentResponse
	err := h.db.Pool.QueryRow(r.Context(), `
		SELECT id, space_id, parent_id, doc_type, ref_key, slug, title,
		       body_md, version, is_archived, created_at, updated_at
		FROM document WHERE id = $1 AND is_archived = false
	`, id).Scan(
		&out.ID, &out.SpaceID, &out.ParentID, &out.DocType, &out.RefKey, &out.Slug,
		&out.Title, &out.BodyMD, &out.Version, &out.IsArchived, &out.CreatedAt, &out.UpdatedAt,
	)
	if err != nil {
		httpx.RespondError(w, err)
		return
	}

	httpx.RespondJSON(w, http.StatusOK, out)
}

func (h *Documents) Update(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	actor := auth.ActorFrom(r.Context())

	var in models.DocumentUpdate
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		httpx.RespondJSON(w, http.StatusBadRequest, httpx.ErrorResponse{Code: "bad_request", Message: "payload inválido"})
		return
	}

	var out models.DocumentResponse
	err := h.db.WithActor(r.Context(), actor, func(tx pgx.Tx) error {
		return tx.QueryRow(r.Context(), `
			SELECT id, space_id, parent_id, doc_type, ref_key, slug, title,
			       body_md, version, is_archived, created_at, updated_at
			FROM document_update($1, $2, $3, $4)
		`, id, in.Title, in.BodyMD, in.Version).Scan(
			&out.ID, &out.SpaceID, &out.ParentID, &out.DocType, &out.RefKey, &out.Slug,
			&out.Title, &out.BodyMD, &out.Version, &out.IsArchived, &out.CreatedAt, &out.UpdatedAt,
		)
	})
	if err != nil {
		httpx.RespondError(w, err)
		return
	}

	httpx.RespondJSON(w, http.StatusOK, out)
}

func (h *Documents) Delete(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	actor := auth.ActorFrom(r.Context())

	err := h.db.WithActor(r.Context(), actor, func(tx pgx.Tx) error {
		_, err := tx.Exec(r.Context(),
			`UPDATE document SET is_archived = true, archived_at = now() WHERE id = $1`, id)
		return err
	})
	if err != nil {
		httpx.RespondError(w, err)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

func (h *Documents) History(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	rows, err := h.db.Pool.Query(r.Context(), `
		SELECT id, document_id, version, title, body_md,
		       change_summary, actor_type, actor_id, created_at
		FROM document_version
		WHERE document_id = $1
		ORDER BY version DESC
	`, id)
	if err != nil {
		httpx.RespondError(w, err)
		return
	}
	defer rows.Close()

	type versionRow struct {
		ID           string  `json:"id"`
		DocumentID   string  `json:"document_id"`
		Version      int     `json:"version"`
		Title        string  `json:"title"`
		BodyMD       string  `json:"body_md"`
		ChangeSummary *string `json:"change_summary"`
		ActorType    string  `json:"actor_type"`
		ActorID      *string `json:"actor_id"`
		CreatedAt    string  `json:"created_at"`
	}

	versions := make([]versionRow, 0)
	for rows.Next() {
		var v versionRow
		if err := rows.Scan(
			&v.ID, &v.DocumentID, &v.Version, &v.Title, &v.BodyMD,
			&v.ChangeSummary, &v.ActorType, &v.ActorID, &v.CreatedAt,
		); err != nil {
			httpx.RespondError(w, err)
			return
		}
		versions = append(versions, v)
	}

	httpx.RespondJSON(w, http.StatusOK, versions)
}

func (h *Documents) Trackers(w http.ResponseWriter, r *http.Request) {
	actor := auth.ActorFrom(r.Context())

	type trackerRow struct {
		ID   string `json:"id"`
		Key  string `json:"key"`
		Name string `json:"name"`
		Icon *string `json:"icon"`
		Color *string `json:"color"`
	}

	rows, err := h.db.Pool.Query(r.Context(), `
		SELECT id, key, name, icon, color FROM tracker
		WHERE account_id = $1 AND is_active = true ORDER BY ord
	`, actor.AccountID)
	if err != nil {
		httpx.RespondError(w, err)
		return
	}
	defer rows.Close()

	list := make([]trackerRow, 0)
	for rows.Next() {
		var t trackerRow
		if err := rows.Scan(&t.ID, &t.Key, &t.Name, &t.Icon, &t.Color); err != nil {
			httpx.RespondError(w, err)
			return
		}
		list = append(list, t)
	}
	httpx.RespondJSON(w, http.StatusOK, list)
}

func (h *Documents) Priorities(w http.ResponseWriter, r *http.Request) {
	actor := auth.ActorFrom(r.Context())

	type priorityRow struct {
		ID        string `json:"id"`
		Key       string `json:"key"`
		Name      string `json:"name"`
		Weight    int    `json:"weight"`
		Color     *string `json:"color"`
		IsDefault bool   `json:"is_default"`
	}

	rows, err := h.db.Pool.Query(r.Context(), `
		SELECT id, key, name, weight, color, is_default FROM priority
		WHERE account_id = $1 ORDER BY weight DESC
	`, actor.AccountID)
	if err != nil {
		httpx.RespondError(w, err)
		return
	}
	defer rows.Close()

	list := make([]priorityRow, 0)
	for rows.Next() {
		var p priorityRow
		if err := rows.Scan(&p.ID, &p.Key, &p.Name, &p.Weight, &p.Color, &p.IsDefault); err != nil {
			httpx.RespondError(w, err)
			return
		}
		list = append(list, p)
	}
	httpx.RespondJSON(w, http.StatusOK, list)
}

func (h *Documents) Labels(w http.ResponseWriter, r *http.Request) {
	type labelRow struct {
		ID    string `json:"id"`
		Name  string `json:"name"`
		Color string `json:"color"`
	}

	rows, err := h.db.Pool.Query(r.Context(), `
		SELECT id, name, color FROM label ORDER BY name
	`)
	if err != nil {
		httpx.RespondError(w, err)
		return
	}
	defer rows.Close()

	list := make([]labelRow, 0)
	for rows.Next() {
		var l labelRow
		if err := rows.Scan(&l.ID, &l.Name, &l.Color); err != nil {
			httpx.RespondError(w, err)
			return
		}
		list = append(list, l)
	}
	httpx.RespondJSON(w, http.StatusOK, list)
}

func (h *Documents) Statuses(w http.ResponseWriter, r *http.Request) {
	actor := auth.ActorFrom(r.Context())

	type statusRow struct {
		ID        string  `json:"id"`
		Key       string  `json:"key"`
		Name      string  `json:"name"`
		Color     *string `json:"color"`
		Ord       int     `json:"ord"`
		IsDefault bool    `json:"is_default"`
		IsClosed  bool    `json:"is_closed"`
	}

	rows, err := h.db.Pool.Query(r.Context(), `
		SELECT id, key, name, color, ord, is_default, is_closed
		FROM workflow_status
		WHERE account_id = $1
		ORDER BY ord
	`, actor.AccountID)
	if err != nil {
		httpx.RespondError(w, err)
		return
	}
	defer rows.Close()

	list := make([]statusRow, 0)
	for rows.Next() {
		var s statusRow
		if err := rows.Scan(&s.ID, &s.Key, &s.Name, &s.Color, &s.Ord, &s.IsDefault, &s.IsClosed); err != nil {
			httpx.RespondError(w, err)
			return
		}
		list = append(list, s)
	}
	httpx.RespondJSON(w, http.StatusOK, list)
}

