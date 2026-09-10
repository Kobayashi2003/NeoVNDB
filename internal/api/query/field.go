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

// Source fills its fields for a whole page in one batched query. It receives
// the page rather than a row, which is what keeps the query count independent
// of how many rows came back.
type Source[T any] func(ctx context.Context, page []T, sel Selection,
	byID map[int32]map[string]any) error

type Field[T any] struct {
	// Kind is Column unless the field is a fragment.
	Kind FieldKind
	// Row produces the value from the entity's own row. Mutually exclusive
	// with Source.
	Row func(T) any
	// Source names the loader in Table.Sources that fills this field.
	Source string
	// Subfields a fragment understands.
	Subfields []string
}

type Table[T any] struct {
	// IDType and ID say how to address a row: the id is always returned and is
	// never one of the declared fields.
	IDType string
	ID     func(T) int32

	Fields  map[string]Field[T]
	Sources map[string]Source[T]
}

// Registry projects the table into the whitelist a request is validated
// against, and panics if the table is inconsistent. The table is a compile-time
// constant in all but form, so a mistake here is a programming error and
// belongs at startup rather than in a request.
func (t Table[T]) Registry() Registry {
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
		}
		if f.Source != "" {
			if _, ok := t.Sources[f.Source]; !ok {
				panic(fmt.Sprintf("field %q names unknown source %q", name, f.Source))
			}
		}
		reg[name] = FieldDef{Kind: f.Kind, Subfields: f.Subfields}
	}
	return reg
}

// Apply turns a page of rows into the objects a client asked for.
//
// Row fields are read first, and a field waiting on a Source is left null
// meanwhile, so a requested field is always present whether or not its source
// finds anything. Fragments are left to their source, which knows whether the
// empty answer is a list or a null.
func (t Table[T]) Apply(ctx context.Context, page []T, sel Selection) ([]map[string]any, error) {
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
		if err := t.Sources[name](ctx, page, sel, byID); err != nil {
			return nil, fmt.Errorf("load %s: %w", name, err)
		}
	}
	return out, nil
}

// sourcesFor lists the sources the selection needs, each once and in a stable
// order so the queries a request runs are reproducible.
func (t Table[T]) sourcesFor(sel Selection) []string {
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
