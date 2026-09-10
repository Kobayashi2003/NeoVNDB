package guard

import (
	"strings"
	"testing"
)

func snap(code string, tables map[string]int64) Snapshot {
	return Snapshot{Code: code, Tables: tables}
}

// A normal week: everything grows a little, some tables not at all.
func TestClearOnNormalGrowth(t *testing.T) {
	g := Default(0.02, []string{"search_cache"})
	found := g.Inspect(
		snap("a", map[string]int64{"vn": 65654, "tags": 3014, "search_cache": 1038266}),
		snap("b", map[string]int64{"vn": 66215, "tags": 3014, "search_cache": 1047000}),
	)
	if len(found) != 0 {
		t.Errorf("expected no findings, got %v", found)
	}
}

func TestShrunkCatchesLoss(t *testing.T) {
	c := Shrunk{MaxLoss: 0.02}
	// A one percent loss is under the threshold.
	if found := c.Inspect(snap("a", map[string]int64{"vn": 1000}),
		snap("b", map[string]int64{"vn": 991})); len(found) != 0 {
		t.Errorf("1%% loss should pass, got %v", found)
	}
	// Five percent is not.
	found := c.Inspect(snap("a", map[string]int64{"vn": 1000}),
		snap("b", map[string]int64{"vn": 950}))
	if len(found) != 1 {
		t.Fatalf("5%% loss should be reported, got %v", found)
	}
	if !strings.Contains(found[0].Detail, "5.0% lost") {
		t.Errorf("detail = %q", found[0].Detail)
	}
	// A table emptied entirely says so plainly rather than as a percentage.
	found = c.Inspect(snap("a", map[string]int64{"vn": 1000}),
		snap("b", map[string]int64{"vn": 0}))
	if len(found) != 1 || !strings.Contains(found[0].Detail, "down to none") {
		t.Errorf("emptied table: %v", found)
	}
	// A table that was empty before cannot lose anything.
	if found := c.Inspect(snap("a", map[string]int64{"vn": 0}),
		snap("b", map[string]int64{"vn": 0})); len(found) != 0 {
		t.Errorf("empty to empty should pass, got %v", found)
	}
}

func TestMissingCatchesAnImportThatStoppedEarly(t *testing.T) {
	found := Missing{}.Inspect(
		snap("a", map[string]int64{"vn": 10, "chars": 20}),
		snap("b", map[string]int64{"vn": 10}),
	)
	if len(found) != 1 || found[0].Table != "chars" {
		t.Errorf("got %v, want chars reported missing", found)
	}
}

// The derive step is the failure this exists for: its queries write no rows
// and return no error when they match nothing.
func TestRequiredCatchesASilentDeriveStep(t *testing.T) {
	c := Required{Tables: []string{"search_cache", "tags_closure"}}
	found := c.Inspect(Snapshot{}, snap("b", map[string]int64{
		"search_cache": 0, "tags_closure": 100,
	}))
	if len(found) != 1 || found[0].Table != "search_cache" {
		t.Fatalf("got %v, want search_cache reported empty", found)
	}
	if !strings.Contains(found[0].Detail, "empty") {
		t.Errorf("detail = %q", found[0].Detail)
	}

	found = c.Inspect(Snapshot{}, snap("b", map[string]int64{"tags_closure": 100}))
	if len(found) != 1 || !strings.Contains(found[0].Detail, "not built") {
		t.Errorf("a table the derive step never made: %v", found)
	}
}

// A truncated archive is the case all of this is for: every table short.
func TestTruncatedArchiveIsCaught(t *testing.T) {
	g := Default(0.02, []string{"search_cache"})
	found := g.Inspect(
		snap("a", map[string]int64{"vn": 65654, "chars": 168875, "search_cache": 1038266}),
		snap("b", map[string]int64{"vn": 41000, "chars": 90000, "search_cache": 0}),
	)
	// Four, not three: an emptied search_cache trips Shrunk and Required
	// both. The checks are independent on purpose, so overlap is expected.
	if len(found) != 4 {
		t.Errorf("expected four findings, got %v", found)
	}
	seen := map[string]bool{}
	for _, f := range found {
		seen[f.Table] = true
	}
	for _, table := range []string{"vn", "chars", "search_cache"} {
		if !seen[table] {
			t.Errorf("%s was not reported", table)
		}
	}
}
