package handlers

import (
	"context"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/nespina/quagenticus/internal/httpx"
)

// linkProjection shows every link from the point of view of document $1:
// outgoing links keep their type, incoming ones use the inverse wording.
const linkProjection = `
	SELECT dl.id, dl.source_id, dl.target_id,
	       CASE WHEN dl.source_id = $1 THEN 'outgoing' ELSE 'incoming' END AS direction,
	       CASE WHEN dl.source_id = $1 THEN dl.link_type::text ELSE link_type_inverse(dl.link_type) END AS link_type,
	       dl.link_type::text AS raw_link_type,
	       o.id AS other_id,
	       coalesce(o.title, dl.target_text) AS target_title,
	       o.slug AS target_slug, o.ref_key AS target_ref_key, o.space_id AS target_space_id,
	       coalesce(o.doc_type::text, 'broken') AS target_type,
	       ws.name AS target_status_name, ws.color AS target_status_color, ws.is_closed AS target_is_closed,
	       dl.is_derived, dl.source_journal_id, dl.target_text,
	       coalesce(dl.note, '') AS note, dl.created_at
	  FROM document_link dl
	  LEFT JOIN document o ON o.id = CASE WHEN dl.source_id = $1 THEN dl.target_id ELSE dl.source_id END
	  LEFT JOIN requirement r ON r.document_id = o.id
	  LEFT JOIN workflow_status ws ON ws.id = r.status_id
	 WHERE (dl.source_id = $1 OR dl.target_id = $1)
	   AND (o.id IS NULL OR NOT o.is_archived)`

// ListLinks returns manual links (both directions) plus outgoing derived links.
func (a *API) ListLinks(w http.ResponseWriter, r *http.Request) {
	a.array(w, r, linkProjection+`
	   AND (NOT dl.is_derived OR dl.source_id = $1)
	 ORDER BY dl.is_derived, dl.created_at DESC`, chi.URLParam(r, "id"))
}

// ListBacklinks returns derived links (wikilinks and #mentions) pointing here.
func (a *API) ListBacklinks(w http.ResponseWriter, r *http.Request) {
	a.array(w, r, linkProjection+`
	   AND dl.is_derived AND dl.target_id = $1
	 ORDER BY dl.created_at DESC`, chi.URLParam(r, "id"))
}

type linkCreateRequest struct {
	TargetID string `json:"target_id" validate:"required,uuid"`
	LinkType string `json:"link_type" validate:"omitempty,oneof=relates duplicates duplicated_by blocks blocked_by precedes follows parent_of child_of specifies implements"`
	Note     string `json:"note"`
}

func (a *API) CreateLink(w http.ResponseWriter, r *http.Request) {
	var in linkCreateRequest
	if err := httpx.Decode(r, &in); err != nil {
		httpx.RespondError(w, err)
		return
	}
	if in.LinkType == "" {
		in.LinkType = "relates"
	}
	docID := chi.URLParam(r, "id")
	act := actor(r)
	// the target must be readable by the actor too
	var targetSpace string
	if err := a.db.Pool.QueryRow(r.Context(), `SELECT space_id FROM document WHERE id = $1`, in.TargetID).Scan(&targetSpace); err != nil {
		httpx.RespondError(w, err)
		return
	}
	if role, err := a.guard.SpaceRole(r.Context(), act, targetSpace); err != nil || role == 0 {
		httpx.RespondError(w, httpx.ErrNotFound)
		return
	}
	var linkID string
	err := a.tx(r, func(ctx context.Context, tx pgx.Tx) error {
		return tx.QueryRow(ctx, `SELECT id FROM document_link_create($1, $2, $3::link_type, nullif($4, ''))`,
			docID, in.TargetID, in.LinkType, in.Note).Scan(&linkID)
	})
	if err != nil {
		httpx.RespondError(w, err)
		return
	}
	a.rawJSON(w, r, http.StatusCreated, `SELECT to_jsonb(q) FROM (`+linkProjection+` AND dl.id = $2) q`, docID, linkID)
}

func (a *API) DeleteLink(w http.ResponseWriter, r *http.Request) {
	a.exec(w, r, `SELECT document_link_delete($1, $2)`, chi.URLParam(r, "id"), uuidOrNil(chi.URLParam(r, "linkId")))
}
