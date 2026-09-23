package query

import (
	"sort"
	"strings"
)

// Parsing and validating the fields parameter. Only named fields are fetched.

type FieldKind int

const (
	Column FieldKind = iota
	Fragment
)

type FieldDef struct {
	Kind FieldKind
	// Subfields of a fragment that carries values rather than another entity.
	Subfields []string
	// Edge names attributes of the relation itself: a tag's rating on this VN.
	Edge []string
	// Target is a type name, resolved per request through the catalog because
	// the type graph has cycles (vn -> character -> vn).
	Target string
	// Num estimates how many one parent carries, for pricing. Zero means one.
	Num int
}

type Registry map[string]FieldDef

// children is what a subfield is validated against: edge attributes plus the
// target's own fields.
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
	// Edge attributes win over the target's fields of the same name.
	for _, name := range d.Edge {
		reg[name] = FieldDef{}
	}
	return reg
}

type Selection struct {
	// All means a fragment named on its own: every column, but no nested
	// fragment, since each costs a query and the type graph has cycles.
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

// Sub returns the selection inside a fragment, expanding All to every column
// while keeping explicitly named nested fragments.
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

// ParseFields validates a comma-separated list. id is always returned, so an
// empty list is legal.
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

// add walks one dotted path into the selection, validating each level.
func add(cat *Catalog, sel *Selection, reg Registry, parts []string, full string) error {
	// id is implicit at every level.
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

// Cost estimates the field values a response will carry, as vndb does: each
// level's field count times its declared fan-out, summed. It prices a request
// before running any of it.
func Cost(cat *Catalog, reg Registry, sel Selection, rows int) int {
	if rows <= 0 {
		rows = 1
	}
	n := 1 // the id
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

// Names lists one level of field names; below that the surface is another
// type's.
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
