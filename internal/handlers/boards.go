package handlers

import (
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/nespina/quagenticus/internal/authz"
	"github.com/nespina/quagenticus/internal/httpx"
)

func (a *API) ListBoards(w http.ResponseWriter, r *http.Request) {
	acc := authz.From(r.Context())
	a.array(w, r, `
		SELECT id, space_id, name, description FROM board
		 WHERE space_id = $1 AND is_active ORDER BY created_at, name`, acc.SpaceID)
}

type boardRequest struct {
	Name        string `json:"name" validate:"required"`
	Description string `json:"description"`
}

func (a *API) CreateBoard(w http.ResponseWriter, r *http.Request) {
	var in boardRequest
	if err := httpx.Decode(r, &in); err != nil {
		httpx.RespondError(w, err)
		return
	}
	acc := authz.From(r.Context())
	a.mutation(w, r, http.StatusCreated, `
		INSERT INTO board (space_id, account_id, name, description, creator_id)
		SELECT s.id, s.account_id, btrim($2), nullif($3, ''), qg_responsible_user_id() FROM space s WHERE s.id = $1
		RETURNING id, space_id, name, description`, acc.SpaceID, in.Name, in.Description)
}

// cardJSON projects a requirement row "r" (joined with document d, tracker t,
// priority pr, workflow_status ws) into the card shape used by the board.
const cardJSON = `jsonb_build_object(
    'id', r.document_id, 'ref_key', d.ref_key, 'title', d.title,
    'tracker_id', r.tracker_id, 'tracker_key', t.key, 'tracker_icon', t.icon,
    'status_id', r.status_id, 'is_closed', ws.is_closed,
    'priority_id', r.priority_id, 'priority_key', pr.key, 'priority_name', pr.name, 'priority_color', pr.color,
    'lead_user_id', r.lead_user_id, 'board_position', r.board_position,
    'start_date', r.start_date, 'due_date', r.due_date, 'done_ratio', r.done_ratio,
    'readiness_score', r.readiness_score, 'updated_at', r.updated_at,
    'claimed_by_agent_id', r.claimed_by_agent_id,
    'claimed_by_agent_name', (SELECT name FROM agent WHERE id = r.claimed_by_agent_id),
    'labels', coalesce((SELECT jsonb_agg(jsonb_build_object('id', l.id, 'name', l.name, 'color', l.color) ORDER BY l.name)
                          FROM document_label dl JOIN label l ON l.id = dl.label_id WHERE dl.document_id = r.document_id), '[]'),
    'members', coalesce((SELECT jsonb_agg(jsonb_build_object(
                              'id', m.subject_id, 'type', m.subject_type, 'is_lead', m.is_lead,
                              'display_name', coalesce(u.display_name, ag.name), 'avatar_url', u.avatar_url)
                              ORDER BY m.is_lead DESC, m.added_at)
                           FROM requirement_member m
                           LEFT JOIN app_user u ON u.id = m.subject_id AND m.subject_type = 'user'
                           LEFT JOIN agent ag ON ag.id = m.subject_id AND m.subject_type = 'agent'
                          WHERE m.document_id = r.document_id), '[]'),
    'comment_count', (SELECT count(*) FROM journal j WHERE j.document_id = r.document_id AND j.kind = 'comment' AND j.deleted_at IS NULL),
    'attachment_count', (SELECT count(*) FROM attachment at WHERE at.document_id = r.document_id AND at.status = 'attached'),
    'children_count', (SELECT count(*) FROM requirement c WHERE c.parent_id = r.document_id),
    'children_done', (SELECT count(*) FROM requirement c JOIN workflow_status cs ON cs.id = c.status_id
                       WHERE c.parent_id = r.document_id AND cs.is_closed)
)`

// GetBoard returns one column per workflow status (customized by board_column)
// with all cards in a single query. Closed columns only include cards closed
// in the last ?closed_days (default 14) but report the full total.
func (a *API) GetBoard(w http.ResponseWriter, r *http.Request) {
	acc := authz.From(r.Context())
	closedDays := httpx.QueryInt(r, "closed_days", 14, 0, 3650)
	a.rawJSON(w, r, http.StatusOK, `
		WITH b AS (
		    SELECT * FROM board WHERE id = $2 AND space_id = $1
		), cols AS (
		    SELECT ws.id AS status_id, ws.key AS status_key, coalesce(bc.name, ws.name) AS name,
		           coalesce(bc.color, ws.color) AS color, ws.ord, bc.wip_limit,
		           coalesce(bc.is_collapsed, ws.is_closed) AS is_collapsed,
		           coalesce(bc.is_hidden, false) AS is_hidden,
		           ws.is_closed, ws.is_agent_claimable, ws.requires_resolution
		      FROM b
		      JOIN workflow_status ws ON ws.account_id = b.account_id
		      LEFT JOIN board_column bc ON bc.board_id = b.id AND bc.status_id = ws.id
		), cards AS (
		    SELECT r.status_id, r.board_position, r.created_at, ws.is_closed, r.closed_at, `+cardJSON+` AS card
		      FROM requirement r
		      JOIN document d ON d.id = r.document_id AND NOT d.is_archived
		      JOIN tracker t ON t.id = r.tracker_id
		      JOIN priority pr ON pr.id = r.priority_id
		      JOIN workflow_status ws ON ws.id = r.status_id
		     WHERE r.space_id = $1
		)
		SELECT jsonb_build_object(
		    'id', b.id, 'space_id', b.space_id, 'name', b.name, 'closed_days', $3::int,
		    'columns', coalesce((
		        SELECT jsonb_agg(jsonb_build_object(
		            'id', c.status_id, 'status_id', c.status_id, 'status_key', c.status_key,
		            'name', c.name, 'color', c.color, 'ord', c.ord, 'wip_limit', c.wip_limit,
		            'is_collapsed', c.is_collapsed, 'is_closed', c.is_closed,
		            'is_agent_claimable', c.is_agent_claimable, 'requires_resolution', c.requires_resolution,
		            'total', (SELECT count(*) FROM cards k WHERE k.status_id = c.status_id),
		            'cards', coalesce((
		                SELECT jsonb_agg(k.card ORDER BY k.board_position, k.created_at)
		                  FROM cards k
		                 WHERE k.status_id = c.status_id
		                   AND (NOT k.is_closed OR k.closed_at IS NULL OR k.closed_at > now() - make_interval(days => $3::int))
		            ), '[]')
		        ) ORDER BY c.ord, c.name)
		          FROM cols c WHERE NOT c.is_hidden
		    ), '[]'),
		    'hidden_columns', coalesce((SELECT jsonb_agg(jsonb_build_object('status_id', c.status_id, 'name', c.name)) FROM cols c WHERE c.is_hidden), '[]')
		)
		FROM b`, acc.SpaceID, chi.URLParam(r, "boardId"), closedDays)
}

// UpdateBoardColumn customizes how a status is shown on a board.
func (a *API) UpdateBoardColumn(w http.ResponseWriter, r *http.Request) {
	in, err := httpx.DecodeObject(r, "name", "color", "wip_limit", "is_collapsed", "is_hidden")
	if err != nil {
		httpx.RespondError(w, err)
		return
	}
	a.mutation(w, r, http.StatusOK, `
		INSERT INTO board_column (board_id, status_id, name, color, wip_limit, is_collapsed, is_hidden, ord)
		SELECT b.id, ws.id,
		       coalesce(nullif(btrim(p->>'name'), ''), ws.name),
		       coalesce(nullif(p->>'color', ''), ws.color),
		       nullif(p->>'wip_limit', '')::int,
		       coalesce((p->>'is_collapsed')::boolean, ws.is_closed),
		       coalesce((p->>'is_hidden')::boolean, false),
		       ws.ord
		  FROM board b
		  JOIN workflow_status ws ON ws.id = $2 AND ws.account_id = b.account_id,
		       (SELECT $3::jsonb AS p) x
		 WHERE b.id = $1
		ON CONFLICT (board_id, status_id) DO UPDATE SET
		    name         = CASE WHEN $3::jsonb ? 'name' THEN EXCLUDED.name ELSE board_column.name END,
		    color        = CASE WHEN $3::jsonb ? 'color' THEN EXCLUDED.color ELSE board_column.color END,
		    wip_limit    = CASE WHEN $3::jsonb ? 'wip_limit' THEN EXCLUDED.wip_limit ELSE board_column.wip_limit END,
		    is_collapsed = CASE WHEN $3::jsonb ? 'is_collapsed' THEN EXCLUDED.is_collapsed ELSE board_column.is_collapsed END,
		    is_hidden    = CASE WHEN $3::jsonb ? 'is_hidden' THEN EXCLUDED.is_hidden ELSE board_column.is_hidden END
		RETURNING board_id, status_id, name, color, wip_limit, is_collapsed, is_hidden`,
		chi.URLParam(r, "boardId"), uuidOrNil(chi.URLParam(r, "statusId")), jsonParam(in))
}
