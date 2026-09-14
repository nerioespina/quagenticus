package handlers

import (
	"net/http"
	"strings"

	"github.com/nespina/quagenticus/internal/authz"
	"github.com/nespina/quagenticus/internal/httpx"
)

// Suggest powers @/#/[[ autocompletion and member pickers.
func (a *API) Suggest(w http.ResponseWriter, r *http.Request) {
	acc := authz.From(r.Context())
	types := httpx.QueryList(r, "types")
	if len(types) == 0 {
		types = []string{"requirement", "document", "user"}
	}
	a.array(w, r, `SELECT * FROM search_suggest($1, $2, $3::text[], $4)`,
		acc.SpaceID, r.URL.Query().Get("q"), types, httpx.QueryInt(r, "limit", 8, 1, 50))
}

// ResolveRefs resolves many references at once for rendering chips:
// ?keys=12,DEMO-7 (requirements), ?titles=Glosario|Otra (wikilinks), ?handles=ana,bob.
func (a *API) ResolveRefs(w http.ResponseWriter, r *http.Request) {
	acc := authz.From(r.Context())
	q := r.URL.Query()
	var titles []string
	if t := strings.TrimSpace(q.Get("titles")); t != "" {
		titles = strings.Split(t, "|")
	}
	a.rawJSON(w, r, http.StatusOK, `
		WITH sp AS (SELECT id, key, account_id FROM space WHERE id = $1),
		keys AS (
		    SELECT k, CASE WHEN k ~ '^[0-9]+$' THEN (SELECT key FROM sp) || '-' || k ELSE upper(k) END AS ref
		      FROM unnest($2::text[]) AS k
		),
		reqs AS (
		    SELECT keys.k, jsonb_build_object('kind', 'requirement', 'id', v.id, 'ref_key', v.ref_key, 'title', v.title,
		           'space_id', v.space_id, 'status_name', v.status_name, 'status_color', v.status_color,
		           'is_closed', v.status_is_closed) AS obj
		      FROM keys JOIN v_requirement v ON v.ref_key = keys.ref
		      JOIN sp ON sp.account_id = v.account_id
		     WHERE space_member_role(v.space_id, current_setting('qg.actor_type'), current_setting('qg.actor_id')::uuid) IS NOT NULL
		),
		docs AS (
		    SELECT DISTINCT ON (lower(t)) t AS k, jsonb_build_object('kind', 'document', 'id', d.id, 'title', d.title,
		           'doc_type', d.doc_type, 'space_id', d.space_id, 'ref_key', d.ref_key) AS obj
		      FROM unnest($3::text[]) AS t
		      JOIN document d ON d.space_id = $1 AND NOT d.is_archived
		                     AND (lower(d.title) = lower(btrim(t)) OR d.slug = md_slugify(t) OR d.ref_key = upper(btrim(t)))
		     ORDER BY lower(t), (lower(d.title) = lower(btrim(t))) DESC
		),
		users AS (
		    SELECT h AS k, jsonb_build_object('kind', 'user', 'id', u.id, 'handle', u.handle, 'display_name', u.display_name,
		           'avatar_url', u.avatar_url) AS obj
		      FROM unnest($4::text[]) AS h
		      JOIN app_user u ON u.handle = lower(h) AND u.account_id = (SELECT account_id FROM sp) AND u.status = 'active'
		)
		SELECT jsonb_build_object(
		    'requirements', coalesce((SELECT jsonb_object_agg(k, obj) FROM reqs), '{}'),
		    'documents',    coalesce((SELECT jsonb_object_agg(k, obj) FROM docs), '{}'),
		    'users',        coalesce((SELECT jsonb_object_agg(k, obj) FROM users), '{}')
		)`, acc.SpaceID, httpx.QueryList(r, "keys"), titles, httpx.QueryList(r, "handles"))
}

// Search runs full-text search across readable spaces.
func (a *API) Search(w http.ResponseWriter, r *http.Request) {
	act := actor(r)
	q := strings.TrimSpace(r.URL.Query().Get("q"))
	if q == "" {
		httpx.RespondRawJSON(w, http.StatusOK, []byte("[]"))
		return
	}
	a.array(w, r, `SELECT * FROM search_documents($1, $2, $3::uuid, $4, $5::uuid, $6::text[], $7, $8)`,
		act.AccountID, act.Type, act.ID, q, uuidOrNil(r.URL.Query().Get("space_id")),
		httpx.QueryList(r, "types"), httpx.QueryInt(r, "limit", 25, 1, 100), httpx.QueryInt(r, "offset", 0, 0, 10000))
}

// MyWork aggregates what the user should look at across spaces.
func (a *API) MyWork(w http.ResponseWriter, r *http.Request) {
	act := actor(r)
	a.rawJSON(w, r, http.StatusOK, `
		WITH mine AS (
		    SELECT `+requirementSummary+`, s.key AS space_key, s.name AS space_name
		      FROM v_requirement v
		      JOIN space s ON s.id = v.space_id AND NOT s.is_archived
		     WHERE v.account_id = $1 AND NOT v.status_is_closed
		       AND space_member_role(v.space_id, $2, $3::uuid) IS NOT NULL
		)
		SELECT jsonb_build_object(
		    'assigned', coalesce((SELECT jsonb_agg(to_jsonb(m) ORDER BY m.due_date NULLS LAST, m.priority_weight DESC)
		                            FROM mine m WHERE EXISTS (SELECT 1 FROM requirement_member rm WHERE rm.document_id = m.id AND rm.subject_id = $3::uuid)), '[]'),
		    'overdue', coalesce((SELECT jsonb_agg(to_jsonb(m) ORDER BY m.due_date)
		                           FROM mine m WHERE m.due_date < current_date
		                            AND EXISTS (SELECT 1 FROM requirement_member rm WHERE rm.document_id = m.id AND rm.subject_id = $3::uuid)), '[]'),
		    'due_soon', coalesce((SELECT jsonb_agg(to_jsonb(m) ORDER BY m.due_date)
		                            FROM mine m WHERE m.due_date BETWEEN current_date AND current_date + 7
		                             AND EXISTS (SELECT 1 FROM requirement_member rm WHERE rm.document_id = m.id AND rm.subject_id = $3::uuid)), '[]'),
		    'reported', coalesce((SELECT jsonb_agg(to_jsonb(m) ORDER BY m.updated_at DESC)
		                            FROM (SELECT * FROM mine WHERE reporter_id = $3::uuid ORDER BY updated_at DESC LIMIT 20) m), '[]'),
		    'watching', coalesce((SELECT jsonb_agg(to_jsonb(m) ORDER BY m.updated_at DESC)
		                            FROM (SELECT * FROM mine mm WHERE EXISTS (SELECT 1 FROM watcher wt WHERE wt.document_id = mm.id AND wt.subject_id = $3::uuid)
		                                   AND NOT EXISTS (SELECT 1 FROM requirement_member rm WHERE rm.document_id = mm.id AND rm.subject_id = $3::uuid)
		                                   AND mm.reporter_id <> $3::uuid
		                                 ORDER BY updated_at DESC LIMIT 20) m), '[]'),
		    'mentions', coalesce((SELECT jsonb_agg(jsonb_build_object('id', n.id, 'document_id', n.document_id, 'journal_id', n.journal_id,
		                                   'payload', n.payload, 'created_at', n.created_at, 'read_at', n.read_at) ORDER BY n.created_at DESC)
		                            FROM (SELECT * FROM notification WHERE user_id = $3::uuid AND event_type = 'mentioned'
		                                   ORDER BY created_at DESC LIMIT 20) n), '[]')
		)`, act.AccountID, act.Type, act.ID)
}
