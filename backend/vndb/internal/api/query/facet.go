package query

import (
	"context"
	"fmt"
	"strings"

	"github.com/jackc/pgx/v5/pgxpool"
)

// Faceted is a type that can count its rows per value of one of its filters.
type Faceted interface {
	Facet(ctx context.Context, req *Request, name string, values []string) (map[string]int, error)
}

// Facet counts, for each value of one filter, how many rows the request would
// match with that value chosen: the numbers beside a filter menu's choices.
// The filter's own current choice is set aside, since the menu offers the
// alternatives to it; the rest of the request narrows every count.
//
// One statement and one scan whatever the number of values: each count is an
// aggregate FILTER on the condition the filter itself builds, so a value counts
// exactly what choosing it would show.
func Facet(ctx context.Context, pool *pgxpool.Pool, spec PageSpec, req *Request,
	name string, values []string) (map[string]int, error) {

	sql, args, err := facetSQL(spec, req, name, values)
	if err != nil {
		return nil, err
	}
	got := make([]int, len(values))
	dest := make([]any, len(values))
	for i := range got {
		dest[i] = &got[i]
	}
	if err := pool.QueryRow(ctx, sql, args...).Scan(dest...); err != nil {
		return nil, err
	}
	out := make(map[string]int, len(values))
	for i, v := range values {
		out[v] = got[i]
	}
	return out, nil
}

// facetSQL is the statement behind Facet: one count per value, in order.
func facetSQL(spec PageSpec, req *Request, name string, values []string) (string, []any, error) {
	apply, ok := spec.Filters[name]
	if !ok || name == idFilter {
		return "", nil, BadRequest("unknown filter %q", name)
	}
	if len(values) == 0 {
		return "", nil, BadRequest("name the values to count")
	}
	// Each value is a condition evaluated on every row, as a filter node is.
	if max := req.Limits.MaxFilterNodes; max > 0 && len(values) > max {
		return "", nil, BadRequest("at most %d values may be counted at once", max)
	}

	b := &Builder{Limits: req.Limits, Types: req.cat, Budget: req.budget}
	if _, err := conditions(spec, req, b, name); err != nil {
		return "", nil, err
	}
	where := b.SQL()

	counts := make([]string, len(values))
	for i, v := range values {
		before := len(b.Conds)
		if err := apply(b, v); err != nil {
			return "", nil, err
		}
		counts[i] = fmt.Sprintf("COUNT(*) FILTER (WHERE %s)::int", strings.Join(b.Conds[before:], " AND "))
		b.Conds = b.Conds[:before]
	}
	return fmt.Sprintf("SELECT %s FROM %s WHERE %s", strings.Join(counts, ", "), spec.Table, where), b.Args, nil
}
