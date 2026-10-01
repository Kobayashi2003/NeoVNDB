// Package store holds accounts, sessions and lists. Saved items are bare ids;
// the mirror is rebuilt every import, so nothing references it.
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

// Open connects and applies the idempotent schema.
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

// Every account starts with one list per type, so saving works immediately.
var kinds = []string{"v", "r", "c", "p", "s", "g", "i"}

const defaultCollection = "Favourites"

// CreateUser makes the account and its starting lists in one transaction.
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

// PasswordHash is the stored hash, for checking the password of someone
// already signed in.
func (s *Store) PasswordHash(ctx context.Context, id int32) (string, error) {
	var hash string
	err := s.pool.QueryRow(ctx, `SELECT password_hash FROM users WHERE id = $1`, id).Scan(&hash)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", ErrNotFound
	}
	return hash, err
}

func (s *Store) SetPassword(ctx context.Context, id int32, hash string) error {
	_, err := s.pool.Exec(ctx, `UPDATE users SET password_hash = $2 WHERE id = $1`, id, hash)
	return err
}

// Account is a user as the admin page lists them.
type Account struct {
	User
	Lists    int        `json:"lists"`
	Items    int        `json:"items"`
	Ratings  int        `json:"ratings"`
	Sessions int        `json:"sessions"`
	LastSeen *time.Time `json:"last_seen"`
}

// Accounts lists every user, oldest first. LastSeen is when their newest live
// session began.
func (s *Store) Accounts(ctx context.Context) ([]Account, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT u.id, u.username, u.email, u.is_admin, u.created_at,
		       (SELECT count(*) FROM collections c WHERE c.user_id = u.id),
		       (SELECT count(*) FROM marks m JOIN collections c ON c.id = m.collection_id WHERE c.user_id = u.id),
		       (SELECT count(*) FROM ratings r WHERE r.user_id = u.id),
		       (SELECT count(*) FROM sessions s WHERE s.user_id = u.id AND s.expires_at > now()),
		       (SELECT max(s.created_at) FROM sessions s WHERE s.user_id = u.id AND s.expires_at > now())
		  FROM users u
		 ORDER BY u.id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Account
	for rows.Next() {
		var a Account
		if err := rows.Scan(&a.ID, &a.Username, &a.Email, &a.IsAdmin, &a.CreatedAt,
			&a.Lists, &a.Items, &a.Ratings, &a.Sessions, &a.LastSeen); err != nil {
			return nil, err
		}
		out = append(out, a)
	}
	return out, rows.Err()
}

// SetAdmin grants or withdraws administration. ErrNotFound if no such user.
func (s *Store) SetAdmin(ctx context.Context, id int32, admin bool) error {
	tag, err := s.pool.Exec(ctx, `UPDATE users SET is_admin = $2 WHERE id = $1`, id, admin)
	if err == nil && tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return err
}

// DeleteUser removes the account; every other table cascades from it.
func (s *Store) DeleteUser(ctx context.Context, id int32) error {
	_, err := s.pool.Exec(ctx, `DELETE FROM users WHERE id = $1`, id)
	return err
}

/* ─── Sessions ─────────────────────────────────────────────────────────────── */

func (s *Store) CreateSession(ctx context.Context, token string, userID int32, life time.Duration) error {
	_, err := s.pool.Exec(ctx,
		`INSERT INTO sessions (token, user_id, expires_at) VALUES ($1, $2, now() + $3::interval)`,
		token, userID, life.String())
	return err
}

// Session resolves a token. Expiry is checked here, not left to the sweep.
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

// DeleteSessionsOf backs sign-out-everywhere and password changes.
func (s *Store) DeleteSessionsOf(ctx context.Context, userID int32) error {
	_, err := s.pool.Exec(ctx, `DELETE FROM sessions WHERE user_id = $1`, userID)
	return err
}

func (s *Store) SweepSessions(ctx context.Context) (int64, error) {
	tag, err := s.pool.Exec(ctx, `DELETE FROM sessions WHERE expires_at <= now()`)
	return tag.RowsAffected(), err
}
