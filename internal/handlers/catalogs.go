package handlers

import (
	"context"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/nespina/quagenticus/internal/httpx"
)

func (a *API) Trackers(w http.ResponseWriter, r *http.Request) {
	a.array(w, r, `
		SELECT t.id, t.key, t.name, t.description, t.icon, t.color, t.default_status_id, t.ord,
		       t.is_active, t.is_agent_enabled, t.template_id, tpl.body_md AS template_body_md
		  FROM tracker t
		  LEFT JOIN document tpl ON tpl.id = t.template_id AND NOT tpl.is_archived
		 WHERE t.account_id = $1 AND ($2 OR t.is_active)
		 ORDER BY t.ord, t.name`, actor(r).AccountID, r.URL.Query().Get("all") == "true")
}

func (a *API) Priorities(w http.ResponseWriter, r *http.Request) {
	a.array(w, r, `
		SELECT id, key, name, weight, color, is_default FROM priority
		 WHERE account_id = $1 ORDER BY weight DESC`, actor(r).AccountID)
}

func (a *API) Statuses(w http.ResponseWriter, r *http.Request) {
	a.array(w, r, `
		SELECT id, key, name, color, ord, is_default, is_closed, is_agent_claimable, requires_resolution
		  FROM workflow_status WHERE account_id = $1 ORDER BY ord, name`, actor(r).AccountID)
}

// Labels lists account-wide labels (space labels come from /spaces/{id}/labels).
func (a *API) Labels(w http.ResponseWriter, r *http.Request) {
	a.array(w, r, `
		SELECT id, space_id, name, slug, color, description, usage_count FROM label
		 WHERE account_id = $1 AND space_id IS NULL AND NOT is_archived ORDER BY name`, actor(r).AccountID)
}

// ------------------------------------------------------------ account admin

func (a *API) AdminSaveStatus(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	in, err := httpx.DecodeObject(r, "key", "name", "color", "ord", "is_default", "is_closed", "is_agent_claimable", "requires_resolution")
	if err != nil {
		httpx.RespondError(w, err)
		return
	}
	act := actor(r)
	var out []byte
	err = a.tx(r, func(ctx context.Context, tx pgx.Tx) error {
		if in["is_default"] != nil && string(in["is_default"]) == "true" {
			if _, err := tx.Exec(ctx, `UPDATE workflow_status SET is_default = false WHERE account_id = $1`, act.AccountID); err != nil {
				return err
			}
		}
		if id == "" {
			if err := tx.QueryRow(ctx, `
				WITH s AS (
				    INSERT INTO workflow_status (account_id, key, name, color, ord, is_default, is_closed, is_agent_claimable, requires_resolution)
				    SELECT $1, coalesce(nullif(p->>'key', ''), md_slugify(p->>'name')), p->>'name', p->>'color',
				           coalesce((p->>'ord')::int, (SELECT coalesce(max(ord), 0) + 10 FROM workflow_status WHERE account_id = $1)),
				           coalesce((p->>'is_default')::boolean, false), coalesce((p->>'is_closed')::boolean, false),
				           coalesce((p->>'is_agent_claimable')::boolean, false), coalesce((p->>'requires_resolution')::boolean, false)
				      FROM (SELECT $2::jsonb AS p) x
				    RETURNING *
				), tr AS (
				    -- new statuses are reachable from anywhere until an admin restricts the workflow
				    INSERT INTO workflow_transition (tracker_id, from_status_id, to_status_id)
				    SELECT t.id, NULL, s.id FROM tracker t, s WHERE t.account_id = $1
				    ON CONFLICT DO NOTHING
				)
				SELECT to_jsonb(s) FROM s`, act.AccountID, jsonParam(in)).Scan(&out); err != nil {
				return err
			}
			return nil
		}
		return tx.QueryRow(ctx, `
			WITH s AS (
			    UPDATE workflow_status ws SET
			        name  = coalesce(nullif(p->>'name', ''), ws.name),
			        color = CASE WHEN p ? 'color' THEN p->>'color' ELSE ws.color END,
			        ord   = coalesce((p->>'ord')::int, ws.ord),
			        is_default = coalesce((p->>'is_default')::boolean, ws.is_default),
			        is_closed  = coalesce((p->>'is_closed')::boolean, ws.is_closed),
			        is_agent_claimable  = coalesce((p->>'is_agent_claimable')::boolean, ws.is_agent_claimable),
			        requires_resolution = coalesce((p->>'requires_resolution')::boolean, ws.requires_resolution)
			      FROM (SELECT $3::jsonb AS p) x
			     WHERE ws.id = $1 AND ws.account_id = $2
			    RETURNING ws.*
			)
			SELECT to_jsonb(s) FROM s`, uuidOrNil(id), act.AccountID, jsonParam(in)).Scan(&out)
	})
	if err != nil {
		httpx.RespondError(w, err)
		return
	}
	status := http.StatusOK
	if id == "" {
		status = http.StatusCreated
	}
	httpx.RespondRawJSON(w, status, out)
}

func (a *API) AdminDeleteStatus(w http.ResponseWriter, r *http.Request) {
	a.exec(w, r, `DELETE FROM workflow_status WHERE id = $1 AND account_id = $2`,
		uuidOrNil(chi.URLParam(r, "id")), actor(r).AccountID)
}

type orderRequest struct {
	IDs []string `json:"ids" validate:"required,dive,uuid"`
}

func (a *API) AdminReorderStatuses(w http.ResponseWriter, r *http.Request) {
	var in orderRequest
	if err := httpx.Decode(r, &in); err != nil {
		httpx.RespondError(w, err)
		return
	}
	a.exec(w, r, `
		UPDATE workflow_status ws SET ord = o.n * 10
		  FROM unnest($1::uuid[]) WITH ORDINALITY AS o(id, n)
		 WHERE ws.id = o.id AND ws.account_id = $2`, in.IDs, actor(r).AccountID)
}

func (a *API) AdminSaveTracker(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	in, err := httpx.DecodeObject(r, "key", "name", "description", "icon", "color", "default_status_id", "template_id", "ord", "is_active", "is_agent_enabled")
	if err != nil {
		httpx.RespondError(w, err)
		return
	}
	act := actor(r)
	if id == "" {
		a.rawJSON(w, r, http.StatusCreated, `
			WITH t AS (
			    INSERT INTO tracker (account_id, key, name, description, icon, color, default_status_id, template_id, ord, is_active, is_agent_enabled)
			    SELECT $1, coalesce(nullif(p->>'key', ''), md_slugify(p->>'name')), p->>'name', p->>'description', p->>'icon', p->>'color',
			           nullif(p->>'default_status_id', '')::uuid, nullif(p->>'template_id', '')::uuid,
			           coalesce((p->>'ord')::int, 0), coalesce((p->>'is_active')::boolean, true),
			           coalesce((p->>'is_agent_enabled')::boolean, true)
			      FROM (SELECT $2::jsonb AS p) x
			    RETURNING *
			), tr AS (
			    INSERT INTO workflow_transition (tracker_id, from_status_id, to_status_id)
			    SELECT t.id, NULL, s.id FROM t, workflow_status s WHERE s.account_id = $1
			)
			SELECT to_jsonb(t) FROM t`, act.AccountID, jsonParam(in))
		return
	}
	a.rawJSON(w, r, http.StatusOK, `
		WITH t AS (
		    UPDATE tracker tr SET
		        name        = coalesce(nullif(p->>'name', ''), tr.name),
		        description = CASE WHEN p ? 'description' THEN p->>'description' ELSE tr.description END,
		        icon        = CASE WHEN p ? 'icon' THEN p->>'icon' ELSE tr.icon END,
		        color       = CASE WHEN p ? 'color' THEN p->>'color' ELSE tr.color END,
		        default_status_id = CASE WHEN p ? 'default_status_id' THEN nullif(p->>'default_status_id', '')::uuid ELSE tr.default_status_id END,
		        template_id = CASE WHEN p ? 'template_id' THEN nullif(p->>'template_id', '')::uuid ELSE tr.template_id END,
		        ord         = coalesce((p->>'ord')::int, tr.ord),
		        is_active   = coalesce((p->>'is_active')::boolean, tr.is_active),
		        is_agent_enabled = coalesce((p->>'is_agent_enabled')::boolean, tr.is_agent_enabled)
		      FROM (SELECT $3::jsonb AS p) x
		     WHERE tr.id = $1 AND tr.account_id = $2
		    RETURNING tr.*
		)
		SELECT to_jsonb(t) FROM t`, uuidOrNil(id), act.AccountID, jsonParam(in))
}

func (a *API) AdminSavePriority(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	in, err := httpx.DecodeObject(r, "key", "name", "weight", "color", "is_default")
	if err != nil {
		httpx.RespondError(w, err)
		return
	}
	act := actor(r)
	var out []byte
	err = a.tx(r, func(ctx context.Context, tx pgx.Tx) error {
		if in["is_default"] != nil && string(in["is_default"]) == "true" {
			if _, err := tx.Exec(ctx, `UPDATE priority SET is_default = false WHERE account_id = $1`, act.AccountID); err != nil {
				return err
			}
		}
		if id == "" {
			return tx.QueryRow(ctx, `
				WITH p AS (
				    INSERT INTO priority (account_id, key, name, weight, color, is_default)
				    SELECT $1, coalesce(nullif(j->>'key', ''), md_slugify(j->>'name')), j->>'name',
				           coalesce((j->>'weight')::int, 0), j->>'color', coalesce((j->>'is_default')::boolean, false)
				      FROM (SELECT $2::jsonb AS j) x
				    RETURNING *
				) SELECT to_jsonb(p) FROM p`, act.AccountID, jsonParam(in)).Scan(&out)
		}
		return tx.QueryRow(ctx, `
			WITH p AS (
			    UPDATE priority pr SET
			        name = coalesce(nullif(j->>'name', ''), pr.name),
			        weight = coalesce((j->>'weight')::int, pr.weight),
			        color = CASE WHEN j ? 'color' THEN j->>'color' ELSE pr.color END,
			        is_default = coalesce((j->>'is_default')::boolean, pr.is_default)
			      FROM (SELECT $3::jsonb AS j) x
			     WHERE pr.id = $1 AND pr.account_id = $2
			    RETURNING pr.*
			) SELECT to_jsonb(p) FROM p`, uuidOrNil(id), act.AccountID, jsonParam(in)).Scan(&out)
	})
	if err != nil {
		httpx.RespondError(w, err)
		return
	}
	httpx.RespondRawJSON(w, http.StatusOK, out)
}

func (a *API) AdminTransitions(w http.ResponseWriter, r *http.Request) {
	a.array(w, r, `
		SELECT wt.id, wt.tracker_id, wt.from_status_id, wt.to_status_id, wt.allowed_roles, wt.allowed_actors,
		       wt.requires_comment, wt.requires_assignee, wt.requires_readiness
		  FROM workflow_transition wt
		  JOIN tracker t ON t.id = wt.tracker_id
		 WHERE t.account_id = $1 AND t.id = $2
		 ORDER BY wt.from_status_id NULLS FIRST`, actor(r).AccountID, uuidOrNil(chi.URLParam(r, "id")))
}

type transitionRule struct {
	FromStatusID      *string  `json:"from_status_id" validate:"omitempty,uuid"`
	ToStatusID        string   `json:"to_status_id"   validate:"required,uuid"`
	AllowedRoles      []string `json:"allowed_roles"  validate:"dive,oneof=viewer contributor maintainer admin"`
	AllowedActors     []string `json:"allowed_actors" validate:"dive,oneof=user agent"`
	RequiresComment   bool     `json:"requires_comment"`
	RequiresAssignee  bool     `json:"requires_assignee"`
	RequiresReadiness bool     `json:"requires_readiness"`
}

type transitionsRequest struct {
	Rules []transitionRule `json:"rules" validate:"dive"`
}

// AdminReplaceTransitions replaces the workflow matrix of a tracker.
func (a *API) AdminReplaceTransitions(w http.ResponseWriter, r *http.Request) {
	trackerID := chi.URLParam(r, "id")
	var in transitionsRequest
	if err := httpx.Decode(r, &in); err != nil {
		httpx.RespondError(w, err)
		return
	}
	act := actor(r)
	err := a.tx(r, func(ctx context.Context, tx pgx.Tx) error {
		var ok bool
		if err := tx.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM tracker WHERE id = $1 AND account_id = $2)`,
			uuidOrNil(trackerID), act.AccountID).Scan(&ok); err != nil {
			return err
		}
		if !ok {
			return httpx.ErrNotFound
		}
		if _, err := tx.Exec(ctx, `DELETE FROM workflow_transition WHERE tracker_id = $1`, trackerID); err != nil {
			return err
		}
		for _, rule := range in.Rules {
			roles := rule.AllowedRoles
			if len(roles) == 0 {
				roles = []string{"contributor", "maintainer", "admin"}
			}
			actors := rule.AllowedActors
			if len(actors) == 0 {
				actors = []string{"user", "agent"}
			}
			if _, err := tx.Exec(ctx, `
				INSERT INTO workflow_transition (tracker_id, from_status_id, to_status_id, allowed_roles, allowed_actors,
				                                 requires_comment, requires_assignee, requires_readiness)
				SELECT $1, $2, $3, $4::member_role[], $5::actor_type[], $6, $7, $8
				 WHERE EXISTS (SELECT 1 FROM workflow_status WHERE id = $3 AND account_id = $9)
				ON CONFLICT DO NOTHING`,
				trackerID, rule.FromStatusID, rule.ToStatusID, roles, actors,
				rule.RequiresComment, rule.RequiresAssignee, rule.RequiresReadiness, act.AccountID); err != nil {
				return err
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
