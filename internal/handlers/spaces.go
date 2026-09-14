package handlers

import (
	"context"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/nespina/quagenticus/internal/authz"
	"github.com/nespina/quagenticus/internal/httpx"
)

const spaceColumns = `s.id, s.account_id, s.key, s.name, coalesce(s.description_md, '') AS description_md,
                      s.icon, s.color, s.modules, s.settings, s.is_archived, s.created_at, s.updated_at`

// ListSpaces returns the spaces the actor can read, with its role in each.
func (a *API) ListSpaces(w http.ResponseWriter, r *http.Request) {
	act := actor(r)
	a.array(w, r, `
		SELECT `+spaceColumns+`, space_member_role(s.id, $2, $3::uuid) AS my_role,
		       (SELECT count(*) FROM space_member sm WHERE sm.space_id = s.id AND sm.subject_type = 'user') AS member_count,
		       (SELECT count(*) FROM requirement r JOIN workflow_status ws ON ws.id = r.status_id
		         WHERE r.space_id = s.id AND NOT ws.is_closed) AS open_requirements
		  FROM space s
		 WHERE s.account_id = $1 AND ($4 OR NOT s.is_archived)
		   AND space_member_role(s.id, $2, $3::uuid) IS NOT NULL
		 ORDER BY s.name`, act.AccountID, act.Type, act.ID, r.URL.Query().Get("archived") == "true")
}

type spaceCreateRequest struct {
	Key         string `json:"key"  validate:"required,min=2,max=10"`
	Name        string `json:"name" validate:"required"`
	Description string `json:"description_md"`
}

// CreateSpace creates the space, makes the creator admin and adds a default board.
func (a *API) CreateSpace(w http.ResponseWriter, r *http.Request) {
	var in spaceCreateRequest
	if err := httpx.Decode(r, &in); err != nil {
		httpx.RespondError(w, err)
		return
	}
	a.rawJSON(w, r, http.StatusCreated, `
		WITH s AS (
		    INSERT INTO space (account_id, key, name, description_md, creator_id)
		    VALUES (current_setting('qg.account_id')::uuid, upper($1), $2, $3, qg_responsible_user_id())
		    RETURNING *
		), m AS (
		    INSERT INTO space_member (space_id, subject_type, subject_id, role, granted_by)
		    SELECT s.id, 'user', qg_responsible_user_id(), 'admin', qg_responsible_user_id() FROM s
		), b AS (
		    INSERT INTO board (space_id, account_id, name, creator_id)
		    SELECT s.id, s.account_id, 'Tablero Principal', qg_responsible_user_id() FROM s
		)
		SELECT to_jsonb(s) || jsonb_build_object('my_role', 'admin') FROM s`, in.Key, in.Name, in.Description)
}

func (a *API) GetSpace(w http.ResponseWriter, r *http.Request) {
	acc := authz.From(r.Context())
	a.object(w, r, `SELECT `+spaceColumns+`, $2::text AS my_role FROM space s WHERE s.id = $1`,
		acc.SpaceID, acc.Role.String())
}

func (a *API) UpdateSpace(w http.ResponseWriter, r *http.Request) {
	in, err := httpx.DecodeObject(r, "name", "description_md", "icon", "color", "modules", "settings", "is_archived")
	if err != nil {
		httpx.RespondError(w, err)
		return
	}
	acc := authz.From(r.Context())
	a.rawJSON(w, r, http.StatusOK, `
		WITH s AS (
		    UPDATE space sp SET
		        name           = coalesce(nullif(btrim(p->>'name'), ''), sp.name),
		        description_md = CASE WHEN p ? 'description_md' THEN p->>'description_md' ELSE sp.description_md END,
		        icon           = CASE WHEN p ? 'icon' THEN p->>'icon' ELSE sp.icon END,
		        color          = CASE WHEN p ? 'color' THEN p->>'color' ELSE sp.color END,
		        modules        = CASE WHEN jsonb_typeof(p->'modules') = 'object' THEN sp.modules || (p->'modules') ELSE sp.modules END,
		        settings       = CASE WHEN jsonb_typeof(p->'settings') = 'object' THEN sp.settings || (p->'settings') ELSE sp.settings END,
		        is_archived    = coalesce((p->>'is_archived')::boolean, sp.is_archived),
		        updater_id     = qg_responsible_user_id(),
		        updated_at     = now()
		      FROM (SELECT $2::jsonb AS p) x
		     WHERE sp.id = $1
		    RETURNING sp.*
		)
		SELECT to_jsonb(s) FROM s`, acc.SpaceID, jsonParam(in))
}

func (a *API) ListSpaceMembers(w http.ResponseWriter, r *http.Request) {
	acc := authz.From(r.Context())
	a.array(w, r, `
		SELECT u.id, u.display_name, u.email, u.handle, u.avatar_url, sm.role, sm.created_at
		  FROM space_member sm
		  JOIN app_user u ON u.id = sm.subject_id
		 WHERE sm.space_id = $1 AND sm.subject_type = 'user' AND u.status = 'active'
		 ORDER BY u.display_name`, acc.SpaceID)
}

type spaceMemberRequest struct {
	UserID string `json:"user_id" validate:"required,uuid"`
	Role   string `json:"role"    validate:"required,oneof=admin maintainer contributor viewer"`
}

func (a *API) AddSpaceMember(w http.ResponseWriter, r *http.Request) {
	var in spaceMemberRequest
	if err := httpx.Decode(r, &in); err != nil {
		httpx.RespondError(w, err)
		return
	}
	acc := authz.From(r.Context())
	act := actor(r)
	err := a.tx(r, func(ctx context.Context, tx pgx.Tx) error {
		tag, err := tx.Exec(ctx, `
			INSERT INTO space_member (space_id, subject_type, subject_id, role, granted_by)
			SELECT $1, 'user', u.id, $3::member_role, $4
			  FROM app_user u WHERE u.id = $2 AND u.account_id = $5
			ON CONFLICT (space_id, subject_type, subject_id) DO UPDATE SET role = EXCLUDED.role`,
			acc.SpaceID, in.UserID, in.Role, act.ID, act.AccountID)
		if err != nil {
			return err
		}
		if tag.RowsAffected() == 0 {
			return httpx.NewError(http.StatusUnprocessableEntity, "unprocessable", "el usuario no pertenece a la cuenta")
		}
		return ensureSpaceHasAdmin(ctx, tx, acc.SpaceID)
	})
	if err != nil {
		httpx.RespondError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

type spaceRoleRequest struct {
	Role string `json:"role" validate:"required,oneof=admin maintainer contributor viewer"`
}

func (a *API) UpdateSpaceMember(w http.ResponseWriter, r *http.Request) {
	var in spaceRoleRequest
	if err := httpx.Decode(r, &in); err != nil {
		httpx.RespondError(w, err)
		return
	}
	acc := authz.From(r.Context())
	userID := chi.URLParam(r, "userId")
	err := a.tx(r, func(ctx context.Context, tx pgx.Tx) error {
		if _, err := tx.Exec(ctx, `
			UPDATE space_member SET role = $3::member_role
			 WHERE space_id = $1 AND subject_id = $2 AND subject_type = 'user'`,
			acc.SpaceID, uuidOrNil(userID), in.Role); err != nil {
			return err
		}
		return ensureSpaceHasAdmin(ctx, tx, acc.SpaceID)
	})
	if err != nil {
		httpx.RespondError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (a *API) RemoveSpaceMember(w http.ResponseWriter, r *http.Request) {
	acc := authz.From(r.Context())
	userID := chi.URLParam(r, "userId")
	err := a.tx(r, func(ctx context.Context, tx pgx.Tx) error {
		if _, err := tx.Exec(ctx, `
			DELETE FROM space_member WHERE space_id = $1 AND subject_id = $2 AND subject_type = 'user'`,
			acc.SpaceID, uuidOrNil(userID)); err != nil {
			return err
		}
		return ensureSpaceHasAdmin(ctx, tx, acc.SpaceID)
	})
	if err != nil {
		httpx.RespondError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// ensureSpaceHasAdmin prevents leaving a space without any admin member.
func ensureSpaceHasAdmin(ctx context.Context, tx pgx.Tx, spaceID string) error {
	var ok bool
	if err := tx.QueryRow(ctx, `
		SELECT EXISTS (SELECT 1 FROM space_member WHERE space_id = $1 AND subject_type = 'user' AND role = 'admin')`,
		spaceID).Scan(&ok); err != nil {
		return err
	}
	if !ok {
		return httpx.NewError(http.StatusUnprocessableEntity, "unprocessable", "el espacio debe conservar al menos un administrador")
	}
	return nil
}

// ------------------------------------------------------------------ taxonomy

func (a *API) SpaceLabels(w http.ResponseWriter, r *http.Request) {
	acc := authz.From(r.Context())
	a.array(w, r, `
		SELECT l.id, l.space_id, l.name, l.slug, l.color, l.description, l.usage_count
		  FROM label l JOIN space s ON s.id = $1
		 WHERE (l.space_id = s.id OR (l.space_id IS NULL AND l.account_id = s.account_id))
		   AND NOT l.is_archived
		 ORDER BY l.name`, acc.SpaceID)
}

type labelRequest struct {
	Name        string `json:"name" validate:"required,max=60"`
	Color       string `json:"color" validate:"omitempty,oneof=gray red orange amber yellow lime green teal cyan blue indigo violet purple pink brown"`
	Description string `json:"description"`
}

func (a *API) CreateSpaceLabel(w http.ResponseWriter, r *http.Request) {
	var in labelRequest
	if err := httpx.Decode(r, &in); err != nil {
		httpx.RespondError(w, err)
		return
	}
	if in.Color == "" {
		in.Color = "blue"
	}
	acc := authz.From(r.Context())
	a.mutation(w, r, http.StatusCreated, `
		INSERT INTO label (account_id, space_id, name, slug, color, description, creator_id)
		SELECT s.account_id, s.id, btrim($2), md_slugify($2), $3::label_color, nullif($4, ''), qg_actor_id()
		  FROM space s WHERE s.id = $1
		RETURNING id, space_id, name, slug, color, description, usage_count`, acc.SpaceID, in.Name, in.Color, in.Description)
}

func (a *API) UpdateLabel(w http.ResponseWriter, r *http.Request) {
	in, err := httpx.DecodeObject(r, "name", "color", "description")
	if err != nil {
		httpx.RespondError(w, err)
		return
	}
	a.mutation(w, r, http.StatusOK, `
		UPDATE label l SET
		    name  = coalesce(nullif(btrim($2::jsonb->>'name'), ''), l.name),
		    slug  = coalesce(md_slugify(nullif(btrim($2::jsonb->>'name'), '')), l.slug),
		    color = coalesce(($2::jsonb->>'color')::label_color, l.color),
		    description = CASE WHEN $2::jsonb ? 'description' THEN $2::jsonb->>'description' ELSE l.description END
		 WHERE l.id = $1
		RETURNING id, space_id, name, slug, color, description, usage_count`, chi.URLParam(r, "id"), jsonParam(in))
}

func (a *API) DeleteLabel(w http.ResponseWriter, r *http.Request) {
	a.exec(w, r, `DELETE FROM label WHERE id = $1`, chi.URLParam(r, "id"))
}

func (a *API) ListMilestones(w http.ResponseWriter, r *http.Request) {
	acc := authz.From(r.Context())
	a.array(w, r, `
		SELECT m.id, m.space_id, m.name, m.description, m.due_date, m.status,
		       count(r.document_id) AS total,
		       count(r.document_id) FILTER (WHERE ws.is_closed) AS closed,
		       coalesce(round(avg(r.done_ratio)), 0) AS avg_done_ratio
		  FROM milestone m
		  LEFT JOIN requirement r ON r.milestone_id = m.id
		  LEFT JOIN document d ON d.id = r.document_id AND NOT d.is_archived
		  LEFT JOIN workflow_status ws ON ws.id = r.status_id
		 WHERE m.space_id = $1
		 GROUP BY m.id
		 ORDER BY m.status = 'closed', m.due_date NULLS LAST, m.name`, acc.SpaceID)
}

type milestoneRequest struct {
	Name        string  `json:"name" validate:"required"`
	Description *string `json:"description"`
	DueDate     *string `json:"due_date"`
	Status      string  `json:"status" validate:"omitempty,oneof=open locked closed"`
}

func (a *API) CreateMilestone(w http.ResponseWriter, r *http.Request) {
	var in milestoneRequest
	if err := httpx.Decode(r, &in); err != nil {
		httpx.RespondError(w, err)
		return
	}
	if in.Status == "" {
		in.Status = "open"
	}
	acc := authz.From(r.Context())
	a.mutation(w, r, http.StatusCreated, `
		INSERT INTO milestone (space_id, name, description, due_date, status)
		VALUES ($1, btrim($2), $3, nullif($4, '')::date, $5)
		RETURNING id, space_id, name, description, due_date, status`,
		acc.SpaceID, in.Name, in.Description, in.DueDate, in.Status)
}

func (a *API) UpdateMilestone(w http.ResponseWriter, r *http.Request) {
	in, err := httpx.DecodeObject(r, "name", "description", "due_date", "status")
	if err != nil {
		httpx.RespondError(w, err)
		return
	}
	a.mutation(w, r, http.StatusOK, `
		UPDATE milestone m SET
		    name        = coalesce(nullif(btrim($2::jsonb->>'name'), ''), m.name),
		    description = CASE WHEN $2::jsonb ? 'description' THEN $2::jsonb->>'description' ELSE m.description END,
		    due_date    = CASE WHEN $2::jsonb ? 'due_date' THEN nullif($2::jsonb->>'due_date', '')::date ELSE m.due_date END,
		    status      = coalesce(nullif($2::jsonb->>'status', ''), m.status)
		 WHERE m.id = $1
		RETURNING id, space_id, name, description, due_date, status`, chi.URLParam(r, "id"), jsonParam(in))
}

func (a *API) DeleteMilestone(w http.ResponseWriter, r *http.Request) {
	a.exec(w, r, `DELETE FROM milestone WHERE id = $1`, chi.URLParam(r, "id"))
}

func (a *API) ListCategories(w http.ResponseWriter, r *http.Request) {
	acc := authz.From(r.Context())
	a.array(w, r, `
		SELECT id, space_id, name, slug, description, default_user_id, ord
		  FROM category WHERE space_id = $1 AND is_active ORDER BY ord, name`, acc.SpaceID)
}

type categoryRequest struct {
	Name          string  `json:"name" validate:"required"`
	Description   *string `json:"description"`
	DefaultUserID *string `json:"default_user_id" validate:"omitempty,uuid"`
}

func (a *API) CreateCategory(w http.ResponseWriter, r *http.Request) {
	var in categoryRequest
	if err := httpx.Decode(r, &in); err != nil {
		httpx.RespondError(w, err)
		return
	}
	acc := authz.From(r.Context())
	a.mutation(w, r, http.StatusCreated, `
		INSERT INTO category (space_id, name, slug, description, default_user_id)
		VALUES ($1, btrim($2), md_slugify($2), $3, $4)
		RETURNING id, space_id, name, slug, description, default_user_id, ord`,
		acc.SpaceID, in.Name, in.Description, in.DefaultUserID)
}

func (a *API) UpdateCategory(w http.ResponseWriter, r *http.Request) {
	in, err := httpx.DecodeObject(r, "name", "description", "default_user_id", "ord")
	if err != nil {
		httpx.RespondError(w, err)
		return
	}
	a.mutation(w, r, http.StatusOK, `
		UPDATE category c SET
		    name        = coalesce(nullif(btrim($2::jsonb->>'name'), ''), c.name),
		    description = CASE WHEN $2::jsonb ? 'description' THEN $2::jsonb->>'description' ELSE c.description END,
		    default_user_id = CASE WHEN $2::jsonb ? 'default_user_id' THEN nullif($2::jsonb->>'default_user_id', '')::uuid ELSE c.default_user_id END,
		    ord         = coalesce(($2::jsonb->>'ord')::int, c.ord)
		 WHERE c.id = $1
		RETURNING id, space_id, name, slug, description, default_user_id, ord`, chi.URLParam(r, "id"), jsonParam(in))
}

func (a *API) DeleteCategory(w http.ResponseWriter, r *http.Request) {
	a.exec(w, r, `UPDATE category SET is_active = false WHERE id = $1`, chi.URLParam(r, "id"))
}
