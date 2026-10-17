package store

import (
	"context"
	"encoding/json"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
)

// What follows the reader from one device to the next: how the site is shown,
// and the searches they named.

// ErrFull is a write refused because the reader already has as many as a
// deployment allows.
var ErrFull = errors.New("full")

// Prefs is the reader's preferences as last saved, or nil if never.
func (s *Store) Prefs(ctx context.Context, userID int32) (json.RawMessage, error) {
	var value json.RawMessage
	err := s.pool.QueryRow(ctx, `SELECT value FROM prefs WHERE user_id = $1`, userID).Scan(&value)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	return value, err
}

// SetPrefs replaces them whole: the site always sends all of them, and the
// last device to change one is the one the reader is looking at.
func (s *Store) SetPrefs(ctx context.Context, userID int32, value json.RawMessage) error {
	_, err := s.pool.Exec(ctx, `
		INSERT INTO prefs (user_id, value) VALUES ($1, $2)
		ON CONFLICT (user_id) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
		userID, value)
	return err
}

type Search struct {
	ID        int32     `json:"id"`
	Type      string    `json:"type"`
	Name      string    `json:"name"`
	Query     string    `json:"query"`
	CreatedAt time.Time `json:"created_at"`
}

// Searches lists the reader's named searches, of one type or all, by name.
func (s *Store) Searches(ctx context.Context, userID int32, kind string) ([]Search, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT id, type, name, query, created_at FROM searches
		 WHERE user_id = $1 AND ($2 = '' OR type = $2)
		 ORDER BY type, lower(name), id`, userID, kind)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Search{}
	for rows.Next() {
		var x Search
		if err := rows.Scan(&x.ID, &x.Type, &x.Name, &x.Query, &x.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, x)
	}
	return out, rows.Err()
}

// CreateSearch names a search. ErrTaken when the name is already used for that
// type, ErrFull when the reader has max of them in all (0: no ceiling). The
// count and the insert are one statement, so two at once cannot both slip in
// under it by much.
func (s *Store) CreateSearch(ctx context.Context, userID int32, kind, name, query string, max int) (*Search, error) {
	var x Search
	err := s.pool.QueryRow(ctx, `
		INSERT INTO searches (user_id, type, name, query)
		SELECT $1, $2, $3, $4
		 WHERE $5 = 0 OR (SELECT count(*) FROM searches WHERE user_id = $1) < $5
		RETURNING id, type, name, query, created_at`, userID, kind, name, query, max,
	).Scan(&x.ID, &x.Type, &x.Name, &x.Query, &x.CreatedAt)
	switch {
	case unique(err):
		return nil, ErrTaken
	case errors.Is(err, pgx.ErrNoRows):
		return nil, ErrFull
	case err != nil:
		return nil, err
	}
	return &x, nil
}

func (s *Store) DeleteSearch(ctx context.Context, userID, id int32) error {
	tag, err := s.pool.Exec(ctx, `DELETE FROM searches WHERE id = $1 AND user_id = $2`, id, userID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}
