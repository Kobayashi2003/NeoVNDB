package store

import (
	"context"
	"errors"
	"time"

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

// Rated is one rating as the ratings page lists it.
type Rated struct {
	ID      string    `json:"id"`
	Rating  int16     `json:"rating"`
	RatedAt time.Time `json:"rated_at"`
}

// rateOrder is the ORDER BY for the ratings page: by the rating ("rating",
// newest first among equals) or by when it was given ("rated").
func rateOrder(o Order) string {
	dir := "DESC"
	if o.Reverse {
		dir = "ASC"
	}
	if o.By == "rated" {
		return "rated_at " + dir + ", item " + dir
	}
	return "rating " + dir + ", rated_at DESC, item DESC"
}

func scanRated(rows pgx.Rows, kind string) ([]Rated, error) {
	defer rows.Close()
	out := []Rated{}
	for rows.Next() {
		var item int32
		var r Rated
		if err := rows.Scan(&item, &r.Rating, &r.RatedAt); err != nil {
			return nil, err
		}
		r.ID = kind + itoa(item)
		out = append(out, r)
	}
	return out, rows.Err()
}

// Ratings is what the reader rated of one kind: a page of it, or with a limit
// of 0 all of it. The total says how many there are in all.
func (s *Store) Ratings(ctx context.Context, userID int32, kind string, order Order, limit, offset int) ([]Rated, int, error) {
	var total int
	if err := s.pool.QueryRow(ctx,
		`SELECT count(*) FROM ratings WHERE user_id = $1 AND type = $2`, userID, kind).Scan(&total); err != nil {
		return nil, 0, err
	}
	rows, err := s.pool.Query(ctx, `
		SELECT item, rating, rated_at FROM ratings
		 WHERE user_id = $1 AND type = $2
		 ORDER BY `+rateOrder(order)+` LIMIT NULLIF($3, 0) OFFSET $4`, userID, kind, limit, offset)
	if err != nil {
		return nil, 0, err
	}
	out, err := scanRated(rows, kind)
	return out, total, err
}

// RatingCounts is how many of each kind the reader rated.
func (s *Store) RatingCounts(ctx context.Context, userID int32) (map[string]int, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT type, count(*) FROM ratings WHERE user_id = $1 GROUP BY type`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[string]int{}
	for rows.Next() {
		var kind string
		var n int
		if err := rows.Scan(&kind, &n); err != nil {
			return nil, err
		}
		out[kind] = n
	}
	return out, rows.Err()
}

// SetRatings gives every item the same rating, rated or not before; one
// statement, so all or nothing. The count is how many it touched.
func (s *Store) SetRatings(ctx context.Context, userID int32, kind string, items []int32, rating int16) (int64, error) {
	tag, err := s.pool.Exec(ctx, `
		INSERT INTO ratings (user_id, type, item, rating)
		SELECT $1, $2, unnest($3::int[]), $4
		ON CONFLICT (user_id, type, item) DO UPDATE SET rating = EXCLUDED.rating, rated_at = now()`,
		userID, kind, items, rating)
	if err != nil {
		return 0, err
	}
	return tag.RowsAffected(), nil
}

// ClearRatings takes those ratings back; the count is how many there were.
func (s *Store) ClearRatings(ctx context.Context, userID int32, kind string, items []int32) (int64, error) {
	tag, err := s.pool.Exec(ctx,
		`DELETE FROM ratings WHERE user_id = $1 AND type = $2 AND item = ANY($3)`, userID, kind, items)
	if err != nil {
		return 0, err
	}
	return tag.RowsAffected(), nil
}
