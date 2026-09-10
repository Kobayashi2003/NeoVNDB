package query

import (
	"context"
	"fmt"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/kobayashi/neovndb/internal/vndb"
)

// Paging, filtering and ordering are identical for every entity type: only the
// table, the filter table and the sortable expressions differ. Page holds that
// shared shape so a resolver is left with just its own fields and fragments.

// Countable is a scanned row that carries the window-function total alongside
// the entity, which is how one statement returns both the page and the count.
type Countable interface{ Count() int32 }

type PageSpec struct {
	// Table is the FROM clause including the alias, e.g. "producers p"; Alias
	// is that alias on its own, used for the id filter and tie-breaking.
	Table string
	Alias string
	// IDType is the entity's id prefix, for parsing an id= filter.
	IDType string
	// SearchEntity is the single letter search_cache stores, for searchrank.
	SearchEntity string

	Filters map[string]FilterFunc
	Sorts   map[string]string
}

// Page runs one filtered, ordered page and returns the rows with the total.
//
// A lookup by id skips paging: it is a primary-key hit and the caller asked
// for specific rows, not a slice of them.
func Page[T Countable](ctx context.Context, pool *pgxpool.Pool, spec PageSpec,
	req *Request, scan pgx.RowToFunc[T]) ([]T, int, error) {

	b := &Builder{}

	byID := false
	if raw, ok := req.Filters["id"]; ok {
		ids, err := vndb.ParseIDs(spec.IDType, raw, req.Limits.MaxIDs)
		if err != nil {
			return nil, 0, BadRequest("%v", err)
		}
		b.Where(spec.Alias+".id = ANY(%s)", ids)
		byID = true
	}
	for name, value := range req.Filters {
		if name == "id" {
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
	// The count rides back on the rows, so an empty page carries none -- which
	// for a page past the end would report a filter that matches thousands as
	// matching nothing. Only then is it worth a second statement.
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
		// Rank by the strongest label that matched: a main title outranks an
		// alias, which outranks an indirect hit.
		expr = fmt.Sprintf(`(SELECT MAX(sc.prio) FROM search_cache sc
		          WHERE sc.entity_type = '%s' AND sc.id = %s.id)`,
			spec.SearchEntity, spec.Alias)
	}

	direction := " ASC"
	if req.Reverse {
		direction = " DESC"
	}
	// id breaks ties so paging stays stable between requests.
	return expr + direction + " NULLS LAST, " + spec.Alias + ".id" + direction, nil
}

// SearchFilter builds the search condition for one entity type. The input runs
// through the same normaliser that built the index, so punctuation, case and
// width differences all fall away.
func SearchFilter(entity, alias string) FilterFunc {
	condition := fmt.Sprintf(`EXISTS (
		SELECT 1 FROM search_cache sc
		 WHERE sc.entity_type = '%s' AND sc.id = %s.id
		   AND sc.label LIKE '%%%%' || search_norm_term(%%s) || '%%%%')`, entity, alias)
	return func(b *Builder, value string) error {
		if strings.TrimSpace(value) == "" {
			return BadRequest("search needs a term")
		}
		b.Where(condition, value)
		return nil
	}
}
