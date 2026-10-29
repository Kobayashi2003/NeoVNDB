package vn

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5"

	"github.com/kobayashi/neovndb/internal/api/query"
	"github.com/kobayashi/neovndb/internal/vndb"
)

// Stats is what a set of visual novels has in common: who made them, who
// worked on them, and what they are tagged. Counts are of titles, so a title
// with three releases by one publisher counts once.
type Stats struct {
	Count      int                   `json:"count"`
	Developers []Tally               `json:"developers"`
	Publishers []Tally               `json:"publishers"`
	Staff      map[string][]Tally    `json:"staff"`
	Tags       map[string][]TagTally `json:"tags"`
}

// Tally is one producer or person and how many of the titles they are in.
type Tally struct {
	ID       string  `json:"id"`
	Name     string  `json:"name"`
	Original *string `json:"original"`
	Count    int     `json:"count"`
}

// TagTally is one tag, how many of the titles carry it, and how strongly on
// average (vndb's 0-3).
type TagTally struct {
	ID   string `json:"id"`
	Name string `json:"name"`
	// The project's translation of the name, null where there is none.
	Translation *string `json:"translation"`
	Count       int     `json:"count"`
	Rating      float64 `json:"rating"`
}

// Stats counts, over the visual novels a request matches, the top developers,
// publishers, people per credited role and tags per category, `top` of each.
// Tags are the direct ones vndb's voters agree on (rating 1 or more), and
// neither a spoiler nor a lie.
func (r *Resolver) Stats(ctx context.Context, req *query.Request, top int) (*Stats, error) {
	where, args, err := query.Matching(spec, req)
	if err != nil {
		return nil, err
	}
	pool := r.store.Pool()
	picked := fmt.Sprintf("WITH picked AS (SELECT vn.id, vn.c_developers FROM vn WHERE %s)", where)
	limit := fmt.Sprintf("$%d", len(args)+1)
	withTop := append(append([]any(nil), args...), top)

	out := &Stats{Staff: map[string][]Tally{}, Tags: map[string][]TagTally{}}
	if err := pool.QueryRow(ctx, picked+" SELECT COUNT(*)::int FROM picked", args...).Scan(&out.Count); err != nil {
		return nil, err
	}

	tally := func(sql string, kind string) ([]Tally, error) {
		rows, err := pool.Query(ctx, picked+" "+sql, withTop...)
		if err != nil {
			return nil, err
		}
		return pgx.CollectRows(rows, func(row pgx.CollectableRow) (Tally, error) {
			var id int32
			var name string
			var latin *string
			var n int
			err := row.Scan(&id, &name, &latin, &n)
			return Tally{ID: vndb.FormatID(kind, id), Name: query.PreferLatin(name, latin),
				Original: query.OriginalOf(name, latin), Count: n}, err
		})
	}

	if out.Developers, err = tally(`
		SELECT p.id, p.name, p.latin, COUNT(*)::int AS n
		  FROM picked CROSS JOIN LATERAL unnest(picked.c_developers) d(pid)
		  JOIN producers p ON p.id = d.pid
		 GROUP BY p.id ORDER BY n DESC, p.id LIMIT `+limit, vndb.TypeProducer); err != nil {
		return nil, err
	}
	if out.Publishers, err = tally(`
		SELECT p.id, p.name, p.latin, COUNT(DISTINCT rv.vid)::int AS n
		  FROM picked
		  JOIN releases_vn rv ON rv.vid = picked.id
		  JOIN releases rel ON rel.id = rv.id AND rel.official
		  JOIN releases_producers rp ON rp.id = rv.id AND rp.publisher
		  JOIN producers p ON p.id = rp.pid
		 GROUP BY p.id ORDER BY n DESC, p.id LIMIT `+limit, vndb.TypeProducer); err != nil {
		return nil, err
	}

	// Per role, the people credited on the most titles, named by their main
	// name rather than whichever alias a credit used.
	rows, err := pool.Query(ctx, picked+`,
		counted AS (
			SELECT vs.role, sa.id AS sid, COUNT(DISTINCT vs.id)::int AS n
			  FROM picked
			  JOIN vn_staff vs ON vs.id = picked.id
			  JOIN staff_alias sa ON sa.aid = vs.aid
			 GROUP BY vs.role, sa.id),
		ranked AS (
			SELECT *, row_number() OVER (PARTITION BY role ORDER BY n DESC, sid) AS rk FROM counted)
		SELECT ranked.role, ranked.sid, m.name, m.latin, ranked.n
		  FROM ranked
		  JOIN staff s ON s.id = ranked.sid
		  JOIN staff_alias m ON m.aid = s.main
		 WHERE ranked.rk <= `+limit+`
		 ORDER BY ranked.role, ranked.rk`, withTop...)
	if err != nil {
		return nil, err
	}
	for rows.Next() {
		var role, name string
		var latin *string
		var id int32
		var n int
		if err := rows.Scan(&role, &id, &name, &latin, &n); err != nil {
			rows.Close()
			return nil, err
		}
		out.Staff[role] = append(out.Staff[role], Tally{ID: vndb.FormatID(vndb.TypeStaff, id),
			Name: query.PreferLatin(name, latin), Original: query.OriginalOf(name, latin), Count: n})
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	rows, err = pool.Query(ctx, picked+`,
		counted AS (
			SELECT t.cat, t.id, t.name, COUNT(*)::int AS n, AVG(tv.rating)::float8 AS rating
			  FROM picked
			  JOIN tags_vn_direct tv ON tv.vid = picked.id
			   AND tv.rating >= 1 AND tv.spoiler = 0 AND NOT tv.lie
			  JOIN tags t ON t.id = tv.tag
			 GROUP BY t.id),
		ranked AS (
			SELECT *, row_number() OVER (PARTITION BY cat ORDER BY n DESC, rating DESC, id) AS rk
			  FROM counted)
		SELECT cat, id, name, n, rating FROM ranked WHERE rk <= `+limit+` ORDER BY cat, rk`, withTop...)
	if err != nil {
		return nil, err
	}
	for rows.Next() {
		var cat, name string
		var id int32
		var n int
		var rating float64
		if err := rows.Scan(&cat, &id, &name, &n, &rating); err != nil {
			rows.Close()
			return nil, err
		}
		out.Tags[cat] = append(out.Tags[cat], TagTally{ID: vndb.FormatID(vndb.TypeTag, id),
			Name: name, Count: n, Rating: rating})
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	var names []string
	for _, tags := range out.Tags {
		for _, t := range tags {
			names = append(names, t.Name)
		}
	}
	found, err := r.store.Translations(ctx, names, nil)
	if err != nil {
		return nil, err
	}
	for _, tags := range out.Tags {
		for i := range tags {
			if to := found.Name(tags[i].Name); to != "" {
				tags[i].Translation = &to
			}
		}
	}
	return out, nil
}
