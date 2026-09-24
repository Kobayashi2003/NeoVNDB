package store

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"
)

// Ratings (1-5) belong to an item, not a list, so they are keyed by reader,
// kind and id.

// Rating returns what the reader gave this, or nil if they have not said.
func (s *Store) Rating(ctx context.Context, userID int32, kind string, item int32) (*int16, error) {
	var rating int16
	err := s.pool.QueryRow(ctx, `
		SELECT rating FROM ratings
		 WHERE user_id = $1 AND type = $2 AND item = $3`, userID, kind, item).Scan(&rating)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &rating, nil
}

// SetRating records an opinion, replacing whatever was there. Changing one's
// mind is the ordinary case, not a conflict.
func (s *Store) SetRating(ctx context.Context, userID int32, kind string, item int32, rating int16) error {
	_, err := s.pool.Exec(ctx, `
		INSERT INTO ratings (user_id, type, item, rating) VALUES ($1, $2, $3, $4)
		ON CONFLICT (user_id, type, item) DO UPDATE SET rating = EXCLUDED.rating, rated_at = now()`,
		userID, kind, item, rating)
	return err
}

// ClearRating takes the opinion back. Nothing to clear is the outcome asked
// for, so it is not an error.
func (s *Store) ClearRating(ctx context.Context, userID int32, kind string, item int32) error {
	_, err := s.pool.Exec(ctx,
		`DELETE FROM ratings WHERE user_id = $1 AND type = $2 AND item = $3`, userID, kind, item)
	return err
}
