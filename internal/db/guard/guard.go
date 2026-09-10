// Package guard decides whether a freshly imported generation is fit to go
// live. An import can succeed mechanically and still be wrong: a truncated
// archive parses, and a derive step that matches nothing writes no rows and
// reports no error. A mirror of a dump has no invariant of its own to violate;
// what it has is a predecessor.
//
// Checks are an interface because what counts as suspect depends on the data.
package guard

import "fmt"

// Snapshot is one generation as a check sees it. Counts come from what the
// import recorded, so they are exact and cost nothing to read.
type Snapshot struct {
	Code   string
	Tables map[string]int64
}

// A Finding is one reason not to promote.
type Finding struct {
	Check  string
	Table  string
	Detail string
}

func (f Finding) String() string {
	if f.Table == "" {
		return fmt.Sprintf("%s: %s", f.Check, f.Detail)
	}
	return fmt.Sprintf("%s: %s: %s", f.Check, f.Table, f.Detail)
}

type Check interface {
	Name() string
	Inspect(live, next Snapshot) []Finding
}

// A Guard is the set of checks a promote has to pass.
type Guard []Check

func (g Guard) Inspect(live, next Snapshot) []Finding {
	var found []Finding
	for _, c := range g {
		found = append(found, c.Inspect(live, next)...)
	}
	return found
}

// Names lists the checks, for reporting which ones ran.
func (g Guard) Names() []string {
	names := make([]string, len(g))
	for i, c := range g {
		names[i] = c.Name()
	}
	return names
}

// Default is what a plain deployment runs. Derived names the tables the derive
// step builds: they are the ones that can come back empty without anything
// having reported an error.
func Default(maxLoss float64, derived []string) Guard {
	return Guard{
		Shrunk{MaxLoss: maxLoss},
		Missing{},
		Required{Tables: derived},
	}
}
