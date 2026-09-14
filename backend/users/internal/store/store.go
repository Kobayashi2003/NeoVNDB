// Package store is this service's database: accounts, sessions and the lists
// a reader keeps.
//
// Nothing here reaches into the mirror. A saved item is an id and a type and
// nothing more, because the mirror is rebuilt from the dump every week and a
// reference into it would be a promise this service cannot keep. Turning
// `v17` back into a visual novel is the caller's job, and one the read API
// already answers in a single request.
package store

import (
	"context"
	_ "embed"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/kobayashi/neovndb-users/internal/config"
)

//go:embed schema.sql
var schema string

type Store struct{ pool *pgxpool.Pool }

var (
	ErrNotFound = errors.New("not found")
	ErrTaken    = errors.New("already taken")
)

// Open connects and brings the schema up to date. The schema is idempotent, so
// a fresh database and an existing one take the same path.
func Open(ctx context.Context, cfg *config.Config) (*Store, error) {
	pc, err := pgxpool.ParseConfig(cfg.DatabaseURL)
	if err != nil {
		return nil, fmt.Errorf("parsing NEOVNDB_USERS_DB_URL: %w", err)
	}
	pc.MaxConns = cfg.MaxConns
	pc.ConnConfig.ConnectTimeout = cfg.ConnectTimeout

	pool, err := pgxpool.NewWithConfig(ctx, pc)
	if err != nil {
		return nil, err
	}
	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, fmt.Errorf("connecting: %w", err)
	}
	if _, err := pool.Exec(ctx, schema); err != nil {
		pool.Close()
		return nil, fmt.Errorf("applying schema: %w", err)
	}
	return &Store{pool: pool}, nil
}

func (s *Store) Close() { s.pool.Close() }

func (s *Store) Ping(ctx context.Context) error { return s.pool.Ping(ctx) }

// unique reports whether an error is Postgres refusing a duplicate.
func unique(err error) bool {
	var pg *pgconn.PgError
	return errors.As(err, &pg) && pg.Code == "23505"
}

/* ─── Accounts ─────────────────────────────────────────────────────────────── */

type User struct {
	ID        int32     `json:"id"`
	Username  string    `json:"username"`
	Email     *string   `json:"email"`
	IsAdmin   bool      `json:"is_admin"`
	CreatedAt time.Time `json:"created_at"`
}

// The seven kinds of thing a reader can keep a list of, and the one list each
// account starts with. Without it the first thing a new reader sees on every
// page is a control that needs a list made before it can do anything.
var kinds = []string{"v", "r", "c", "p", "s", "g", "i"}

const defaultCollection = "Favourites"

// CreateUser makes the account and its starting lists together, so an account
// never exists in the half-made state where it has nowhere to save anything.
func (s *Store) CreateUser(ctx context.Context, username string, email *string, hash string) (*User, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	var u User
	err = tx.QueryRow(ctx, `
		INSERT INTO users (username, email, password_hash) VALUES ($1, $2, $3)
		RETURNING id, username, email, is_admin, created_at`,
		username, email, hash,
	).Scan(&u.ID, &u.Username, &u.Email, &u.IsAdmin, &u.CreatedAt)
	if unique(err) {
		return nil, ErrTaken
	}
	if err != nil {
		return nil, err
	}

	for _, kind := range kinds {
		if _, err := tx.Exec(ctx,
			`INSERT INTO collections (user_id, type, name) VALUES ($1, $2, $3)`,
			u.ID, kind, defaultCollection,
		); err != nil {
			return nil, err
		}
	}
	return &u, tx.Commit(ctx)
}

func (s *Store) UserByName(ctx context.Context, username string) (*User, string, error) {
	var u User
	var hash string
	err := s.pool.QueryRow(ctx, `
		SELECT id, username, email, is_admin, created_at, password_hash
		  FROM users WHERE lower(username) = lower($1)`, username,
	).Scan(&u.ID, &u.Username, &u.Email, &u.IsAdmin, &u.CreatedAt, &hash)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, "", ErrNotFound
	}
	return &u, hash, err
}

func (s *Store) UserByID(ctx context.Context, id int32) (*User, error) {
	var u User
	err := s.pool.QueryRow(ctx, `
		SELECT id, username, email, is_admin, created_at FROM users WHERE id = $1`, id,
	).Scan(&u.ID, &u.Username, &u.Email, &u.IsAdmin, &u.CreatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	return &u, err
}

func (s *Store) SetPassword(ctx context.Context, id int32, hash string) error {
	_, err := s.pool.Exec(ctx, `UPDATE users SET password_hash = $2 WHERE id = $1`, id, hash)
	return err
}

/* ─── Sessions ─────────────────────────────────────────────────────────────── */

func (s *Store) CreateSession(ctx context.Context, token string, userID int32, life time.Duration) error {
	_, err := s.pool.Exec(ctx,
		`INSERT INTO sessions (token, user_id, expires_at) VALUES ($1, $2, now() + $3::interval)`,
		token, userID, life.String())
	return err
}

// Session answers the only question the edge asks on every request: whose is
// this, if anyone's. Expiry is checked here rather than by the sweep, so a
// session stops working the moment it should and not whenever the sweep runs.
func (s *Store) Session(ctx context.Context, token string) (int32, bool, error) {
	var userID int32
	var isAdmin bool
	err := s.pool.QueryRow(ctx, `
		SELECT u.id, u.is_admin
		  FROM sessions s JOIN users u ON u.id = s.user_id
		 WHERE s.token = $1 AND s.expires_at > now()`, token,
	).Scan(&userID, &isAdmin)
	if errors.Is(err, pgx.ErrNoRows) {
		return 0, false, ErrNotFound
	}
	return userID, isAdmin, err
}

func (s *Store) DeleteSession(ctx context.Context, token string) error {
	_, err := s.pool.Exec(ctx, `DELETE FROM sessions WHERE token = $1`, token)
	return err
}

// DeleteSessionsOf is "sign out everywhere", and is also what a password
// change does: whoever knew the old one should stop being signed in.
func (s *Store) DeleteSessionsOf(ctx context.Context, userID int32) error {
	_, err := s.pool.Exec(ctx, `DELETE FROM sessions WHERE user_id = $1`, userID)
	return err
}

func (s *Store) SweepSessions(ctx context.Context) (int64, error) {
	tag, err := s.pool.Exec(ctx, `DELETE FROM sessions WHERE expires_at <= now()`)
	return tag.RowsAffected(), err
}
