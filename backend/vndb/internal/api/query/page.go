package query

import (
	"context"
	"fmt"
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
	// Table is the FROM clause with its alias; Alias is the alias alone.
	Table string
	Alias string
	// IDType parses an id= filter.
	IDType string
	// SearchEntity is the letter search_cache stores, for searchrank.
	SearchEntity string

	Filters map[string]FilterFunc
	Sorts   map[string]string
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

	ordering, err := orderBy(spec, req)
	if err != nil {
		return nil, 0, err
	}

	// Kept before paging is appended, so the count below can reuse them.
	where := b.SQL()
	conds := append([]any(nil), b.Args...)

	sql := fmt.Sprintf("SELECT %s.*, COUNT(*) OVER ()::int AS total FROM %s WHERE %s ORDER BY %s",
		spec.Alias, spec.Table, where, ordering)
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

func orderBy(spec PageSpec, req *Request) (string, error) {
	name := req.Sort
	if name == "" {
		name = "id"
	}
	expr, ok := spec.Sorts[name]
	if !ok {
		return "", BadRequest("cannot sort by %q", name)
	}
	if name == "searchrank" {
		if _, searching := req.Filters["search"]; !searching {
			return "", BadRequest("searchrank only orders a search")
		}
		expr = fmt.Sprintf(`(SELECT MAX(sc.prio) FROM search_cache sc
		          WHERE sc.entity_type = '%s' AND sc.id = %s.id)`,
			spec.SearchEntity, spec.Alias)
	}

	direction := " ASC"
	if req.Reverse {
		direction = " DESC"
	}
	// id breaks ties so paging is stable between requests.
	return expr + direction + " NULLS LAST, " + spec.Alias + ".id" + direction, nil
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
