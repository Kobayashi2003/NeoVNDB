package store

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
)

type Collection struct {
	ID        int32     `json:"id"`
	Type      string    `json:"type"`
	Name      string    `json:"name"`
	Count     int       `json:"count"`
	CreatedAt time.Time `json:"created_at"`
}

type Mark struct {
	// The full vndb id, rebuilt from the collection's type and the stored
	// number, because that is what a caller passes back to the read API.
	ID       string    `json:"id"`
	MarkedAt time.Time `json:"marked_at"`
}

// Collections lists what a reader keeps, of one kind or of every kind. The
// counts come along because a list of lists is nearly useless without them
// and they cost one join.
func (s *Store) Collections(ctx context.Context, userID int32, kind string) ([]Collection, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT c.id, c.type, c.name, count(m.item), c.created_at
		  FROM collections c
		  LEFT JOIN marks m ON m.collection_id = c.id
		 WHERE c.user_id = $1 AND ($2 = '' OR c.type = $2)
		 GROUP BY c.id
		 ORDER BY c.type, c.name`, userID, kind)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []Collection{}
	for rows.Next() {
		var c Collection
		if err := rows.Scan(&c.ID, &c.Type, &c.Name, &c.Count, &c.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

// owned reads one collection only if it belongs to this reader. Every write
// goes through it, so a guessed id is a 404 rather than someone else's list.
func (s *Store) owned(ctx context.Context, userID, id int32) (string, error) {
	var kind string
	err := s.pool.QueryRow(ctx,
		`SELECT type FROM collections WHERE id = $1 AND user_id = $2`, id, userID).Scan(&kind)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", ErrNotFound
	}
	return kind, err
}

func (s *Store) CreateCollection(ctx context.Context, userID int32, kind, name string) (*Collection, error) {
	var c Collection
	err := s.pool.QueryRow(ctx, `
		INSERT INTO collections (user_id, type, name) VALUES ($1, $2, $3)
		RETURNING id, type, name, 0, created_at`, userID, kind, name,
	).Scan(&c.ID, &c.Type, &c.Name, &c.Count, &c.CreatedAt)
	if unique(err) {
		return nil, ErrTaken
	}
	return &c, err
}

func (s *Store) RenameCollection(ctx context.Context, userID, id int32, name string) error {
	tag, err := s.pool.Exec(ctx,
		`UPDATE collections SET name = $3 WHERE id = $1 AND user_id = $2`, id, userID, name)
	if unique(err) {
		return ErrTaken
	}
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

func (s *Store) DeleteCollection(ctx context.Context, userID, id int32) error {
	tag, err := s.pool.Exec(ctx,
		`DELETE FROM collections WHERE id = $1 AND user_id = $2`, id, userID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// Marks is one page of what a list holds, newest first. The ids come back
// whole so a caller can hand them straight to the read API, which takes up to
// a hundred at a time -- which is why the page size here stays under that.
func (s *Store) Marks(ctx context.Context, userID, id int32, limit, offset int) ([]Mark, int, error) {
	kind, err := s.owned(ctx, userID, id)
	if err != nil {
		return nil, 0, err
	}

	var total int
	if err := s.pool.QueryRow(ctx,
		`SELECT count(*) FROM marks WHERE collection_id = $1`, id).Scan(&total); err != nil {
		return nil, 0, err
	}

	rows, err := s.pool.Query(ctx, `
		SELECT item, marked_at FROM marks
		 WHERE collection_id = $1
		 ORDER BY marked_at DESC, item DESC
		 LIMIT $2 OFFSET $3`, id, limit, offset)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	out := []Mark{}
	for rows.Next() {
		var item int32
		var at time.Time
		if err := rows.Scan(&item, &at); err != nil {
			return nil, 0, err
		}
		out = append(out, Mark{ID: kind + itoa(item), MarkedAt: at})
	}
	return out, total, rows.Err()
}

// AddMark is idempotent: saving something twice is a thing a reader does by
// accident, and the second time should mean the same as the first.
//
// kind has to match the list's, so a character cannot be filed under novels --
// the number alone would happily go in either, since both are just numbers.
func (s *Store) AddMark(ctx context.Context, userID, id int32, kind string, item int32) error {
	if err := s.holds(ctx, userID, id, kind); err != nil {
		return err
	}
	_, err := s.pool.Exec(ctx, `
		INSERT INTO marks (collection_id, item) VALUES ($1, $2)
		ON CONFLICT (collection_id, item) DO NOTHING`, id, item)
	return err
}

func (s *Store) RemoveMark(ctx context.Context, userID, id int32, kind string, item int32) error {
	if err := s.holds(ctx, userID, id, kind); err != nil {
		return err
	}
	_, err := s.pool.Exec(ctx,
		`DELETE FROM marks WHERE collection_id = $1 AND item = $2`, id, item)
	return err
}

// holds is owned plus the type check. A list of the wrong type reads as no
// such list, because to the caller it is: the one they named cannot hold this.
func (s *Store) holds(ctx context.Context, userID, id int32, kind string) error {
	mine, err := s.owned(ctx, userID, id)
	if err != nil {
		return err
	}
	if mine != kind {
		return ErrNotFound
	}
	return nil
}

// Holding answers "which of my lists have this in them", which is what every
// detail page asks once and nothing else asks at all.
func (s *Store) Holding(ctx context.Context, userID int32, kind string, item int32) ([]int32, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT c.id FROM collections c
		  JOIN marks m ON m.collection_id = c.id
		 WHERE c.user_id = $1 AND c.type = $2 AND m.item = $3
		 ORDER BY c.id`, userID, kind, item)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []int32{}
	for rows.Next() {
		var id int32
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		out = append(out, id)
	}
	return out, rows.Err()
}

func itoa(n int32) string {
	if n == 0 {
		return "0"
	}
	var buf [12]byte
	i := len(buf)
	for n > 0 {
		i--
		buf[i] = byte('0' + n%10)
		n /= 10
	}
	return string(buf[i:])
}
