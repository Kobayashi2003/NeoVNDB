package query

import (
	"reflect"
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

// A list compiles each item into its own builder; the placeholders must still
// number straight through, or $2 would bind the wrong value.
func TestListKeepsPlaceholdersInStep(t *testing.T) {
	b := &Builder{}
	b.Where("x = %s", "first")
	if err := IntColumn("vn.c_rating", 10)(b, ">=7,<3"); err != nil {
		t.Fatal(err)
	}
	if got, want := b.SQL(), "x = $1 AND (vn.c_rating >= $2 OR vn.c_rating < $3)"; got != want {
		t.Errorf("SQL = %s, want %s", got, want)
	}
	if !reflect.DeepEqual(b.Args, []any{"first", 70, 30}) {
		t.Errorf("args = %v; the scale should apply to each", b.Args)
	}
}

func TestBoolFilter(t *testing.T) {
	f := BoolFilter("yes", "no")
	for in, want := range map[string]string{"true": "yes", "1": "yes", "FALSE": "no", "0": "no"} {
		b := &Builder{}
		if err := f(b, in); err != nil || b.SQL() != want {
			t.Errorf("%q: %v %s", in, err, b.SQL())
		}
	}
	for _, bad := range []string{"", "yes", "true,false", "!=true"} {
		if err := f(&Builder{}, bad); err == nil {
			t.Errorf("%q was accepted", bad)
		}
	}
}

func TestRelatedParts(t *testing.T) {
	tag := Related{Entity: "tag", From: "tags_vn tv", Owner: "tv.vid = vn.id", ID: "tv.tag",
		Score: "tv.score", Spoiler: "tv.spoiler"}.Filter()
	trait := Related{Entity: "trait", From: "chars_traits ct", Owner: "ct.id = c.id", ID: "ct.tid",
		Spoiler: "ct.spoil"}.Filter()
	for _, c := range []struct {
		f    FilterFunc
		in   string
		args []any
	}{
		{tag, "g749", []any{int32(749)}},
		{tag, "g749:2.0", []any{int32(749), 2.0}},
		{tag, "g749:2.0:1", []any{int32(749), 2.0, 1}},
		{trait, "i568:1", []any{int32(568), 1}}, // no score, so the number is the spoiler
	} {
		b := &Builder{}
		if err := c.f(b, c.in); err != nil {
			t.Errorf("%q: %v", c.in, err)
		} else if !reflect.DeepEqual(b.Args, c.args) {
			t.Errorf("%q: args %v, want %v", c.in, b.Args, c.args)
		}
	}
	for _, bad := range []string{"g749:high", "g749:2:3", "g749:2:1:0", "i568", "g0"} {
		if err := tag(&Builder{}, bad); err == nil {
			t.Errorf("tag=%q was accepted", bad)
		}
	}
	if err := trait(&Builder{}, "i568:1:1"); err == nil {
		t.Error("a trait took a score")
	}
}
