package query

import (
	"strings"
	"testing"
)

func TestExtLinkFilter(t *testing.T) {
	f := ExtLinkFilter("vn_extlinks", "vn.id")

	b := &Builder{}
	if err := f(b, "steam,wikidata"); err != nil {
		t.Fatal(err)
	}
	if len(b.Conds) != 1 || !strings.Contains(b.Conds[0], " OR ") || len(b.Args) != 2 {
		t.Errorf("a list should be one condition of alternatives: %v %v", b.Conds, b.Args)
	}

	// An unknown site is refused rather than matching nothing.
	if err := f(&Builder{}, "nosuchsite"); err == nil || !IsClientError(err) {
		t.Errorf("unknown site: got %v", err)
	}
	// It matches rather than compares.
	if err := f(&Builder{}, ">=steam"); err == nil {
		t.Error("an operator should be refused")
	}
}
