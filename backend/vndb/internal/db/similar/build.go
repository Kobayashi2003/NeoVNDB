package similar

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Build fills schema.vn_similar from that generation's tag scores. Only
// content and sexual-content tags count: technical ones (engine, voiced,
// length) say how a work was made, not what it is like.
func Build(ctx context.Context, pool *pgxpool.Pool, schema string) (int, error) {
	in := pgx.Identifier{schema}.Sanitize()

	rows, err := pool.Query(ctx, fmt.Sprintf(`
		SELECT d.vid, d.tag, d.rating
		  FROM %[1]s.tags_vn_direct d
		  JOIN %[1]s.tags t ON t.id = d.tag
		 WHERE NOT d.lie AND d.rating > 0 AND t.cat IN ('cont', 'ero')`, in))
	if err != nil {
		return 0, err
	}
	tags, err := pgx.CollectRows(rows, func(r pgx.CollectableRow) (Tag, error) {
		var t Tag
		return t, r.Scan(&t.Work, &t.Tag, &t.Rating)
	})
	if err != nil {
		return 0, err
	}

	rows, err = pool.Query(ctx, fmt.Sprintf(`SELECT id, vid FROM %s.vn_relations`, in))
	if err != nil {
		return 0, err
	}
	related := map[[2]int32]bool{}
	for rows.Next() {
		var a, b int32
		if err := rows.Scan(&a, &b); err != nil {
			rows.Close()
			return 0, err
		}
		related[[2]int32{a, b}] = true
	}
	if err := rows.Err(); err != nil {
		return 0, err
	}

	pairs := Neighbours(tags, func(a, b int32) bool { return related[[2]int32{a, b}] || related[[2]int32{b, a}] })
	copied, err := pool.CopyFrom(ctx, pgx.Identifier{schema, "vn_similar"},
		[]string{"id", "vid", "score"},
		pgx.CopyFromSlice(len(pairs), func(i int) ([]any, error) {
			p := pairs[i]
			return []any{p.Work, p.Similar, p.Score}, nil
		}))
	return int(copied), err
}
