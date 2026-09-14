package handlers

import (
	"context"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/nespina/quagenticus/internal/authz"
	"github.com/nespina/quagenticus/internal/httpx"
)

// ListJournals returns journal entries of a document. ?kind=comment returns
// comments (threads are resolved client-side through reply_to_id);
// ?kind=history returns changes, agent events and system entries.
func (a *API) ListJournals(w http.ResponseWriter, r *http.Request) {
	kinds := []string{"comment", "change", "agent_event", "system"}
	switch r.URL.Query().Get("kind") {
	case "comment":
		kinds = []string{"comment"}
	case "history":
		kinds = []string{"change", "agent_event", "system"}
	}
	limit := httpx.QueryInt(r, "limit", 500, 1, 1000)
	a.array(w, r, `
		SELECT j.id, j.document_id AS requirement_id, j.kind, j.actor_type,
		       coalesce(j.actor_user_id, j.actor_agent_id) AS actor_id,
		       coalesce(u.display_name, ag.name, 'Sistema') AS actor_name,
		       u.handle AS actor_handle, u.avatar_url AS actor_avatar_url,
		       CASE WHEN j.deleted_at IS NULL THEN coalesce(j.notes_md, '') ELSE '' END AS notes_md,
		       j.details, j.reply_to_id, j.created_at, j.edited_at, j.deleted_at,
		       CASE WHEN j.deleted_at IS NULL THEN coalesce((
		           SELECT jsonb_agg(jsonb_build_object('id', at.id, 'filename', at.filename, 'content_type', at.content_type,
		                                               'byte_size', at.byte_size, 'created_at', at.created_at) ORDER BY at.created_at)
		             FROM attachment at WHERE at.journal_id = j.id), '[]') ELSE '[]' END AS attachments
		  FROM journal j
		  LEFT JOIN app_user u ON u.id = j.actor_user_id
		  LEFT JOIN agent ag ON ag.id = j.actor_agent_id
		 WHERE j.document_id = $1 AND j.kind::text = ANY ($2)
		 ORDER BY j.created_at, j.id
		 LIMIT $3`, chi.URLParam(r, "id"), kinds, limit)
}

type commentRequest struct {
	NotesMD       string   `json:"notes_md"`
	ReplyToID     *string  `json:"reply_to_id"    validate:"omitempty,uuid"`
	AttachmentIDs []string `json:"attachment_ids" validate:"max=50,dive,uuid"`
}

// canComment: contributors always; viewers unless the space disables it.
func (a *API) canComment(ctx context.Context, acc authz.Access) bool {
	if acc.Role >= authz.Contributor {
		return true
	}
	var allowed bool
	err := a.db.Pool.QueryRow(ctx, `SELECT coalesce((settings->>'viewers_can_comment')::boolean, true) FROM space WHERE id = $1`,
		acc.SpaceID).Scan(&allowed)
	return err == nil && allowed
}

func (a *API) CreateComment(w http.ResponseWriter, r *http.Request) {
	var in commentRequest
	if err := httpx.Decode(r, &in); err != nil {
		httpx.RespondError(w, err)
		return
	}
	acc := authz.From(r.Context())
	if !a.canComment(r.Context(), acc) {
		httpx.RespondError(w, httpx.NewError(http.StatusForbidden, "forbidden", "los lectores no pueden comentar en este espacio"))
		return
	}
	if len(in.AttachmentIDs) > a.cfg.UploadMaxFiles {
		httpx.RespondError(w, httpx.BadRequest("demasiados adjuntos en un comentario"))
		return
	}
	if in.AttachmentIDs == nil {
		in.AttachmentIDs = []string{}
	}
	docID := chi.URLParam(r, "id")
	var id string
	err := a.tx(r, func(ctx context.Context, tx pgx.Tx) error {
		return tx.QueryRow(ctx, `SELECT comment_create($1, $2, $3, $4::uuid[])`,
			docID, in.NotesMD, in.ReplyToID, in.AttachmentIDs).Scan(&id)
	})
	if err != nil {
		httpx.RespondError(w, err)
		return
	}
	httpx.RespondJSON(w, http.StatusCreated, map[string]string{"id": id})
}

type commentUpdateRequest struct {
	NotesMD string `json:"notes_md" validate:"required"`
}

func (a *API) UpdateComment(w http.ResponseWriter, r *http.Request) {
	var in commentUpdateRequest
	if err := httpx.Decode(r, &in); err != nil {
		httpx.RespondError(w, err)
		return
	}
	a.exec(w, r, `SELECT comment_update($1, $2)`, chi.URLParam(r, "id"), in.NotesMD)
}

func (a *API) DeleteComment(w http.ResponseWriter, r *http.Request) {
	acc := authz.From(r.Context())
	a.exec(w, r, `SELECT comment_delete($1, $2)`, chi.URLParam(r, "id"), acc.Role >= authz.Maintainer)
}

// ---------------------------------------------------------------- watchers

func (a *API) Watch(w http.ResponseWriter, r *http.Request) {
	act := actor(r)
	a.exec(w, r, `SELECT watcher_add($1, $2::actor_type, $3)`, chi.URLParam(r, "id"), act.Type, act.ID)
}

func (a *API) Unwatch(w http.ResponseWriter, r *http.Request) {
	act := actor(r)
	a.exec(w, r, `SELECT watcher_remove($1, $2::actor_type, $3)`, chi.URLParam(r, "id"), act.Type, act.ID)
}
