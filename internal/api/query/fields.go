package query

import (
	"sort"
	"strings"
)

// Parsing and validating a `fields` parameter. Anything not named is not
// fetched, which is what keeps a list query from paying for a detail page's
// worth of joins. The surface it validates against is derived from a Table;
// see field.go for how a field is declared.

type FieldKind int

const (
	// Column is read from the entity's own row.
	Column FieldKind = iota
	// Fragment is a related collection with its own loader.
	Fragment
)

type FieldDef struct {
	Kind FieldKind
	// Subfields a self-contained fragment understands, for one that carries
	// values rather than pointing at another entity.
	Subfields []string
	// Edge names the attributes the relation itself carries, which exist only
	// in the context of this one edge: a tag's rating on this VN, a staff
	// member's role on this credit.
	Edge []string
	// Target names the entity type this fragment points at. It is a name
	// rather than a reference because the type graph has cycles -- a VN
	// reaches characters, which reach VNs -- so it is resolved through the
	// catalog per request rather than at wiring time.
	Target string
	// Num estimates how many of these a parent carries, used to price a
	// request before running it. Zero means one.
	Num int
}

// Registry is the whole field surface of one entity type.
type Registry map[string]FieldDef

// children is what a subfield of this field is validated against: the edge
// attributes plus, when the fragment points at an entity, that entity's own
// fields.
func (d FieldDef) children(cat *Catalog) Registry {
	reg := make(Registry, len(d.Subfields)+len(d.Edge))
	for _, name := range d.Subfields {
		reg[name] = FieldDef{}
	}
	if d.Target != "" {
		for name, def := range cat.Get(d.Target).Registry() {
			reg[name] = def
		}
	}
	// Edge attributes win: they are about this relation, not about the entity
	// at the end of it.
	for _, name := range d.Edge {
		reg[name] = FieldDef{}
	}
	return reg
}

// Selection is a parsed and validated `fields` parameter. It nests, because
// fields do.
type Selection struct {
	// All is a fragment named on its own, which means every column the target
	// carries. It stops at columns: a nested fragment is never pulled in
	// implicitly, both because it costs a query and because the type graph has
	// cycles that would not terminate.
	All       bool
	Columns   []string
	Fragments map[string]Selection
}

func newSelection() Selection {
	return Selection{Fragments: map[string]Selection{}}
}

func (s Selection) Has(name string) bool {
	if _, ok := s.Fragments[name]; ok {
		return true
	}
	return contains(s.Columns, name)
}

// Wants reports whether a subfield of a fragment was requested.
func (s Selection) Wants(fragment, sub string) bool {
	sel, ok := s.Fragments[fragment]
	if !ok {
		return false
	}
	return sel.All || sel.Has(sub)
}

// Sub returns the selection inside a fragment. A fragment named on its own
// carries every column its target declares, and any nested fragment named
// explicitly is kept alongside those.
func (s Selection) Sub(fragment string, reg Registry) Selection {
	sel := s.Fragments[fragment]
	if !sel.All {
		return sel
	}
	out := newSelection()
	for name, def := range reg {
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

// ParseFields validates a comma-separated list against a registry. The id is
// always returned and never has to be named, so an empty parameter is legal
// and yields ids alone.
func ParseFields(cat *Catalog, reg Registry, maxDepth int, value string) (Selection, error) {
	sel := newSelection()
	for _, raw := range strings.Split(value, ",") {
		name := strings.TrimSpace(raw)
		if name == "" || name == "id" {
			continue
		}
		parts := strings.Split(name, ".")
		if maxDepth > 0 && len(parts) > maxDepth {
			return sel, BadRequest("field %q is nested more than %d deep", name, maxDepth)
		}
		if err := add(cat, &sel, reg, parts, name); err != nil {
			return sel, err
		}
	}
	return sel, nil
}

// add walks one dotted path into the selection, creating the levels it passes
// through and validating each against that level's registry.
func add(cat *Catalog, sel *Selection, reg Registry, parts []string, full string) error {
	// The id comes back at every level whether or not it was named, so naming
	// it is allowed and means nothing.
	if len(parts) == 1 && parts[0] == "id" {
		return nil
	}
	def, ok := reg[parts[0]]
	if !ok {
		return BadRequest("unknown field %q in %q", parts[0], full)
	}

	if len(parts) == 1 {
		if def.Kind == Column {
			if !contains(sel.Columns, parts[0]) {
				sel.Columns = append(sel.Columns, parts[0])
			}
			return nil
		}
		// A fragment named on its own means every column its target has.
		// Nested fragments are never implied -- each costs a query, and the
		// type graph has cycles that would not terminate.
		sub := sel.Fragments[parts[0]]
		sub.All = true
		if sub.Fragments == nil {
			sub.Fragments = map[string]Selection{}
		}
		sel.Fragments[parts[0]] = sub
		return nil
	}

	if def.Kind != Fragment {
		return BadRequest("field %q has no subfields", parts[0])
	}
	sub, seen := sel.Fragments[parts[0]]
	if !seen {
		sub = newSelection()
	}
	if err := add(cat, &sub, def.children(cat), parts[1:], full); err != nil {
		return err
	}
	sel.Fragments[parts[0]] = sub
	return nil
}

// Cost estimates how many field values a response will carry, following
// vndb's own approach: multiply a level's field count by how many rows that
// level is expected to hold, and sum the nested levels in. It prices a request
// from declared fan-out rather than from measurement, so it can refuse one
// before running any of it.
func Cost(cat *Catalog, reg Registry, sel Selection, rows int) int {
	if rows <= 0 {
		rows = 1
	}
	n := 1 // the id is always returned
	if sel.All {
		for _, def := range reg {
			if def.Kind == Column {
				n++
			}
		}
	} else {
		n += len(sel.Columns)
	}
	for name, sub := range sel.Fragments {
		def := reg[name]
		n += Cost(cat, def.children(cat), sub, def.Num)
	}
	return n * rows
}

// Names lists the field names a type accepts. It stops at one level: below
// that the surface belongs to another type, and the graph has cycles.
func (r Registry) Names() []string {
	names := make([]string, 0, len(r))
	for name := range r {
		names = append(names, name)
	}
	sort.Strings(names)
	return names
}

func contains(list []string, want string) bool {
	for _, v := range list {
		if v == want {
			return true
		}
	}
	return false
}
