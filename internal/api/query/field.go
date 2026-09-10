package query

import (
	"context"
	"fmt"
	"sort"

	"github.com/kobayashi/neovndb/internal/vndb"
)

// A Table is one entity type's whole field surface and, for each field, how it
// is produced. Declaring both in one place means a field cannot be offered
// without a way to fill it: the registry that validates a request is derived
// from this table rather than maintained beside it.
//
// A field is filled one of two ways. Row reads it straight off the entity's
// own row, needing no query. Source names a page-level loader that fetches it
// for the whole page at once -- and several fields may name the same Source,
// which then runs once however many of them were asked for.
//
// The table is data, so a type declares it as a package-level value. R is the
// type's resolver, threaded to the loaders that need a database handle; T is
// its row.

// Source fills its fields for a whole page in one batched query. It receives
// the page rather than a row, which is what keeps the query count independent
// of how many rows came back.
type Source[R, T any] func(ctx context.Context, r R, page []T, sel Selection,
	byID map[int32]map[string]any) error

// Nested is one entity type seen from another: enough to validate a nested
// field and to render the objects at the end of a relation, without the
// nesting type knowing anything about its row type. A resolver implements it.
type Nested interface {
	Registry() Registry
	Objects(ctx context.Context, ids []int32, sel Selection) (map[int32]map[string]any, error)
}

type Field[T any] struct {
	// Kind is Column unless the field is a fragment.
	Kind FieldKind
	// Row produces the value from the entity's own row. Mutually exclusive
	// with Source.
	Row func(T) any
	// Source names the loader in Table.Sources that fills this field.
	Source string
	// Subfields a self-contained fragment understands. Leave empty when the
	// fragment points at another type; Target supplies the surface instead.
	Subfields []string
	// Edge names the attributes this relation carries itself.
	Edge []string
	// Target is the entity type at the end of this relation. Its whole field
	// surface becomes reachable through this fragment, so a type gaining a
	// field needs no change here.
	Target string
	// Num estimates how many of these one parent carries, for pricing a
	// request before running it.
	Num int
}

type Table[R, T any] struct {
	// IDType and ID say how to address a row: the id is always returned and is
	// never one of the declared fields.
	IDType string
	ID     func(T) int32
	// Fetch reads base rows by id, which is how another type reaches this one
	// through a relation. A type with no Fetch cannot be nested.
	Fetch func(ctx context.Context, r R, ids []int32) ([]T, error)

	Fields  map[string]Field[T]
	Sources map[string]Source[R, T]

	reg Registry
}

// NewTable validates the table and caches its registry. A table is a
// compile-time constant in all but form, so a mistake in one is a programming
// error: declared as a package-level value, it fails at startup.
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

// Objects renders rows this type owns for another type's relation, keyed by
// id. It is the same work Apply does for a page, which is what makes a nested
// field cost one query for the whole level rather than one per parent row.
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

// Apply turns a page of rows into the objects a client asked for.
//
// Row fields are read first, and a field waiting on a Source is left null
// meanwhile, so a requested field is always present whether or not its source
// finds anything. Fragments are left to their source, which knows whether the
// empty answer is a list or a null.
func (t *Table[R, T]) Apply(ctx context.Context, r R, page []T, sel Selection) ([]map[string]any, error) {
	if sel.All {
		sel = t.allColumns(sel)
	}
	out := make([]map[string]any, len(page))
	byID := make(map[int32]map[string]any, len(page))

	for i, row := range page {
		id := t.ID(row)
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

// allColumns expands a selection that named this type as a whole, which is
// what a bare fragment means one level up.
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

// sourcesFor lists the sources the selection needs, each once and in a stable
// order so the queries a request runs are reproducible.
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

// An Edge is one row of a relation: which parent it hangs off, which target it
// points at, and whatever the relation itself records about the pairing.
type Edge struct {
	Parent int32
	Child  int32
	Attrs  map[string]any
}

// Sub is the selection inside one of a type's fragments, expanded against
// whatever that fragment reaches. It goes through the catalog rather than the
// type's own table, so a source never has to name the table it belongs to --
// which for a package-level table would be an initialization cycle.
func Sub(cat *Catalog, self, fragment string, sel Selection) Selection {
	return sel.Sub(fragment, cat.Get(self).Registry()[fragment].children(cat))
}

// Relate assembles a fragment from a batch of edges: the target type renders
// itself once for every id the edges point at, and each edge's own attributes
// are merged over its copy. One query for the level, whatever the fan-out.
//
// Which type the edges point at and which attributes belong to the edge are
// read back from the declaration, so a source cannot disagree with it.
func Relate(ctx context.Context, cat *Catalog, self, field string,
	edges []Edge, sel Selection, byID map[int32]map[string]any) error {

	def := cat.Get(self).Registry()[field]
	sel = Sub(cat, self, field, sel)

	// The target knows nothing about the edge's attributes, so they are held
	// back from the selection handed to it.
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

	objs := map[int32]map[string]any{}
	if len(ids) > 0 {
		var err error
		if objs, err = cat.Get(def.Target).Objects(ctx, ids, pass); err != nil {
			return err
		}
	}

	grouped := map[int32][]map[string]any{}
	for _, e := range edges {
		obj := make(map[string]any, len(objs[e.Child])+len(e.Attrs))
		for k, v := range objs[e.Child] {
			obj[k] = v
		}
		// Edge attributes win: they describe this pairing, not the entity.
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
