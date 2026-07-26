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
	Pool *pgxpool.Pool
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
	return &DB{Pool: pool}, pool.Ping(ctx)
}

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
