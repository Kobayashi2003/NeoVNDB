package query

import (
	"context"
	"fmt"
	"sort"

	"github.com/kobayashi/neovndb/internal/vndb"
)

// A Table declares a type's fields and how each is produced, so the registry
// that validates requests is derived from it and cannot drift. Row reads a
// field off the entity's own row; Source loads it for a whole page, running
// once however many of its fields were asked for.

// Source fills its fields for a whole page in one query, which keeps the query
// count independent of the number of rows.
type Source[R, T any] func(ctx context.Context, r R, page []T, sel Selection,
	byID map[int32]map[string]any) error

// Nested is one entity type seen from another, without the other knowing its
// row type. A resolver implements it.
type Nested interface {
	Registry() Registry
	Type() string
	Objects(ctx context.Context, ids []int32, sel Selection) (map[int32]map[string]any, error)
	// Filters serves nested conditions: release=(lang=en) from a vn query.
	Filters() map[string]FilterFunc
}

// Where a value comes from
//
// Every field in every type package carries one of these tags, so a reader can
// tell what a field's relationship to the mirrored database actually is
// without following the code. The mirror keeps vndb's own table and column
// names, so a tag plus a column name is enough to check a field against the
// dump's schema.
//
//	COL    A column on this entity's own row, passed through. The note gives
//	       the column when the API renamed it (vn.c_length -> length_minutes).
//	CONV   One column on the row, re-expressed: a unit, an encoding, a split,
//	       or a spelling of "absent" turned into null. Same fact, other shape.
//	CALC   Several columns on the row, combined into one value.
//	DERIV  A column on the row that the dump does NOT ship. The import computes
//	       it from other tables (internal/db/derive/*.sql), so it reads here
//	       like a plain column but is really a cross-table aggregate. These are
//	       the ones to distrust when a number looks wrong.
//	JOIN1  One row of another table, matched on a key held by this row.
//	LIST   Many rows of another table, gathered into a fragment.
//	REL    Another entity. The target type's whole field surface is reachable
//	       through it, and Edge names what the relation table carries of its
//	       own.
//	MADE   Not stored anywhere. Built from an id or rendered through a lookup
//	       table -- checking it against the database means checking the recipe.
//
// vndb's own cached columns (c_votecount, c_rating, images.c_sexual_avg) are
// COL, not DERIV: they arrive in the dump already computed, and this codebase
// only reads them. DERIV is reserved for the five columns this import fills
// itself.

type Field[T any] struct {
	Kind FieldKind
	// Row and Source are mutually exclusive.
	Row    func(T) any
	Source string
	// Subfields of a self-contained fragment; empty when Target supplies them.
	Subfields []string
	// Edge names the attributes the relation row carries itself.
	Edge   []string
	Target string
	// Num estimates how many one parent carries, for pricing a request.
	Num int
}

type Table[R, T any] struct {
	IDType string
	ID     func(T) int32
	// Fetch reads rows by id; a type without one cannot be nested.
	Fetch func(ctx context.Context, r R, ids []int32) ([]T, error)

	Fields  map[string]Field[T]
	Sources map[string]Source[R, T]

	reg Registry
}

// NewTable validates the table and caches its registry. Tables are package
// values, so a mistake panics at startup.
func NewTable[R, T any](t Table[R, T]) *Table[R, T] {
	if t.ID == nil || t.IDType == "" {
		panic("field table: ID and IDType are required")
	}
	reg := make(Registry, len(t.Fields))
	for name, f := range t.Fields {
		switch {
		case (f.Row == nil) == (f.Source == ""):
			panic(fmt.Sprintf("field %q: set exactly one of Row or Source", name))
		case f.Kind == Fragment && f.Source == "":
			panic(fmt.Sprintf("field %q: a fragment needs a Source", name))
		case f.Kind == Column && (f.Target != "" || len(f.Edge) > 0):
			panic(fmt.Sprintf("field %q: Edge and Target belong to fragments", name))
		case f.Target != "" && len(f.Subfields) > 0:
			panic(fmt.Sprintf("field %q: Target supplies the subfields, do not also list them", name))
		}
		if f.Source != "" {
			if _, ok := t.Sources[f.Source]; !ok {
				panic(fmt.Sprintf("field %q names unknown source %q", name, f.Source))
			}
		}
		reg[name] = FieldDef{Kind: f.Kind, Subfields: f.Subfields,
			Edge: f.Edge, Target: f.Target, Num: f.Num}
	}
	t.reg = reg
	return &t
}

func (t *Table[R, T]) Registry() Registry { return t.reg }

func (t *Table[R, T]) Type() string { return t.IDType }

// Objects renders rows for another type's relation, keyed by id: one query for
// the whole level rather than one per parent.
func (t *Table[R, T]) Objects(ctx context.Context, r R, ids []int32, sel Selection) (map[int32]map[string]any, error) {
	if t.Fetch == nil {
		return nil, fmt.Errorf("%s cannot be nested: no Fetch", t.IDType)
	}
	rows, err := t.Fetch(ctx, r, ids)
	if err != nil {
		return nil, err
	}
	objs, err := t.Apply(ctx, r, rows, sel)
	if err != nil {
		return nil, err
	}
	out := make(map[int32]map[string]any, len(rows))
	for i, row := range rows {
		out[t.ID(row)] = objs[i]
	}
	return out, nil
}

// Apply turns a page of rows into objects. A column waiting on a Source starts
// null so a requested field is always present; fragments are left to their
// source, which knows whether empty means a list or a null.
func (t *Table[R, T]) Apply(ctx context.Context, r R, page []T, sel Selection) ([]map[string]any, error) {
	if sel.All {
		sel = t.allColumns(sel)
	}
	out := make([]map[string]any, len(page))
	byID := make(map[int32]map[string]any, len(page))

	for i, row := range page {
		id := t.ID(row)
		// CONV: the mirror stores 17, the API answers v17.
		obj := map[string]any{"id": vndb.FormatID(t.IDType, id)}
		for _, name := range sel.Columns {
			if f := t.Fields[name]; f.Row != nil {
				obj[name] = f.Row(row)
			} else {
				obj[name] = nil
			}
		}
		out[i], byID[id] = obj, obj
	}
	if len(page) == 0 {
		return out, nil
	}

	for _, name := range t.sourcesFor(sel) {
		if err := t.Sources[name](ctx, r, page, sel, byID); err != nil {
			return nil, fmt.Errorf("load %s: %w", name, err)
		}
	}
	return out, nil
}

// allColumns expands a fragment named on its own to every column.
func (t *Table[R, T]) allColumns(sel Selection) Selection {
	out := newSelection()
	for name, def := range t.reg {
		if def.Kind == Column {
			out.Columns = append(out.Columns, name)
		}
	}
	sort.Strings(out.Columns)
	for name, sub := range sel.Fragments {
		out.Fragments[name] = sub
	}
	return out
}

// sourcesFor lists the needed sources once each, sorted so queries are
// reproducible.
func (t *Table[R, T]) sourcesFor(sel Selection) []string {
	wanted := map[string]bool{}
	for _, name := range sel.Columns {
		if s := t.Fields[name].Source; s != "" {
			wanted[s] = true
		}
	}
	for name := range sel.Fragments {
		if s := t.Fields[name].Source; s != "" {
			wanted[s] = true
		}
	}

	names := make([]string, 0, len(wanted))
	for name := range wanted {
		names = append(names, name)
	}
	sort.Strings(names)
	return names
}

// An Edge is one relation row: parent, target, and the row's own attributes.
type Edge struct {
	Parent int32
	Child  int32
	Attrs  map[string]any
}

// Sub is the selection inside a fragment. It goes through the catalog because a
// source naming its own package-level table would be an initialization cycle.
func Sub(cat *Catalog, self, fragment string, sel Selection) Selection {
	return sel.Sub(fragment, cat.Get(self).Registry()[fragment].children(cat))
}

// Relate builds a fragment from edges: the target renders every id once, then
// each edge's attributes are merged over its copy. Target and edge attributes
// come from the declaration, so a source cannot disagree with it.
func Relate(ctx context.Context, cat *Catalog, self, field string,
	edges []Edge, sel Selection, byID map[int32]map[string]any) error {

	def := cat.Get(self).Registry()[field]
	sel = Sub(cat, self, field, sel)

	// Edge attributes are not the target's fields.
	pass := newSelection()
	pass.All = sel.All
	pass.Columns = make([]string, 0, len(sel.Columns))
	for _, name := range sel.Columns {
		if !contains(def.Edge, name) {
			pass.Columns = append(pass.Columns, name)
		}
	}
	for name, sub := range sel.Fragments {
		pass.Fragments[name] = sub
	}

	seen := map[int32]bool{}
	ids := make([]int32, 0, len(edges))
	for _, e := range edges {
		if !seen[e.Child] {
			seen[e.Child] = true
			ids = append(ids, e.Child)
		}
	}

	target := cat.Get(def.Target)
	objs := make(map[int32]map[string]any, len(ids))
	switch {
	case len(ids) == 0:
	case pass.All || len(pass.Columns) > 0 || len(pass.Fragments) > 0:
		var err error
		if objs, err = target.Objects(ctx, ids, pass); err != nil {
			return err
		}
	default:
		// Only edge attributes were asked for: the id is on the relation row,
		// so the target is not read at all.
		for _, id := range ids {
			objs[id] = map[string]any{"id": vndb.FormatID(target.Type(), id)}
		}
	}

	grouped := map[int32][]map[string]any{}
	for _, e := range edges {
		obj := make(map[string]any, len(objs[e.Child])+len(e.Attrs))
		for k, v := range objs[e.Child] {
			obj[k] = v
		}
		// Edge attributes win: they describe the pairing.
		for k, v := range e.Attrs {
			if sel.All || contains(sel.Columns, k) {
				obj[k] = v
			}
		}
		grouped[e.Parent] = append(grouped[e.Parent], obj)
	}
	for id, obj := range byID {
		obj[field] = OrEmpty(grouped[id])
	}
	return nil
}
