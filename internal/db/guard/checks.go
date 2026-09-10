package guard

import (
	"fmt"
	"sort"
)

// Shrunk reports a table that lost more than MaxLoss of its rows. vndb only
// grows: entries are hidden rather than deleted, and hidden entries never
// reach the dump in the first place. A table that shrinks by any real amount
// means a truncated archive or an import that stopped partway.
type Shrunk struct{ MaxLoss float64 }

func (Shrunk) Name() string { return "shrunk" }

func (c Shrunk) Inspect(live, next Snapshot) []Finding {
	var found []Finding
	for _, table := range sorted(live.Tables) {
		before := live.Tables[table]
		after, ok := next.Tables[table]
		if !ok || before == 0 {
			continue // Missing covers the first; nothing to lose in the second.
		}
		lost := float64(before-after) / float64(before)
		if lost <= c.MaxLoss {
			continue
		}
		detail := fmt.Sprintf("%d rows down to %d, %.1f%% lost", before, after, lost*100)
		if after == 0 {
			detail = fmt.Sprintf("%d rows down to none", before)
		}
		found = append(found, Finding{Check: c.Name(), Table: table, Detail: detail})
	}
	return found
}

// Missing reports a table the live generation has that the new one never
// mentions, which is what an import that stopped early looks like.
type Missing struct{}

func (Missing) Name() string { return "missing" }

func (c Missing) Inspect(live, next Snapshot) []Finding {
	var found []Finding
	for _, table := range sorted(live.Tables) {
		if _, ok := next.Tables[table]; !ok {
			found = append(found, Finding{Check: c.Name(), Table: table,
				Detail: "not imported"})
		}
	}
	return found
}

// Required reports a table that must never be empty. The derive step is what
// this is for: a query whose joins match nothing writes no rows and returns no
// error, so an empty search index or an empty tag score table is the only
// evidence that it ran on the wrong shape of data.
type Required struct{ Tables []string }

func (Required) Name() string { return "required" }

func (c Required) Inspect(_, next Snapshot) []Finding {
	var found []Finding
	for _, table := range c.Tables {
		n, ok := next.Tables[table]
		switch {
		case !ok:
			found = append(found, Finding{Check: c.Name(), Table: table,
				Detail: "not built"})
		case n == 0:
			found = append(found, Finding{Check: c.Name(), Table: table,
				Detail: "built but empty"})
		}
	}
	return found
}

func sorted(m map[string]int64) []string {
	names := make([]string, 0, len(m))
	for name := range m {
		names = append(names, name)
	}
	sort.Strings(names)
	return names
}
