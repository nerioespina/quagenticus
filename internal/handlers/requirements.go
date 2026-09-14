package handlers

import (
	"context"
	"fmt"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/nespina/quagenticus/internal/authz"
	"github.com/nespina/quagenticus/internal/httpx"
)

// requirementSummary is the list projection (no body) over v_requirement "v".
const requirementSummary = `v.id, v.space_id, v.ref_key, v.title, v.version,
       v.tracker_id, v.tracker_key, v.tracker_name, v.tracker_icon,
       v.status_id, v.status_key, v.status_name, v.status_color, v.status_is_closed,
       v.priority_id, v.priority_key, v.priority_name, v.priority_color, v.priority_weight,
       v.category_id, v.milestone_id, v.parent_id, v.reporter_id, v.reporter_name, v.lead_user_id,
       v.board_position, v.readiness_score, v.done_ratio, v.estimated_hours, v.spent_hours,
       v.start_date, v.due_date, v.resolution, v.closed_at, v.claimed_by_agent_id, v.claimed_by_agent_name,
       v.member_count, v.created_at, v.updated_at,
       coalesce((SELECT jsonb_agg(jsonb_build_object('id', l.id, 'name', l.name, 'color', l.color) ORDER BY l.name)
                   FROM document_label dl JOIN label l ON l.id = dl.label_id WHERE dl.document_id = v.id), '[]') AS labels,
       coalesce((SELECT jsonb_agg(jsonb_build_object('id', m.subject_id, 'type', m.subject_type, 'is_lead', m.is_lead,
                                                     'display_name', coalesce(u.display_name, ag.name), 'avatar_url', u.avatar_url)
                                  ORDER BY m.is_lead DESC, m.added_at)
                   FROM requirement_member m
                   LEFT JOIN app_user u ON u.id = m.subject_id AND m.subject_type = 'user'
                   LEFT JOIN agent ag ON ag.id = m.subject_id AND m.subject_type = 'agent'
                  WHERE m.document_id = v.id), '[]') AS members`

var requirementSorts = map[string]string{
	"updated":  "v.updated_at",
	"created":  "v.created_at",
	"priority": "v.priority_weight",
	"due":      "v.due_date",
	"ref":      "(substring(v.ref_key from '[0-9]+$'))::bigint",
	"title":    "lower(v.title)",
	"status":   "(SELECT ord FROM workflow_status WHERE id = v.status_id)",
	"position": "v.board_position",
	"done":     "v.done_ratio",
}

// ListRequirements supports filters, sorting and offset pagination:
//
//	status_id, tracker_id, priority_id, label_id, category_id, milestone_id (comma lists)
//	assignee=me|none|<uuid>, reporter=me|<uuid>, open=true|false, overdue=true,
//	parent_id=<uuid>|none, q=text, sort=<key>, dir=asc|desc, limit, offset
func (a *API) ListRequirements(w http.ResponseWriter, r *http.Request) {
	acc := authz.From(r.Context())
	act := actor(r)
	q := r.URL.Query()

	where := []string{"v.space_id = $1"}
	args := []any{acc.SpaceID}
	arg := func(v any) string {
		args = append(args, v)
		return fmt.Sprintf("$%d", len(args))
	}
	uuidList := func(name, column string) {
		var ids []string
		for _, id := range httpx.QueryList(r, name) {
			if httpx.IsUUID(id) {
				ids = append(ids, id)
			}
		}
		if len(ids) > 0 {
			where = append(where, column+" = ANY ("+arg(ids)+"::uuid[])")
		}
	}
	uuidList("status_id", "v.status_id")
	uuidList("tracker_id", "v.tracker_id")
	uuidList("priority_id", "v.priority_id")
	uuidList("category_id", "v.category_id")
	uuidList("milestone_id", "v.milestone_id")
	if labels := httpx.QueryList(r, "label_id"); len(labels) > 0 {
		where = append(where, "EXISTS (SELECT 1 FROM document_label dl WHERE dl.document_id = v.id AND dl.label_id::text = ANY ("+arg(labels)+"))")
	}
	switch as := q.Get("assignee"); {
	case as == "me":
		where = append(where, "EXISTS (SELECT 1 FROM requirement_member m WHERE m.document_id = v.id AND m.subject_id = "+arg(act.ID)+"::uuid)")
	case as == "none":
		where = append(where, "NOT EXISTS (SELECT 1 FROM requirement_member m WHERE m.document_id = v.id)")
	case httpx.IsUUID(as):
		where = append(where, "EXISTS (SELECT 1 FROM requirement_member m WHERE m.document_id = v.id AND m.subject_id = "+arg(as)+"::uuid)")
	}
	switch rep := q.Get("reporter"); {
	case rep == "me":
		where = append(where, "v.reporter_id = "+arg(act.ID)+"::uuid")
	case httpx.IsUUID(rep):
		where = append(where, "v.reporter_id = "+arg(rep)+"::uuid")
	}
	switch q.Get("open") {
	case "true":
		where = append(where, "NOT v.status_is_closed")
	case "false":
		where = append(where, "v.status_is_closed")
	}
	if q.Get("overdue") == "true" {
		where = append(where, "v.due_date < current_date AND NOT v.status_is_closed")
	}
	switch p := q.Get("parent_id"); {
	case p == "none":
		where = append(where, "v.parent_id IS NULL")
	case httpx.IsUUID(p):
		where = append(where, "v.parent_id = "+arg(p)+"::uuid")
	}
	if text := strings.TrimSpace(q.Get("q")); text != "" {
		p := arg(text)
		where = append(where, "(v.ref_key ILIKE '%' || "+p+" || '%' OR qg_unaccent(v.title) ILIKE '%' || qg_unaccent("+p+") || '%')")
	}

	sortCol, ok := requirementSorts[q.Get("sort")]
	if !ok {
		sortCol = requirementSorts["updated"]
	}
	dir := "DESC"
	if q.Get("dir") == "asc" {
		dir = "ASC"
	}
	limit := httpx.QueryInt(r, "limit", 50, 1, 500)
	offset := httpx.QueryInt(r, "offset", 0, 0, 1_000_000)

	cond := strings.Join(where, " AND ")
	sql := fmt.Sprintf(`
		SELECT jsonb_build_object(
		    'total', (SELECT count(*) FROM v_requirement v WHERE %s),
		    'items', coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM (
		        SELECT %s FROM v_requirement v WHERE %s
		         ORDER BY %s %s NULLS LAST, v.created_at DESC
		         LIMIT %d OFFSET %d
		    ) x), '[]')
		)`, cond, requirementSummary, cond, sortCol, dir, limit, offset)
	a.rawJSON(w, r, http.StatusOK, sql, args...)
}

var requirementCreateKeys = []string{
	"tracker_id", "title", "body_md", "priority_id", "status_id", "category_id", "milestone_id",
	"parent_id", "start_date", "due_date", "estimated_hours", "lead_user_id", "member_ids",
	"label_ids", "attachment_ids", "links",
}

func (a *API) CreateRequirement(w http.ResponseWriter, r *http.Request) {
	in, err := httpx.DecodeObject(r, requirementCreateKeys...)
	if err != nil {
		httpx.RespondError(w, err)
		return
	}
	acc := authz.From(r.Context())
	var id string
	err = a.tx(r, func(ctx context.Context, tx pgx.Tx) error {
		return tx.QueryRow(ctx, `SELECT requirement_create_full($1, $2::jsonb)`, acc.SpaceID, jsonParam(in)).Scan(&id)
	})
	if err != nil {
		httpx.RespondError(w, err)
		return
	}
	a.writeRequirement(w, r, http.StatusCreated, id)
}

func (a *API) GetRequirement(w http.ResponseWriter, r *http.Request) {
	a.writeRequirement(w, r, http.StatusOK, chi.URLParam(r, "id"))
}

func (a *API) writeRequirement(w http.ResponseWriter, r *http.Request, status int, id string) {
	act := actor(r)
	acc := authz.From(r.Context())
	a.rawJSON(w, r, status, `
		SELECT to_jsonb(x) FROM (
		    SELECT `+requirementSummary+`, v.body_md, v.readiness_report, v.creator_agent_id,
		           EXISTS (SELECT 1 FROM watcher WHERE document_id = v.id AND subject_type = $2::actor_type AND subject_id = $3::uuid) AS is_watching,
		           $4::text AS my_role,
		           (SELECT jsonb_build_object('id', p.id, 'ref_key', p.ref_key, 'title', p.title)
		              FROM document p WHERE p.id = v.parent_id) AS parent
		      FROM v_requirement v WHERE v.id = $1
		) x`, uuidOrNil(id), act.Type, act.ID, acc.Role.String())
}

var requirementPatchKeys = []string{
	"title", "body_md", "tracker_id", "priority_id", "category_id", "milestone_id", "parent_id",
	"done_ratio", "estimated_hours", "spent_hours", "start_date", "due_date",
}

// UpdateRequirement applies PATCH semantics: keys present with null clear the
// field. "version" enables optimistic locking of title/description.
func (a *API) UpdateRequirement(w http.ResponseWriter, r *http.Request) {
	in, err := httpx.DecodeObject(r, append(requirementPatchKeys, "version")...)
	if err != nil {
		httpx.RespondError(w, err)
		return
	}
	id := chi.URLParam(r, "id")
	var version any
	if v, ok := in["version"]; ok && string(v) != "null" {
		version = string(v)
	}
	delete(in, "version")
	err = a.tx(r, func(ctx context.Context, tx pgx.Tx) error {
		_, err := tx.Exec(ctx, `SELECT requirement_patch($1, $2::jsonb, $3::int)`, id, jsonParam(in), version)
		return err
	})
	if err != nil {
		httpx.RespondError(w, err)
		return
	}
	a.writeRequirement(w, r, http.StatusOK, id)
}

type transitionRequest struct {
	ToStatusID string  `json:"to_status_id" validate:"required,uuid"`
	Comment    *string `json:"comment"`
	Resolution *string `json:"resolution"`
}

func (a *API) TransitionRequirement(w http.ResponseWriter, r *http.Request) {
	var in transitionRequest
	if err := httpx.Decode(r, &in); err != nil {
		httpx.RespondError(w, err)
		return
	}
	id := chi.URLParam(r, "id")
	err := a.tx(r, func(ctx context.Context, tx pgx.Tx) error {
		_, err := tx.Exec(ctx, `SELECT requirement_transition($1, $2, $3, $4)`, id, in.ToStatusID, in.Comment, in.Resolution)
		return err
	})
	if err != nil {
		httpx.RespondError(w, err)
		return
	}
	a.writeRequirement(w, r, http.StatusOK, id)
}

func (a *API) AllowedTransitions(w http.ResponseWriter, r *http.Request) {
	a.rawJSON(w, r, http.StatusOK, `
		SELECT coalesce(jsonb_agg(status_id), '[]') FROM requirement_allowed_statuses($1)`, chi.URLParam(r, "id"))
}

type moveRequest struct {
	ToStatusID *string `json:"to_status_id" validate:"omitempty,uuid"`
	BeforeID   *string `json:"before_id"    validate:"omitempty,uuid"`
	AfterID    *string `json:"after_id"     validate:"omitempty,uuid"`
	Comment    *string `json:"comment"`
	Resolution *string `json:"resolution"`
}

// MoveRequirement changes column and/or position and returns the board card.
func (a *API) MoveRequirement(w http.ResponseWriter, r *http.Request) {
	var in moveRequest
	if err := httpx.Decode(r, &in); err != nil {
		httpx.RespondError(w, err)
		return
	}
	id := chi.URLParam(r, "id")
	err := a.tx(r, func(ctx context.Context, tx pgx.Tx) error {
		_, err := tx.Exec(ctx, `SELECT requirement_move($1, $2, $3, $4, $5, $6)`,
			id, in.ToStatusID, in.BeforeID, in.AfterID, in.Comment, in.Resolution)
		return err
	})
	if err != nil {
		httpx.RespondError(w, err)
		return
	}
	a.writeCard(w, r, id)
}

func (a *API) writeCard(w http.ResponseWriter, r *http.Request, id string) {
	a.rawJSON(w, r, http.StatusOK, `
		SELECT `+cardJSON+`
		  FROM requirement r
		  JOIN document d ON d.id = r.document_id
		  JOIN tracker t ON t.id = r.tracker_id
		  JOIN priority pr ON pr.id = r.priority_id
		  JOIN workflow_status ws ON ws.id = r.status_id
		 WHERE r.document_id = $1`, id)
}

type bulkRequest struct {
	IDs        []string       `json:"ids" validate:"required,min=1,max=200,dive,uuid"`
	Patch      map[string]any `json:"patch"`
	ToStatusID *string        `json:"to_status_id" validate:"omitempty,uuid"`
	AddLabelID *string        `json:"add_label_id" validate:"omitempty,uuid"`
	AddMember  *string        `json:"add_member_id" validate:"omitempty,uuid"`
}

// BulkUpdateRequirements applies the same change to several requirements of the space.
func (a *API) BulkUpdateRequirements(w http.ResponseWriter, r *http.Request) {
	var in bulkRequest
	if err := httpx.Decode(r, &in); err != nil {
		httpx.RespondError(w, err)
		return
	}
	patch := map[string]any{}
	for _, k := range requirementPatchKeys {
		if v, ok := in.Patch[k]; ok && k != "title" && k != "body_md" {
			patch[k] = v
		}
	}
	acc := authz.From(r.Context())
	err := a.tx(r, func(ctx context.Context, tx pgx.Tx) error {
		var n int
		if err := tx.QueryRow(ctx, `SELECT count(*) FROM requirement WHERE document_id = ANY ($1::uuid[]) AND space_id = $2`,
			in.IDs, acc.SpaceID).Scan(&n); err != nil {
			return err
		}
		if n != len(in.IDs) {
			return httpx.ErrNotFound
		}
		for _, id := range in.IDs {
			if len(patch) > 0 {
				if _, err := tx.Exec(ctx, `SELECT requirement_patch($1, $2::jsonb)`, id, jsonParam(patch)); err != nil {
					return err
				}
			}
			if in.ToStatusID != nil {
				if _, err := tx.Exec(ctx, `SELECT requirement_transition($1, $2)`, id, *in.ToStatusID); err != nil {
					return err
				}
			}
			if in.AddLabelID != nil {
				if _, err := tx.Exec(ctx, `SELECT document_label_add($1, $2)`, id, *in.AddLabelID); err != nil {
					return err
				}
			}
			if in.AddMember != nil {
				if _, err := tx.Exec(ctx, `SELECT requirement_member_add($1, $2)`, id, *in.AddMember); err != nil {
					return err
				}
			}
		}
		return nil
	})
	if err != nil {
		httpx.RespondError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// ------------------------------------------------------------------ members

func (a *API) ListRequirementMembers(w http.ResponseWriter, r *http.Request) {
	a.array(w, r, `
		SELECT rm.subject_type, rm.subject_id, rm.is_lead, rm.added_at,
		       coalesce(u.display_name, ag.name, '') AS display_name,
		       coalesce(u.email::text, '') AS email, u.handle, u.avatar_url
		  FROM requirement_member rm
		  LEFT JOIN app_user u ON u.id = rm.subject_id AND rm.subject_type = 'user'
		  LEFT JOIN agent ag ON ag.id = rm.subject_id AND rm.subject_type = 'agent'
		 WHERE rm.document_id = $1
		 ORDER BY rm.is_lead DESC, rm.added_at`, chi.URLParam(r, "id"))
}

type memberAddRequest struct {
	SubjectID string `json:"subject_id" validate:"required,uuid"`
	IsLead    bool   `json:"is_lead"`
}

func (a *API) AddRequirementMember(w http.ResponseWriter, r *http.Request) {
	var in memberAddRequest
	if err := httpx.Decode(r, &in); err != nil {
		httpx.RespondError(w, err)
		return
	}
	id := chi.URLParam(r, "id")
	err := a.tx(r, func(ctx context.Context, tx pgx.Tx) error {
		if _, err := tx.Exec(ctx, `SELECT requirement_member_add($1, $2)`, id, in.SubjectID); err != nil {
			return err
		}
		if in.IsLead {
			_, err := tx.Exec(ctx, `SELECT requirement_set_lead($1, $2)`, id, in.SubjectID)
			return err
		}
		return nil
	})
	if err != nil {
		httpx.RespondError(w, err)
		return
	}
	a.ListRequirementMembers(w, r)
}

type membersSetRequest struct {
	UserIDs    []string `json:"user_ids" validate:"dive,uuid"`
	LeadUserID *string  `json:"lead_user_id" validate:"omitempty,uuid"`
}

func (a *API) SetRequirementMembers(w http.ResponseWriter, r *http.Request) {
	var in membersSetRequest
	if err := httpx.Decode(r, &in); err != nil {
		httpx.RespondError(w, err)
		return
	}
	if in.UserIDs == nil {
		in.UserIDs = []string{}
	}
	id := chi.URLParam(r, "id")
	err := a.tx(r, func(ctx context.Context, tx pgx.Tx) error {
		_, err := tx.Exec(ctx, `SELECT requirement_members_set($1, $2::uuid[], $3)`, id, in.UserIDs, in.LeadUserID)
		return err
	})
	if err != nil {
		httpx.RespondError(w, err)
		return
	}
	a.ListRequirementMembers(w, r)
}

func (a *API) RemoveRequirementMember(w http.ResponseWriter, r *http.Request) {
	a.exec(w, r, `SELECT requirement_member_remove($1, $2)`, chi.URLParam(r, "id"), uuidOrNil(chi.URLParam(r, "userId")))
}

type leadRequest struct {
	LeadUserID *string `json:"lead_user_id" validate:"omitempty,uuid"`
}

func (a *API) SetRequirementLead(w http.ResponseWriter, r *http.Request) {
	var in leadRequest
	if err := httpx.Decode(r, &in); err != nil {
		httpx.RespondError(w, err)
		return
	}
	id := chi.URLParam(r, "id")
	err := a.tx(r, func(ctx context.Context, tx pgx.Tx) error {
		_, err := tx.Exec(ctx, `SELECT requirement_set_lead($1, $2)`, id, in.LeadUserID)
		return err
	})
	if err != nil {
		httpx.RespondError(w, err)
		return
	}
	a.writeRequirement(w, r, http.StatusOK, id)
}

// ------------------------------------------------------------------- others

func (a *API) Readiness(w http.ResponseWriter, r *http.Request) {
	a.object(w, r, `
		SELECT coalesce(readiness_score, 0) AS score, coalesce(readiness_report, '{}'::jsonb) AS report, readiness_at
		  FROM requirement WHERE document_id = $1`, chi.URLParam(r, "id"))
}

func (a *API) ListChildren(w http.ResponseWriter, r *http.Request) {
	a.array(w, r, `SELECT `+requirementSummary+` FROM v_requirement v
		WHERE v.parent_id = $1 ORDER BY v.board_position, v.created_at`, chi.URLParam(r, "id"))
}

func (a *API) ArchiveDocument(w http.ResponseWriter, r *http.Request) {
	a.exec(w, r, `SELECT document_archive($1, true)`, chi.URLParam(r, "id"))
}

func (a *API) RestoreDocument(w http.ResponseWriter, r *http.Request) {
	a.exec(w, r, `SELECT document_archive($1, false)`, chi.URLParam(r, "id"))
}

type cloneRequest struct {
	Title string `json:"title"`
}

func (a *API) CloneRequirement(w http.ResponseWriter, r *http.Request) {
	var in cloneRequest
	httpx.Decode(r, &in) //nolint:errcheck // body is optional
	var id string
	err := a.tx(r, func(ctx context.Context, tx pgx.Tx) error {
		return tx.QueryRow(ctx, `SELECT requirement_clone($1, $2)`, chi.URLParam(r, "id"), in.Title).Scan(&id)
	})
	if err != nil {
		httpx.RespondError(w, err)
		return
	}
	a.writeRequirement(w, r, http.StatusCreated, id)
}

type moveSpaceRequest struct {
	SpaceID string `json:"space_id" validate:"required,uuid"`
}

// MoveRequirementToSpace requires maintainer in the source (route guard) and
// contributor in the destination (checked here).
func (a *API) MoveRequirementToSpace(w http.ResponseWriter, r *http.Request) {
	var in moveSpaceRequest
	if err := httpx.Decode(r, &in); err != nil {
		httpx.RespondError(w, err)
		return
	}
	role, err := a.guard.SpaceRole(r.Context(), actor(r), in.SpaceID)
	if err != nil {
		httpx.RespondError(w, err)
		return
	}
	if role < authz.Contributor {
		httpx.RespondError(w, httpx.NewError(http.StatusForbidden, "forbidden", "no puedes crear requerimientos en el espacio destino"))
		return
	}
	var ref string
	err = a.tx(r, func(ctx context.Context, tx pgx.Tx) error {
		return tx.QueryRow(ctx, `SELECT requirement_move_space($1, $2)`, chi.URLParam(r, "id"), in.SpaceID).Scan(&ref)
	})
	if err != nil {
		httpx.RespondError(w, err)
		return
	}
	httpx.RespondJSON(w, http.StatusOK, map[string]string{"ref_key": ref, "space_id": in.SpaceID})
}

// RequirementContext renders a markdown package for agents: body, metadata,
// linked documents, recent comments and open children.
func (a *API) RequirementContext(w http.ResponseWriter, r *http.Request) {
	var md string
	err := a.tx(r, func(ctx context.Context, tx pgx.Tx) error {
		return tx.QueryRow(ctx, `
			SELECT '# ' || v.ref_key || ' · ' || v.title || E'\n\n' ||
			       '- **Estado:** ' || v.status_name || E'\n' ||
			       '- **Prioridad:** ' || v.priority_name || E'\n' ||
			       '- **Tracker:** ' || v.tracker_name || E'\n' ||
			       coalesce('- **Fecha límite:** ' || v.due_date || E'\n', '') ||
			       coalesce('- **DoR:** ' || v.readiness_score || E'%\n', '') ||
			       E'\n---\n\n' || v.body_md || E'\n\n' ||
			       coalesce((SELECT E'## Documentos enlazados\n\n' || string_agg(
			                    '### ' || coalesce(d.ref_key || ' · ', '') || d.title || ' (' || dl.link_type || E')\n\n' || left(d.body_md, 4000),
			                    E'\n\n' ORDER BY d.title) || E'\n\n'
			                   FROM document_link dl JOIN document d ON d.id = dl.target_id AND NOT d.is_archived
			                  WHERE dl.source_id = v.id), '') ||
			       coalesce((SELECT E'## Sub-requerimientos\n\n' || string_agg('- ' || c.ref_key || ' · ' || c.title || ' — ' || c.status_name, E'\n' ORDER BY c.board_position) || E'\n\n'
			                   FROM v_requirement c WHERE c.parent_id = v.id), '') ||
			       coalesce((SELECT E'## Comentarios recientes\n\n' || string_agg(
			                    '**' || coalesce(u.display_name, ag.name, 'Sistema') || '** (' || to_char(j.created_at, 'YYYY-MM-DD HH24:MI') || E'):\n' || j.notes_md,
			                    E'\n\n' ORDER BY j.created_at)
			                   FROM (SELECT * FROM journal WHERE document_id = v.id AND kind = 'comment' AND deleted_at IS NULL
			                          ORDER BY created_at DESC LIMIT 20) j
			                   LEFT JOIN app_user u ON u.id = j.actor_user_id
			                   LEFT JOIN agent ag ON ag.id = j.actor_agent_id), '')
			  FROM v_requirement v WHERE v.id = $1`, chi.URLParam(r, "id")).Scan(&md)
	})
	if err != nil {
		httpx.RespondError(w, err)
		return
	}
	w.Header().Set("Content-Type", "text/markdown; charset=utf-8")
	w.Write([]byte(md)) //nolint:errcheck
}

// ------------------------------------------------------------------- labels

func (a *API) ListDocumentLabels(w http.ResponseWriter, r *http.Request) {
	a.array(w, r, `
		SELECT l.id, l.name, l.color FROM document_label dl JOIN label l ON l.id = dl.label_id
		 WHERE dl.document_id = $1 ORDER BY l.name`, chi.URLParam(r, "id"))
}

type labelAddRequest struct {
	LabelID string `json:"label_id" validate:"required,uuid"`
}

func (a *API) AddDocumentLabel(w http.ResponseWriter, r *http.Request) {
	var in labelAddRequest
	if err := httpx.Decode(r, &in); err != nil {
		httpx.RespondError(w, err)
		return
	}
	a.exec(w, r, `SELECT document_label_add($1, $2)`, chi.URLParam(r, "id"), in.LabelID)
}

func (a *API) RemoveDocumentLabel(w http.ResponseWriter, r *http.Request) {
	a.exec(w, r, `SELECT document_label_remove($1, $2)`, chi.URLParam(r, "id"), uuidOrNil(chi.URLParam(r, "labelId")))
}

// --------------------------------------------------------------------- time

func (a *API) ListTimeEntries(w http.ResponseWriter, r *http.Request) {
	a.array(w, r, `
		SELECT t.id, t.document_id, t.user_id, u.display_name, t.hours, t.spent_on, t.note, t.created_at
		  FROM time_entry t JOIN app_user u ON u.id = t.user_id
		 WHERE t.document_id = $1 ORDER BY t.spent_on DESC, t.created_at DESC`, chi.URLParam(r, "id"))
}

type timeEntryRequest struct {
	Hours   float64 `json:"hours" validate:"required,gt=0,lte=24"`
	SpentOn *string `json:"spent_on"`
	Note    string  `json:"note"`
}

func (a *API) AddTimeEntry(w http.ResponseWriter, r *http.Request) {
	var in timeEntryRequest
	if err := httpx.Decode(r, &in); err != nil {
		httpx.RespondError(w, err)
		return
	}
	a.exec(w, r, `SELECT time_entry_add($1, $2, nullif($3, '')::date, $4)`, chi.URLParam(r, "id"), in.Hours, in.SpentOn, in.Note)
}

func (a *API) DeleteTimeEntry(w http.ResponseWriter, r *http.Request) {
	acc := authz.From(r.Context())
	a.exec(w, r, `SELECT time_entry_delete($1, $2)`, chi.URLParam(r, "id"), acc.Role >= authz.Maintainer)
}
