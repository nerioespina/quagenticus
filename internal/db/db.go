package db

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/nespina/quagenticus/internal/auth"
	"github.com/nespina/quagenticus/internal/config"
	"github.com/nespina/quagenticus/internal/httpx"
)

type DB struct {
	Pool   *pgxpool.Pool
	Schema string
}

func New(ctx context.Context, cfg config.Config) (*DB, error) {
	pc, err := pgxpool.ParseConfig(cfg.DatabaseURL)
	if err != nil {
		return nil, err
	}
	pc.MinConns = cfg.DBMinConns
	pc.MaxConns = cfg.DBMaxConns
	pc.MaxConnLifetime = time.Hour
	pc.ConnConfig.RuntimeParams["search_path"] = cfg.DBSchema + ",public"
	pc.ConnConfig.RuntimeParams["application_name"] = "quagenticus-api"

	pool, err := pgxpool.NewWithConfig(ctx, pc)
	if err != nil {
		return nil, err
	}
	return &DB{Pool: pool, Schema: cfg.DBSchema}, pool.Ping(ctx)
}

// WithActor runs fn in a transaction where qg.* settings identify the actor,
// so database functions can attribute and authorize their work.
func (d *DB) WithActor(ctx context.Context, a auth.Actor, fn func(pgx.Tx) error) error {
	return pgx.BeginFunc(ctx, d.Pool, func(tx pgx.Tx) error {
		if _, err := tx.Exec(ctx, `
            SELECT set_config('qg.actor_type', $1, true),
                   set_config('qg.actor_id',   $2, true),
                   set_config('qg.account_id', $3, true),
                   set_config('qg.scopes',     $4, true),
                   set_config('qg.request_id', $5, true)`,
			a.Type, a.ID, a.AccountID, strings.Join(a.Scopes, " "),
			httpx.RequestIDFrom(ctx),
		); err != nil {
			return fmt.Errorf("fijando contexto de actor: %w", err)
		}
		return fn(tx)
	})
}

// JSON runs a query returning a single json/jsonb value inside an actor
// transaction. It returns pgx.ErrNoRows when the query yields no row or NULL.
func (d *DB) JSON(ctx context.Context, a auth.Actor, sql string, args ...any) ([]byte, error) {
	var out []byte
	err := d.WithActor(ctx, a, func(tx pgx.Tx) error {
		return tx.QueryRow(ctx, sql, args...).Scan(&out)
	})
	if err != nil {
		return nil, err
	}
	if out == nil {
		return nil, pgx.ErrNoRows
	}
	return out, nil
}

// JSONArray wraps a SELECT into a JSON array of row objects.
func (d *DB) JSONArray(ctx context.Context, a auth.Actor, sql string, args ...any) ([]byte, error) {
	return d.JSON(ctx, a, `SELECT coalesce(jsonb_agg(to_jsonb(q)), '[]'::jsonb) FROM (`+sql+`) q`, args...)
}

// JSONObject wraps a SELECT returning at most one row into a JSON object.
func (d *DB) JSONObject(ctx context.Context, a auth.Actor, sql string, args ...any) ([]byte, error) {
	return d.JSON(ctx, a, `SELECT to_jsonb(q) FROM (`+sql+`) q LIMIT 1`, args...)
}

// JSONMutation wraps an INSERT/UPDATE/DELETE ... RETURNING into a JSON object.
func (d *DB) JSONMutation(ctx context.Context, a auth.Actor, sql string, args ...any) ([]byte, error) {
	return d.JSON(ctx, a, `WITH q AS (`+sql+`) SELECT to_jsonb(q) FROM q LIMIT 1`, args...)
}
