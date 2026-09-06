package query

import (
	"sort"
	"strings"
)

// A request names the fields it wants; the registry says where each one comes
// from. Anything not named is not fetched, which is what keeps a list query
// from paying for a detail page's worth of joins.
//
// A field is either part of the entity's own row or the name of a fragment --
// a related collection loaded by its own batched query. Subfields select
// inside a fragment but never change how it is fetched, so the number of
// queries depends on which fragments were asked for, never on how many rows
// come back.

// maxDepth allows fragment.subfield and no deeper. Nothing in the data model
// needs more, and a bound keeps a request from planning arbitrary work.
const maxDepth = 2

type FieldKind int

const (
	// Column is read from the entity's own row.
	Column FieldKind = iota
	// Fragment is a related collection with its own loader.
	Fragment
)

type FieldDef struct {
	Kind FieldKind
	// Subfields a fragment understands. Empty means it has no substructure.
	Subfields []string
}

// Registry is the whole field surface of one entity type.
type Registry map[string]FieldDef

// Selection is a parsed and validated `fields` parameter.
type Selection struct {
	Columns   []string
	Fragments map[string][]string // fragment -> requested subfields, empty means all
}

func (s Selection) Has(name string) bool {
	if _, ok := s.Fragments[name]; ok {
		return true
	}
	for _, c := range s.Columns {
		if c == name {
			return true
		}
	}
	return false
}

// Wants reports whether a fragment subfield was requested. An empty subfield
// list means the caller asked for the fragment as a whole.
func (s Selection) Wants(fragment, sub string) bool {
	subs, ok := s.Fragments[fragment]
	if !ok {
		return false
	}
	if len(subs) == 0 {
		return true
	}
	for _, v := range subs {
		if v == sub {
			return true
		}
	}
	return false
}

// ParseFields validates a comma-separated list against a registry. The id is
// always returned and never has to be named, so an empty parameter is legal
// and yields ids alone.
func ParseFields(reg Registry, value string) (Selection, error) {
	sel := Selection{Fragments: map[string][]string{}}
	for _, raw := range strings.Split(value, ",") {
		name := strings.TrimSpace(raw)
		if name == "" || name == "id" {
			continue
		}
		parts := strings.Split(name, ".")
		if len(parts) > maxDepth {
			return sel, BadRequest("field %q is nested too deeply", name)
		}

		def, ok := reg[parts[0]]
		if !ok {
			return sel, BadRequest("unknown field %q", parts[0])
		}
		if len(parts) == 1 {
			if def.Kind == Column {
				sel.Columns = append(sel.Columns, parts[0])
			} else {
				// A bare fragment means all of it, and widens one that a
				// subfield already narrowed, whichever order they arrived in.
				sel.Fragments[parts[0]] = nil
			}
			continue
		}

		if def.Kind != Fragment {
			return sel, BadRequest("field %q has no subfields", parts[0])
		}
		if !contains(def.Subfields, parts[1]) {
			return sel, BadRequest("unknown subfield %q on %q", parts[1], parts[0])
		}
		// A bare fragment already means everything, so do not narrow it.
		if subs, seen := sel.Fragments[parts[0]]; !seen || len(subs) > 0 {
			sel.Fragments[parts[0]] = append(subs, parts[1])
		}
	}
	return sel, nil
}

// Names lists every field a type accepts, for error messages and /meta.
func (r Registry) Names() []string {
	names := make([]string, 0, len(r))
	for name, def := range r {
		names = append(names, name)
		for _, sub := range def.Subfields {
			names = append(names, name+"."+sub)
		}
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
