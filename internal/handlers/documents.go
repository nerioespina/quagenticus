package handlers

import (
	"context"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/nespina/quagenticus/internal/authz"
	"github.com/nespina/quagenticus/internal/httpx"
)

const documentColumns = `d.id, d.space_id, d.parent_id, d.doc_type, d.ref_key, d.slug, d.title,
       d.version, d.is_archived, d.archived_at, d.position, d.depth, d.word_count, d.created_at, d.updated_at,
       d.creator_id, cu.display_name AS creator_name, d.updater_id, uu.display_name AS updater_name`

// ListDocuments filters by ?type (comma list; default: everything but requirements),
// ?parent_id (uuid|root), ?archived=true, ?favorites=true, ?q. Bodies are
// replaced by a 200-char excerpt.
func (a *API) ListDocuments(w http.ResponseWriter, r *http.Request) {
	acc := authz.From(r.Context())
	act := actor(r)
	q := r.URL.Query()
	types := httpx.QueryList(r, "type")
	if len(types) == 0 && q.Get("all") != "true" {
		types = []string{"folder", "note", "wiki", "template"}
	}
	parent := q.Get("parent_id")
	a.array(w, r, `
		SELECT `+documentColumns+`, left(regexp_replace(d.body_md, '\s+', ' ', 'g'), 200) AS excerpt,
		       EXISTS (SELECT 1 FROM document_favorite f WHERE f.document_id = d.id AND f.user_id = $6::uuid) AS is_favorite,
		       (SELECT count(*) FROM document c WHERE c.parent_id = d.id AND NOT c.is_archived) AS children_count,
		       coalesce((SELECT jsonb_agg(jsonb_build_object('id', l.id, 'name', l.name, 'color', l.color) ORDER BY l.name)
		                   FROM document_label dl JOIN label l ON l.id = dl.label_id WHERE dl.document_id = d.id), '[]') AS labels
		  FROM document d
		  LEFT JOIN app_user cu ON cu.id = d.creator_id
		  LEFT JOIN app_user uu ON uu.id = d.updater_id
		 WHERE d.space_id = $1
		   AND d.is_archived = $2
		   AND ($3::text[] IS NULL OR d.doc_type::text = ANY ($3))
		   AND ($4 = '' OR ($4 = 'root' AND d.parent_id IS NULL) OR d.parent_id::text = $4)
		   AND ($5 = '' OR qg_unaccent(d.title) ILIKE '%' || qg_unaccent($5) || '%' OR d.search_tsv @@ websearch_to_tsquery('spanish', $5))
		   AND (NOT $7 OR EXISTS (SELECT 1 FROM document_favorite f WHERE f.document_id = d.id AND f.user_id = $6::uuid))
		 ORDER BY d.doc_type <> 'folder', d.position, d.title`,
		acc.SpaceID, q.Get("archived") == "true", types, parent, q.Get("q"), uuidOrNil(act.ID), q.Get("favorites") == "true")
}

type documentCreateRequest struct {
	ParentID *string `json:"parent_id" validate:"omitempty,uuid"`
	DocType  string  `json:"doc_type"  validate:"required,oneof=folder note wiki template"`
	Title    string  `json:"title"     validate:"required"`
	BodyMD   string  `json:"body_md"`
}

func (a *API) CreateDocument(w http.ResponseWriter, r *http.Request) {
	var in documentCreateRequest
	if err := httpx.Decode(r, &in); err != nil {
		httpx.RespondError(w, err)
		return
	}
	acc := authz.From(r.Context())
	var id string
	err := a.tx(r, func(ctx context.Context, tx pgx.Tx) error {
		if in.ParentID != nil {
			var ok bool
			if err := tx.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM document WHERE id = $1 AND space_id = $2 AND doc_type = 'folder' AND NOT is_archived)`,
				*in.ParentID, acc.SpaceID).Scan(&ok); err != nil {
				return err
			}
			if !ok {
				return httpx.NewError(http.StatusUnprocessableEntity, "unprocessable", "la carpeta destino no existe")
			}
		}
		if err := tx.QueryRow(ctx, `SELECT id FROM document_create($1, $2, $3::document_type, $4, $5)`,
			acc.SpaceID, in.ParentID, in.DocType, in.Title, in.BodyMD).Scan(&id); err != nil {
			return err
		}
		_, err := tx.Exec(ctx, `SELECT document_set_parent($1, $2)`, id, in.ParentID)
		return err
	})
	if err != nil {
		httpx.RespondError(w, err)
		return
	}
	a.writeDocument(w, r, http.StatusCreated, id)
}

func (a *API) GetDocument(w http.ResponseWriter, r *http.Request) {
	a.writeDocument(w, r, http.StatusOK, chi.URLParam(r, "id"))
}

func (a *API) writeDocument(w http.ResponseWriter, r *http.Request, status int, id string) {
	act := actor(r)
	acc := authz.From(r.Context())
	a.rawJSON(w, r, status, `
		SELECT to_jsonb(x) FROM (
		    SELECT `+documentColumns+`, d.body_md, d.front_matter,
		           EXISTS (SELECT 1 FROM document_favorite f WHERE f.document_id = d.id AND f.user_id = $2::uuid) AS is_favorite,
		           EXISTS (SELECT 1 FROM watcher WHERE document_id = d.id AND subject_type = $3::actor_type AND subject_id = $4::uuid) AS is_watching,
		           $5::text AS my_role,
		           coalesce((SELECT jsonb_agg(jsonb_build_object('id', l.id, 'name', l.name, 'color', l.color) ORDER BY l.name)
		                       FROM document_label dl JOIN label l ON l.id = dl.label_id WHERE dl.document_id = d.id), '[]') AS labels,
		           coalesce((SELECT jsonb_agg(jsonb_build_object('ord', s.ord, 'level', s.level, 'heading', s.heading, 'slug', s.slug) ORDER BY s.ord)
		                       FROM document_section s WHERE s.document_id = d.id), '[]') AS sections,
		           coalesce((WITH RECURSIVE anc AS (
		                        SELECT p.id, p.parent_id, p.title, 1 AS lvl FROM document p WHERE p.id = d.parent_id
		                        UNION ALL
		                        SELECT p.id, p.parent_id, p.title, anc.lvl + 1 FROM document p JOIN anc ON p.id = anc.parent_id WHERE anc.lvl < 20
		                     ) SELECT jsonb_agg(jsonb_build_object('id', id, 'title', title) ORDER BY lvl DESC) FROM anc), '[]') AS breadcrumbs
		      FROM document d
		      LEFT JOIN app_user cu ON cu.id = d.creator_id
		      LEFT JOIN app_user uu ON uu.id = d.updater_id
		     WHERE d.id = $1
		) x`, uuidOrNil(id), uuidOrNil(act.ID), act.Type, act.ID, acc.Role.String())
}

func (a *API) UpdateDocument(w http.ResponseWriter, r *http.Request) {
	in, err := httpx.DecodeObject(r, "title", "body_md", "version", "doc_type")
	if err != nil {
		httpx.RespondError(w, err)
		return
	}
	id := chi.URLParam(r, "id")
	err = a.tx(r, func(ctx context.Context, tx pgx.Tx) error {
		var docType string
		if err := tx.QueryRow(ctx, `SELECT doc_type FROM document WHERE id = $1`, id).Scan(&docType); err != nil {
			return err
		}
		if docType == "requirement" {
			var version any
			if v, ok := in["version"]; ok {
				version = string(v)
			}
			patch := map[string]any{}
			if v, ok := in["title"]; ok {
				patch["title"] = v
			}
			if v, ok := in["body_md"]; ok {
				patch["body_md"] = v
			}
			_, err := tx.Exec(ctx, `SELECT requirement_patch($1, $2::jsonb, $3::int)`, id, jsonParam(patch), version)
			return err
		}
		_, err := tx.Exec(ctx, `
			SELECT document_update($1, $2::jsonb->>'title', $2::jsonb->>'body_md', ($2::jsonb->>'version')::int)`,
			id, jsonParam(in))
		if err != nil {
			return err
		}
		if t, ok := in["doc_type"]; ok {
			_, err = tx.Exec(ctx, `
				UPDATE document SET doc_type = ($2::jsonb #>> '{}')::document_type
				 WHERE id = $1 AND doc_type IN ('note', 'wiki', 'template') AND ($2::jsonb #>> '{}') IN ('note', 'wiki', 'template')`,
				id, string(t))
		}
		return err
	})
	if err != nil {
		httpx.RespondError(w, err)
		return
	}
	a.writeDocument(w, r, http.StatusOK, id)
}

type documentMoveRequest struct {
	ParentID *string `json:"parent_id" validate:"omitempty,uuid"`
	BeforeID *string `json:"before_id" validate:"omitempty,uuid"`
	AfterID  *string `json:"after_id"  validate:"omitempty,uuid"`
}

func (a *API) MoveDocument(w http.ResponseWriter, r *http.Request) {
	var in documentMoveRequest
	if err := httpx.Decode(r, &in); err != nil {
		httpx.RespondError(w, err)
		return
	}
	id := chi.URLParam(r, "id")
	err := a.tx(r, func(ctx context.Context, tx pgx.Tx) error {
		_, err := tx.Exec(ctx, `SELECT document_move($1, $2, $3, $4)`, id, in.ParentID, in.BeforeID, in.AfterID)
		return err
	})
	if err != nil {
		httpx.RespondError(w, err)
		return
	}
	a.writeDocument(w, r, http.StatusOK, id)
}

func (a *API) DocumentHistory(w http.ResponseWriter, r *http.Request) {
	a.array(w, r, `
		SELECT v.id, v.document_id, v.version, v.title, length(v.body_md) AS length, v.change_summary,
		       v.actor_type, v.actor_id, coalesce(u.display_name, ag.name) AS actor_name, v.created_at
		  FROM document_version v
		  LEFT JOIN app_user u ON u.id = v.actor_id AND v.actor_type = 'user'
		  LEFT JOIN agent ag ON ag.id = v.actor_id AND v.actor_type = 'agent'
		 WHERE v.document_id = $1
		 ORDER BY v.version DESC`, chi.URLParam(r, "id"))
}

func (a *API) DocumentVersion(w http.ResponseWriter, r *http.Request) {
	a.object(w, r, `
		SELECT id, document_id, version, title, body_md, change_summary, actor_type, actor_id, created_at
		  FROM document_version WHERE document_id = $1 AND version = $2::int`,
		chi.URLParam(r, "id"), chi.URLParam(r, "version"))
}

type restoreVersionRequest struct {
	Version int `json:"version" validate:"required,min=1"`
}

func (a *API) RestoreDocumentVersion(w http.ResponseWriter, r *http.Request) {
	var in restoreVersionRequest
	if err := httpx.Decode(r, &in); err != nil {
		httpx.RespondError(w, err)
		return
	}
	id := chi.URLParam(r, "id")
	err := a.tx(r, func(ctx context.Context, tx pgx.Tx) error {
		var title, body, docType string
		if err := tx.QueryRow(ctx, `
			SELECT v.title, v.body_md, d.doc_type FROM document_version v JOIN document d ON d.id = v.document_id
			 WHERE v.document_id = $1 AND v.version = $2`, id, in.Version).Scan(&title, &body, &docType); err != nil {
			return err
		}
		if docType == "requirement" {
			_, err := tx.Exec(ctx, `SELECT requirement_patch($1, jsonb_build_object('title', $2::text, 'body_md', $3::text))`, id, title, body)
			return err
		}
		_, err := tx.Exec(ctx, `SELECT document_update($1, $2, $3, NULL)`, id, title, body)
		return err
	})
	if err != nil {
		httpx.RespondError(w, err)
		return
	}
	a.writeDocument(w, r, http.StatusOK, id)
}

func (a *API) FavoriteDocument(w http.ResponseWriter, r *http.Request) {
	a.exec(w, r, `
		WITH f AS (INSERT INTO document_favorite (document_id, user_id) VALUES ($1, qg_responsible_user_id()) ON CONFLICT DO NOTHING RETURNING 1)
		UPDATE document SET is_favorite_count = is_favorite_count + (SELECT count(*) FROM f) WHERE id = $1`, chi.URLParam(r, "id"))
}

func (a *API) UnfavoriteDocument(w http.ResponseWriter, r *http.Request) {
	a.exec(w, r, `
		WITH f AS (DELETE FROM document_favorite WHERE document_id = $1 AND user_id = qg_responsible_user_id() RETURNING 1)
		UPDATE document SET is_favorite_count = greatest(is_favorite_count - (SELECT count(*) FROM f), 0) WHERE id = $1`, chi.URLParam(r, "id"))
}

type promoteRequest struct {
	TrackerID  string  `json:"tracker_id"  validate:"required,uuid"`
	PriorityID *string `json:"priority_id" validate:"omitempty,uuid"`
}

func (a *API) PromoteDocument(w http.ResponseWriter, r *http.Request) {
	var in promoteRequest
	if err := httpx.Decode(r, &in); err != nil {
		httpx.RespondError(w, err)
		return
	}
	id := chi.URLParam(r, "id")
	var ref string
	err := a.tx(r, func(ctx context.Context, tx pgx.Tx) error {
		return tx.QueryRow(ctx, `SELECT document_promote($1, $2, $3)`, id, in.TrackerID, in.PriorityID).Scan(&ref)
	})
	if err != nil {
		httpx.RespondError(w, err)
		return
	}
	httpx.RespondJSON(w, http.StatusOK, map[string]string{"id": id, "ref_key": ref})
}

// ExportDocument downloads the markdown source with a small front matter.
func (a *API) ExportDocument(w http.ResponseWriter, r *http.Request) {
	var slug, md string
	err := a.tx(r, func(ctx context.Context, tx pgx.Tx) error {
		return tx.QueryRow(ctx, `
			SELECT coalesce(ref_key, slug),
			       E'---\n' || 'title: "' || replace(title, '"', '\"') || E'"\n' ||
			       coalesce('ref: ' || ref_key || E'\n', '') ||
			       'type: ' || doc_type || E'\n' || 'version: ' || version || E'\n' ||
			       'updated_at: ' || to_char(updated_at, 'YYYY-MM-DD"T"HH24:MI:SSOF') || E'\n---\n\n' || body_md
			  FROM document WHERE id = $1`, chi.URLParam(r, "id")).Scan(&slug, &md)
	})
	if err != nil {
		httpx.RespondError(w, err)
		return
	}
	w.Header().Set("Content-Type", "text/markdown; charset=utf-8")
	w.Header().Set("Content-Disposition", contentDisposition("attachment", slug+".md"))
	w.Write([]byte(md)) //nolint:errcheck
}
