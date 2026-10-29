package vn

import (
	"context"
	"strconv"
	"strings"

	"github.com/kobayashi/neovndb/internal/api/query"
	"github.com/kobayashi/neovndb/internal/vndb"
)

// Liked is one title a recommendation starts from, and how much it counts:
// more for one the reader rated highly, below zero for one they disliked.
type Liked struct {
	ID     int32
	Weight float64
}

// Pick is one recommended title, its score, and the titles it came from, most
// telling first.
type Pick struct {
	ID      string   `json:"id"`
	Score   float64  `json:"score"`
	Because []string `json:"because"`
}

// maxWeight keeps one title from outweighing a whole collection.
const maxWeight = 5

// ParseLiked reads `v17:2,v11,v4:-0.5`: titles with an optional weight, 1 when
// none is given.
func ParseLiked(raw string, maxIDs int) ([]Liked, error) {
	var out []Liked
	for _, part := range strings.Split(raw, ",") {
		part = strings.TrimSpace(part)
		if part == "" {
			continue
		}
		id, weight, hasWeight := strings.Cut(part, ":")
		n, err := vndb.ParseID(vndb.TypeVN, id)
		if err != nil {
			return nil, query.BadRequest("%v", err)
		}
		w := 1.0
		if hasWeight {
			if w, err = strconv.ParseFloat(weight, 64); err != nil || w < -maxWeight || w > maxWeight {
				return nil, query.BadRequest("weight %q is not a number from -%d to %d", weight, maxWeight, maxWeight)
			}
		}
		out = append(out, Liked{ID: n, Weight: w})
	}
	if len(out) == 0 {
		return nil, query.BadRequest("name the titles to start from: from=v17,v11:2")
	}
	if maxIDs > 0 && len(out) > maxIDs {
		return nil, query.BadRequest("at most %d titles may be started from", maxIDs)
	}
	return out, nil
}

// Recommend sums, for every title alike to the ones given (vn_similar, by
// tags), its likeness to each times that one's weight, and returns the best
// `limit` that are neither given nor excluded. "Because" names the three that
// added the most.
func (r *Resolver) Recommend(ctx context.Context, from []Liked, exclude []int32, limit int) ([]Pick, error) {
	ids := make([]int32, len(from))
	weights := make([]float64, len(from))
	for i, l := range from {
		ids[i], weights[i] = l.ID, l.Weight
	}
	rows, err := r.store.Pool().Query(ctx, `
		WITH src(id, w) AS (SELECT * FROM unnest($1::int[], $2::float8[]))
		SELECT s.vid,
		       SUM(s.score * src.w)::float8 AS score,
		       (array_agg(src.id ORDER BY s.score * src.w DESC))[1:3] AS because
		  FROM vn_similar s
		  JOIN src ON src.id = s.id
		 WHERE s.vid <> ALL($1::int[]) AND s.vid <> ALL($3::int[])
		 GROUP BY s.vid
		HAVING SUM(s.score * src.w) > 0
		 ORDER BY score DESC, s.vid
		 LIMIT $4`, ids, weights, exclude, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Pick{}
	for rows.Next() {
		var id int32
		var score float64
		var because []int32
		if err := rows.Scan(&id, &score, &because); err != nil {
			return nil, err
		}
		p := Pick{ID: vndb.FormatID(vndb.TypeVN, id), Score: score}
		for _, b := range because {
			p.Because = append(p.Because, vndb.FormatID(vndb.TypeVN, b))
		}
		out = append(out, p)
	}
	return out, rows.Err()
}
