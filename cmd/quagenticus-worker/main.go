// quagenticus-worker runs periodic maintenance: agent lease expiry, due-date
// reminders, purge of abandoned uploads and (optionally) e-mail digests.
package main

import (
	"context"
	"fmt"
	"log/slog"
	"net/smtp"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/nespina/quagenticus/internal/config"
	"github.com/nespina/quagenticus/internal/db"
	"github.com/nespina/quagenticus/internal/storage"
)

type worker struct {
	pool  *pgxpool.Pool
	cfg   config.Config
	store storage.Storage
}

func main() {
	slog.SetDefault(slog.New(slog.NewJSONHandler(os.Stdout, nil)))

	cfg, err := config.LoadWorker()
	if err != nil {
		slog.Error("failed to load config", "error", err)
		os.Exit(1)
	}
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	database, err := db.New(ctx, cfg)
	if err != nil {
		slog.Error("failed to connect to database", "error", err)
		os.Exit(1)
	}
	defer database.Pool.Close()

	w := &worker{pool: database.Pool, cfg: cfg, store: storage.NewLocal(cfg.StoragePath)}
	slog.Info("starting quagenticus worker")

	go w.every(ctx, time.Minute, "expire_claims", w.expireClaims)
	go w.every(ctx, 15*time.Minute, "due_reminders", w.dueReminders)
	go w.every(ctx, time.Hour, "purge_staged", w.purgeStaged)
	if cfg.SMTPHost != "" {
		go w.every(ctx, 5*time.Minute, "email_notifications", w.emailNotifications)
	}

	<-ctx.Done()
	slog.Info("worker stopped")
}

func (w *worker) every(ctx context.Context, d time.Duration, name string, fn func(context.Context) (int, error)) {
	run := func() {
		n, err := fn(ctx)
		if err != nil {
			slog.Error("job failed", "job", name, "error", err)
		} else if n > 0 {
			slog.Info("job done", "job", name, "affected", n)
		}
	}
	run()
	t := time.NewTicker(d)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
			run()
		}
	}
}

func (w *worker) scalar(ctx context.Context, sql string) (int, error) {
	var n int
	err := pgx.BeginFunc(ctx, w.pool, func(tx pgx.Tx) error {
		return tx.QueryRow(ctx, sql).Scan(&n)
	})
	return n, err
}

func (w *worker) expireClaims(ctx context.Context) (int, error) {
	return w.scalar(ctx, `SELECT agent_claims_expire()`)
}

func (w *worker) dueReminders(ctx context.Context) (int, error) {
	return w.scalar(ctx, `SELECT notifications_due_scan()`)
}

func (w *worker) purgeStaged(ctx context.Context) (int, error) {
	var keys []string
	err := pgx.BeginFunc(ctx, w.pool, func(tx pgx.Tx) error {
		rows, err := tx.Query(ctx, `SELECT * FROM attachment_purge_staged('24 hours')`)
		if err != nil {
			return err
		}
		keys, err = pgx.CollectRows(rows, pgx.RowTo[string])
		return err
	})
	if err != nil {
		return 0, err
	}
	for _, k := range keys {
		w.store.Delete(k) //nolint:errcheck
	}
	return len(keys), nil
}

var eventLabels = map[string]string{
	"member_added":     "te asignó a",
	"assigned_lead":    "te nombró responsable de",
	"mentioned":        "te mencionó en",
	"commented":        "comentó en",
	"status_changed":   "cambió el estado de",
	"attachment_added": "adjuntó un archivo en",
	"due_soon":         "vence pronto:",
	"due_overdue":      "está vencido:",
	"due_date_changed": "cambió la fecha límite de",
	"agent_claimed":    "tomó",
	"agent_released":   "liberó",
}

// emailNotifications sends one digest per user with pending notifications,
// unless the user disabled e-mail in preferences.notifications.email.
func (w *worker) emailNotifications(ctx context.Context) (int, error) {
	type pending struct {
		userID, email, name string
		lines              []string
		ids                []string
	}
	byUser := map[string]*pending{}
	rows, err := w.pool.Query(ctx, `
		SELECT n.id::text, u.id::text, u.email::text, u.display_name, n.event_type,
		       coalesce(au.display_name, ag.name, 'Quagenticus'),
		       coalesce(n.payload->>'ref_key', ''), coalesce(n.payload->>'title', ''),
		       coalesce(n.payload->>'space_id', ''), coalesce(n.document_id::text, '')
		  FROM notification n
		  JOIN app_user u ON u.id = n.user_id AND u.status = 'active'
		  LEFT JOIN app_user au ON au.id = n.actor_id AND n.actor_type = 'user'
		  LEFT JOIN agent ag ON ag.id = n.actor_id AND n.actor_type = 'agent'
		 WHERE n.emailed_at IS NULL AND n.read_at IS NULL
		   AND n.created_at > now() - interval '2 days'
		   AND coalesce((u.preferences #>> '{notifications,email}')::boolean, true)
		 ORDER BY n.created_at
		 LIMIT 1000`)
	if err != nil {
		return 0, err
	}
	for rows.Next() {
		var id, userID, email, name, event, actorName, ref, title, spaceID, docID string
		if err := rows.Scan(&id, &userID, &email, &name, &event, &actorName, &ref, &title, &spaceID, &docID); err != nil {
			rows.Close()
			return 0, err
		}
		p, ok := byUser[userID]
		if !ok {
			p = &pending{userID: userID, email: email, name: name}
			byUser[userID] = p
		}
		label := eventLabels[event]
		if label == "" {
			label = event
		}
		link := fmt.Sprintf("%s/spaces/%s/requirements/%s", strings.TrimRight(w.cfg.PublicURL, "/"), spaceID, docID)
		p.lines = append(p.lines, fmt.Sprintf("- %s %s %s %s\n  %s", actorName, label, ref, title, link))
		p.ids = append(p.ids, id)
	}
	rows.Close()

	sent := 0
	authn := smtp.Auth(nil)
	if w.cfg.SMTPUser != "" {
		authn = smtp.PlainAuth("", w.cfg.SMTPUser, w.cfg.SMTPPass, w.cfg.SMTPHost)
	}
	for _, p := range byUser {
		body := fmt.Sprintf("Hola %s,\n\nTienes %d novedades en Quagenticus:\n\n%s\n\nPuedes desactivar estos correos en tu perfil.\n",
			p.name, len(p.lines), strings.Join(p.lines, "\n"))
		msg := "From: " + w.cfg.SMTPFrom + "\r\nTo: " + p.email +
			"\r\nSubject: Quagenticus: " + fmt.Sprint(len(p.lines)) + " novedades\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n" + body
		addr := fmt.Sprintf("%s:%d", w.cfg.SMTPHost, w.cfg.SMTPPort)
		if err := smtp.SendMail(addr, authn, w.cfg.SMTPFrom, []string{p.email}, []byte(msg)); err != nil {
			slog.Warn("email failed", "user", p.userID, "error", err)
			continue
		}
		if _, err := w.pool.Exec(ctx, `UPDATE notification SET emailed_at = now() WHERE id = ANY ($1::uuid[])`, p.ids); err != nil {
			return sent, err
		}
		sent++
	}
	return sent, nil
}
