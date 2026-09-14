package handlers

import (
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/nespina/quagenticus/internal/httpx"
)

func (a *API) ListNotifications(w http.ResponseWriter, r *http.Request) {
	act := actor(r)
	a.array(w, r, `
		SELECT n.id, n.document_id, n.journal_id, n.event_type, n.actor_type, n.actor_id,
		       coalesce(u.display_name, ag.name, 'Sistema') AS actor_name, u.avatar_url AS actor_avatar_url,
		       n.payload, n.read_at, n.created_at,
		       d.space_id, d.ref_key, d.title, d.doc_type
		  FROM notification n
		  LEFT JOIN document d ON d.id = n.document_id
		  LEFT JOIN app_user u ON u.id = n.actor_id AND n.actor_type = 'user'
		  LEFT JOIN agent ag ON ag.id = n.actor_id AND n.actor_type = 'agent'
		 WHERE n.user_id = $1 AND ($2 = false OR n.read_at IS NULL)
		 ORDER BY n.created_at DESC
		 LIMIT $3`, act.ID, r.URL.Query().Get("unread") == "true", httpx.QueryInt(r, "limit", 50, 1, 200))
}

func (a *API) NotificationCount(w http.ResponseWriter, r *http.Request) {
	a.object(w, r, `SELECT count(*) AS unread FROM notification WHERE user_id = $1 AND read_at IS NULL`, actor(r).ID)
}

func (a *API) MarkNotificationRead(w http.ResponseWriter, r *http.Request) {
	a.exec(w, r, `UPDATE notification SET read_at = coalesce(read_at, now()) WHERE id = $1 AND user_id = $2`,
		uuidOrNil(chi.URLParam(r, "id")), actor(r).ID)
}

// MarkAllNotificationsRead accepts ?document_id to clear one document's notifications.
func (a *API) MarkAllNotificationsRead(w http.ResponseWriter, r *http.Request) {
	a.exec(w, r, `UPDATE notification SET read_at = now()
		WHERE user_id = $1 AND read_at IS NULL AND ($2::uuid IS NULL OR document_id = $2::uuid)`,
		actor(r).ID, uuidOrNil(r.URL.Query().Get("document_id")))
}
