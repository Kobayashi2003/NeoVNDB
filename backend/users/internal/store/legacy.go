package store

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Bringing across what the service this one replaces was holding.
//
// The old shape was seven category tables, one per type, each row carrying its
// marks as an array of JSON objects. This one has a single collections table
// with a type column and marks as rows, so the import is mostly a transpose --
// the two designs disagree about where the type lives and whether a mark is a
// row or a field, and about nothing else.
//
// Read-only on the old database, and everything it writes goes in one
// transaction: a half-imported account is worse than none, because the second
// attempt would then have to work out which half it already did.
//
// Passwords come across verbatim. They are in Werkzeug's scrypt format, which
// internal/auth reads and retires on the owner's next sign-in; see legacy.go
// there. Ratings are not brought across, because there is nothing here that
// keeps one.

// LegacyReport says what an import did, so the operator can compare it with
// what was in the old database rather than trust that it worked.
type LegacyReport struct {
	Users       int
	Skipped     []string
	Collections int
	Marks       int
}

// The old table per type, and the letter this schema files it under.
var legacyTables = []struct {
	table string
	kind  string
}{
	{"vn_categories", "v"},
	{"release_categories", "r"},
	{"character_categories", "c"},
	{"producer_categories", "p"},
	{"staff_categories", "s"},
	{"tag_categories", "g"},
	{"trait_categories", "i"},
}

// One mark as the query below rebuilds it, and one old list with its marks.
type legacyMark struct {
	ID int32  `json:"id"`
	At string `json:"at"`
}

type legacyList struct {
	id    int32
	name  string
	made  time.Time
	items []legacyMark
}

type legacyUser struct {
	id        int32
	username  string
	email     *string
	hash      string
	isAdmin   bool
	createdAt time.Time
}

// ImportLegacy copies accounts and lists from the old service's database.
//
// A username already taken here is left alone and reported rather than merged:
// the two rows are only the same person if someone says so, and guessing wrong
// would hand one reader another's lists.
func (s *Store) ImportLegacy(ctx context.Context, oldURL string) (*LegacyReport, error) {
	old, err := pgxpool.New(ctx, oldURL)
	if err != nil {
		return nil, fmt.Errorf("opening the old database: %w", err)
	}
	defer old.Close()
	if err := old.Ping(ctx); err != nil {
		return nil, fmt.Errorf("reaching the old database: %w", err)
	}

	users, err := readLegacyUsers(ctx, old)
	if err != nil {
		return nil, err
	}

	report := &LegacyReport{}
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	for _, u := range users {
		var taken bool
		if err := tx.QueryRow(ctx,
			`SELECT EXISTS (SELECT 1 FROM users WHERE lower(username) = lower($1))`,
			u.username).Scan(&taken); err != nil {
			return nil, err
		}
		if taken {
			report.Skipped = append(report.Skipped, u.username)
			continue
		}

		var newID int32
		if err := tx.QueryRow(ctx, `
			INSERT INTO users (username, email, password_hash, is_admin, created_at)
			VALUES ($1, $2, $3, $4, $5)
			RETURNING id`,
			u.username, u.email, u.hash, u.isAdmin, u.createdAt).Scan(&newID); err != nil {
			return nil, fmt.Errorf("creating %s: %w", u.username, err)
		}
		report.Users++

		lists, marks, err := importLists(ctx, old, tx, u.id, newID)
		if err != nil {
			return nil, fmt.Errorf("importing %s: %w", u.username, err)
		}
		report.Collections += lists
		report.Marks += marks
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}
	return report, nil
}

func readLegacyUsers(ctx context.Context, old *pgxpool.Pool) ([]legacyUser, error) {
	rows, err := old.Query(ctx, `
		SELECT id, username, email, password_hash, is_admin, created_at
		  FROM users ORDER BY id`)
	if err != nil {
		return nil, fmt.Errorf("reading the old users: %w", err)
	}
	defer rows.Close()

	var out []legacyUser
	for rows.Next() {
		var u legacyUser
		if err := rows.Scan(&u.id, &u.username, &u.email, &u.hash, &u.isAdmin, &u.createdAt); err != nil {
			return nil, err
		}
		out = append(out, u)
	}
	return out, rows.Err()
}

// importLists walks one reader's seven old tables and writes what it finds.
func importLists(ctx context.Context, old *pgxpool.Pool, tx pgx.Tx, oldUser, newUser int32) (lists, marks int, err error) {
	for _, t := range legacyTables {
		// The marks are unnested here rather than in Go so that a list arrives
		// as its rows, which is the shape this schema wants anyway.
		rows, err := old.Query(ctx, fmt.Sprintf(`
			SELECT c.id, c.category_name, c.created_at,
			       coalesce(m.item, '[]'::jsonb) AS items
			  FROM %s c
			  LEFT JOIN LATERAL (
			       SELECT jsonb_agg(jsonb_build_object(
			                  'id', (e->>'id')::int,
			                  'at', e->>'marked_at')) AS item
			         FROM unnest(c.marks) AS e
			  ) m ON true
			 WHERE c.user_id = $1
			 ORDER BY c.id`, t.table), oldUser)
		if err != nil {
			return lists, marks, fmt.Errorf("reading %s: %w", t.table, err)
		}

		var found []legacyList
		for rows.Next() {
			var r legacyList
			if err := rows.Scan(&r.id, &r.name, &r.made, &r.items); err != nil {
				rows.Close()
				return lists, marks, err
			}
			found = append(found, r)
		}
		rows.Close()
		if err := rows.Err(); err != nil {
			return lists, marks, err
		}

		for _, r := range found {
			var listID int32
			if err := tx.QueryRow(ctx, `
				INSERT INTO collections (user_id, type, name, created_at)
				VALUES ($1, $2, $3, $4)
				RETURNING id`,
				newUser, t.kind, r.name, r.made).Scan(&listID); err != nil {
				return lists, marks, fmt.Errorf("creating list %q: %w", r.name, err)
			}
			lists++

			for _, h := range r.items {
				at, err := time.Parse(time.RFC3339, h.At)
				if err != nil {
					// A mark whose timestamp will not parse still belongs to
					// the reader; only its place in the order is lost.
					at = r.made
				}
				tag, err := tx.Exec(ctx, `
					INSERT INTO marks (collection_id, item, marked_at)
					VALUES ($1, $2, $3)
					ON CONFLICT DO NOTHING`, listID, h.ID, at)
				if err != nil {
					return lists, marks, fmt.Errorf("marking %d on %q: %w", h.ID, r.name, err)
				}
				marks += int(tag.RowsAffected())
			}
		}
	}
	return lists, marks, nil
}
