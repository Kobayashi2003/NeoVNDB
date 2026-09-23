// Package db owns the pool, the generation lifecycle and the generated
// queries. The live generation is always schema `vndb`; an import builds
// `vndb_next` and swaps names.
package db

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/kobayashi/neovndb/internal/config"
	"github.com/kobayashi/neovndb/internal/db/gen"
	"github.com/kobayashi/neovndb/internal/trans"
)

// Schema names. Only these three ever exist; older generations are dropped.
const (
	SchemaLive = "vndb"
	SchemaPrev = "vndb_prev"
	SchemaNext = "vndb_next"
)

type Store struct {
	*gen.Queries
	pool *pgxpool.Pool
	// One translation corpus, one target language.
	transLang string
}

// Open builds a pool pinned to the live schema and pings, since pgxpool
// connects lazily.
func Open(ctx context.Context, cfg *config.Config) (*Store, error) {
	pc, err := pgxpool.ParseConfig(cfg.DatabaseURL)
	if err != nil {
		return nil, fmt.Errorf("parse NEOVNDB_DB_URL: %w", err)
	}

	pc.MaxConns = cfg.MaxConns
	pc.MinConns = cfg.MinConns
	pc.MaxConnLifetime = cfg.ConnLifetime
	pc.ConnConfig.ConnectTimeout = cfg.ConnectTimeout
	pc.ConnConfig.RuntimeParams["search_path"] = SchemaLive + ",public"

	pool, err := pgxpool.NewWithConfig(ctx, pc)
	if err != nil {
		return nil, fmt.Errorf("create pool: %w", err)
	}

	pingCtx, cancel := context.WithTimeout(ctx, cfg.ConnectTimeout)
	defer cancel()
	if err := pool.Ping(pingCtx); err != nil {
		pool.Close()
		return nil, fmt.Errorf("ping: %w", err)
	}
	store := &Store{Queries: gen.New(pool), pool: pool, transLang: cfg.TransLang}
	// trans lives outside the lifecycle, so it is created here (idempotent).
	if err := store.ensureTrans(ctx); err != nil {
		pool.Close()
		return nil, err
	}
	return store, nil
}

func (s *Store) ensureTrans(ctx context.Context) error {
	if _, err := s.pool.Exec(ctx, trans.Schema()); err != nil {
		return fmt.Errorf("apply trans schema: %w", err)
	}
	return nil
}

func (s *Store) Close() { s.pool.Close() }

// TransLang is the language this database's translations are into.
func (s *Store) TransLang() string { return s.transLang }

func (s *Store) Pool() *pgxpool.Pool { return s.pool }

// Rehearse runs fn in a transaction that is always rolled back.
func (s *Store) Rehearse(ctx context.Context, fn func(pgx.Tx, *gen.Queries) error) error {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx) //nolint:errcheck // the rollback is the point

	return fn(tx, gen.New(tx))
}

// IsNotFound saves callers from importing pgx to tell absent from broken.
func IsNotFound(err error) bool { return err == pgx.ErrNoRows }
