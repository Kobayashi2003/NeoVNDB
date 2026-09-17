// Package db owns the connection pool, the generation lifecycle and the
// generated query layer.
//
// All data lives in generation schemas. The live one is always named `vndb`,
// so the application never has to discover which generation it is talking to;
// an import builds `vndb_next` and swaps the names when it is done.
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

// Store is the handle the rest of the application takes: the generated queries
// plus the pool they run on.
type Store struct {
	*gen.Queries
	pool *pgxpool.Pool
	// The language trans.terms and trans.passages hold. It belongs to the
	// database rather than to a request: one corpus, one target language.
	transLang string
}

// Open builds a pool pinned to the live schema and verifies it can reach the
// database. pgxpool connects lazily, so without the ping a bad URL would only
// surface on the first query.
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
	// The trans schema is not a generation and an import never touches it, so
	// there is no moment in the lifecycle that would create it. Creating it
	// here is what makes a fresh database work without a setup step; the DDL
	// is idempotent, so every later start is a no-op.
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
