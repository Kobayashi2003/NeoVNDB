package query

import (
	"context"
	"fmt"
	"sort"
	"strings"
	"unicode"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/kobayashi/neovndb/internal/vndb"
)

// Countable is a row carrying the window-function total, so one statement
// returns both the page and the count.
type Countable interface{ Count() int32 }

type PageSpec struct {
	// Table is the main table with its alias, and nothing joined: filters
	// reach other tables through EXISTS, and a sort brings its own join.
	Table string
	Alias string
	// IDType parses an id= filter.
	IDType string
	// SearchEntity is the letter search_cache stores, for searchrank.
	SearchEntity string
	// Popularity weighs into searchrank (vote count, items tagged); optional.
	Popularity string

	Filters map[string]FilterFunc
	Sorts   map[string]Sort
}

// SortNames lists a spec's orders, sorted.
func SortNames(spec PageSpec) []string {
	names := make([]string, 0, len(spec.Sorts))
	for name := range spec.Sorts {
		names = append(names, name)
	}
	sort.Strings(names)
	return names
}

// Sort is one ordering a type offers. Join is what Expr needs beyond the main
// table; it reaches the FROM only when this sort is asked for, so the count and
// every other ordering never pay for it, and its alias cannot meet a filter's.
type Sort struct {
	Expr string
	Join string
}

// Page runs one filtered, ordered page and returns the rows with the total. A
// lookup by id is a primary-key hit and skips paging.
func Page[T Countable](ctx context.Context, pool *pgxpool.Pool, spec PageSpec,
	req *Request, scan pgx.RowToFunc[T]) ([]T, int, error) {

	b := &Builder{Limits: req.Limits, Types: req.cat, Budget: req.budget}

	byID := false
	if raw, ok := req.Filters[idFilter]; ok {
		ids, err := vndb.ParseIDs(spec.IDType, raw, req.Limits.MaxIDs)
		if err != nil {
			return nil, 0, BadRequest("%v", err)
		}
		b.Where(spec.Alias+".id = ANY(%s)", ids)
		byID = true
	}
	for name, value := range req.Filters {
		if name == idFilter {
			continue
		}
		apply, ok := spec.Filters[name]
		if !ok {
			return nil, 0, BadRequest("unknown filter %q", name)
		}
		if err := apply(b, value); err != nil {
			return nil, 0, err
		}
	}

	// The expression is ANDed with the plain parameters.
	if err := b.Expr(req.expr, spec.Filters); err != nil {
		return nil, 0, err
	}

	// Kept before ordering and paging add their own, so the count below can
	// reuse them.
	where := b.SQL()
	conds := append([]any(nil), b.Args...)

	ordering, join, err := orderBy(spec, req, b)
	if err != nil {
		return nil, 0, err
	}

	from := spec.Table
	if join != "" {
		from += " " + join
	}
	sql := fmt.Sprintf("SELECT %s.*, COUNT(*) OVER ()::int AS total FROM %s WHERE %s ORDER BY %s",
		spec.Alias, from, where, ordering)
	if !byID {
		sql += fmt.Sprintf(" LIMIT %s OFFSET %s", b.Arg(req.Limit), b.Arg(req.Offset()))
	}

	rows, err := pool.Query(ctx, sql, b.Args...)
	if err != nil {
		return nil, 0, err
	}
	page, err := pgx.CollectRows(rows, scan)
	if err != nil {
		return nil, 0, err
	}

	if len(page) > 0 {
		return page, int(page[0].Count()), nil
	}
	// An empty page carries no count, so past the end a matching filter would
	// report zero; only then is a second statement worth it.
	if byID || req.Offset() == 0 {
		return page, 0, nil
	}
	total, err := count(ctx, pool, spec, where, conds)
	return page, total, err
}

func count(ctx context.Context, pool *pgxpool.Pool, spec PageSpec,
	where string, args []any) (int, error) {

	var total int
	err := pool.QueryRow(ctx,
		fmt.Sprintf("SELECT COUNT(*)::int FROM %s WHERE %s", spec.Table, where),
		args...).Scan(&total)
	return total, err
}

// orderBy returns the ORDER BY clause and the join it needs, if any.
func orderBy(spec PageSpec, req *Request, b *Builder) (string, string, error) {
	name := req.Sort
	if name == "" {
		name = "id"
	}
	order, ok := spec.Sorts[name]
	if !ok {
		return "", "", BadRequest("cannot sort by %q", name)
	}

	direction := " ASC"
	if req.Reverse {
		direction = " DESC"
	}
	if name == "searchrank" {
		rank, err := searchRank(spec, req, b, direction)
		return rank, "", err
	}
	// id breaks ties so paging is stable between requests.
	return order.Expr + direction + " NULLS LAST, " + spec.Alias + ".id" + direction, order.Join, nil
}

// searchRank scores each row by its best matching label: equal to the whole
// query, then starting with it, then holding every word, weighted by the
// label's kind (title, alias, indirect); then trigram similarity and the
// entry's popularity where the type has one. Ties go to the older entry.
func searchRank(spec PageSpec, req *Request, b *Builder, direction string) (string, error) {
	raw, searching := req.Filters["search"]
	if !searching {
		return "", BadRequest("searchrank only orders a search")
	}
	value, err := matchOnly(raw)
	if err != nil {
		return "", err
	}
	terms := SearchTerms(value)
	// Uncorrelated, so it runs once rather than for every label ranked: with
	// a bound parameter the planner cannot fold the call into a constant.
	q := fmt.Sprintf("(SELECT search_norm_term(%s))", b.Arg(strings.Join(terms, " ")))

	// With one word, "holds every word" is just "contains the query"; the
	// general form unnests the words for every label and costs most of the
	// time on a broad search.
	every := "sc.label LIKE '%%' || " + q + " || '%%'"
	if len(terms) > 1 {
		words := fmt.Sprintf("(SELECT array_agg(search_norm_term(w)) FROM unnest(%s::text[]) w)", b.Arg(terms))
		every = fmt.Sprintf(`(SELECT bool_and(sc.label LIKE '%%%%' || w || '%%%%') FROM unnest(%s) w)`, words)
	}

	// Match bonuses count fully on a main title, less on an alias and least
	// on an indirect hit such as a release title: an alias that happens to
	// start with the query should not tie with a title that does.
	rank := fmt.Sprintf(`(SELECT MAX(
	      ( CASE WHEN sc.label = %[1]s THEN 100 WHEN sc.label LIKE %[1]s || '%%' THEN 50 ELSE 0 END
	      + CASE WHEN `+every+` THEN 20 ELSE 0 END )
	      * CASE sc.prio WHEN 3 THEN 1.0 WHEN 2 THEN 0.7 ELSE 0.4 END
	    + sc.prio * 5
	    + similarity(sc.label, %[1]s) * 10)
	   FROM search_cache sc
	  WHERE sc.entity_type = '%[2]s' AND sc.id = %[3]s.id)`,
		q, spec.SearchEntity, spec.Alias)
	if spec.Popularity != "" {
		// About +20 for the most voted-on VNs, a few points for obscure ones:
		// enough to order equal matches, never enough to beat a better one.
		rank += fmt.Sprintf(" + COALESCE(ln(1 + GREATEST(%s, 0)), 0) * 2", spec.Popularity)
	}
	return "(" + rank + ")" + direction + " NULLS LAST, " + spec.Alias + ".id ASC", nil
}

// SearchTerms splits a query into words that must each match, in any order; a
// double-quoted phrase stays one term.
func SearchTerms(query string) []string {
	var terms []string
	var word strings.Builder
	quoted := false

	flush := func() {
		if t := strings.TrimSpace(word.String()); t != "" {
			terms = append(terms, t)
		}
		word.Reset()
	}
	for _, r := range query {
		switch {
		case r == '"':
			flush()
			quoted = !quoted
		case !quoted && unicode.IsSpace(r):
			flush()
		default:
			word.WriteRune(r)
		}
	}
	flush()
	return terms
}

// idFilter names rows rather than narrowing them, so it is handled before any
// filter runs.
const idFilter = "id"

// SearchFilter adds one condition per word, ANDed, so a title and an alias can
// each match part of the query. Terms go through the same normaliser as the
// index.
func SearchFilter(entity, alias string) FilterFunc {
	condition := fmt.Sprintf(`EXISTS (
		SELECT 1 FROM search_cache sc
		 WHERE sc.entity_type = '%s' AND sc.id = %s.id
		   AND sc.label LIKE '%%%%' || search_norm_term(%%s) || '%%%%')`, entity, alias)
	return func(b *Builder, value string) error {
		value, err := matchOnly(value)
		if err != nil {
			return err
		}
		terms := SearchTerms(value)
		if len(terms) == 0 {
			return BadRequest("search needs a term")
		}
		if max := b.Limits.MaxSearchTerms; max > 0 && len(terms) > max {
			return BadRequest("a search may have at most %d words", max)
		}
		for _, term := range terms {
			b.Where(condition, term)
		}
		return nil
	}
}
