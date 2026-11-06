package query

import (
	"context"
	"strings"
	"testing"

	"github.com/kobayashi/neovndb/internal/vndb"
)

// withholding stands in for the withheld table, and notes what it was asked.
type withholding struct {
	gone  map[string]map[int32]bool
	asked []string
}

func (w *withholding) Withheld(_ context.Context, letter string, ids []int32) (map[int32]bool, error) {
	w.asked = append(w.asked, letter)
	out := map[int32]bool{}
	for _, id := range ids {
		if w.gone[letter][id] {
			out[id] = true
		}
	}
	return out, nil
}

func TestMaskedRequestLeavesWithheldOut(t *testing.T) {
	for name, c := range map[string]struct {
		entity string
		masked bool
		want   string
	}{
		"a masked work":          {vndb.TypeVN, true, "w.entity_type = 'v' AND w.id = x.id"},
		"a masked character":     {vndb.TypeCharacter, true, "w.entity_type = 'c' AND w.id = x.id"},
		"an unmasked work":       {vndb.TypeVN, false, ""},
		"a producer, never gone": {vndb.TypeProducer, true, ""},
	} {
		req, err := parse("", lim)
		if err != nil {
			t.Fatal(err)
		}
		req.Masked = c.masked
		where, _, err := Matching(PageSpec{Table: "t x", Alias: "x", IDType: c.entity}, req)
		if err != nil {
			t.Fatal(err)
		}
		if got := strings.Contains(where, "withheld"); got != (c.want != "") ||
			c.want != "" && !strings.Contains(where, c.want) {
			t.Errorf("%s: %s", name, where)
		}
	}
}

// A relation loses what the mask withholds of its target, edges and all,
// asking the table about the target's type.
func TestRelateDropsWithheld(t *testing.T) {
	cat, _ := setup()
	sel, err := ParseFields(cat, testTable.Registry(), lim.MaxFieldDepth, "tags.name,tags.rating")
	if err != nil {
		t.Fatal(err)
	}
	mask := &withholding{gone: map[string]map[int32]bool{"g": {3: true}}}
	ctx := WithMask(context.Background(), mask)
	byID := map[int32]map[string]any{17: {}}
	edges := []Edge{
		{Parent: 17, Child: 2, Attrs: map[string]any{"rating": 2.5}},
		{Parent: 17, Child: 3, Attrs: map[string]any{"rating": 1.0}},
	}
	if err := Relate(ctx, cat, "vn", "tags", edges, sel, byID); err != nil {
		t.Fatal(err)
	}
	got := byID[17]["tags"].([]map[string]any)
	if len(got) != 1 || got[0]["id"] != "g2" {
		t.Errorf("tags %v, want only 2", got)
	}
	if len(mask.asked) != 1 || mask.asked[0] != "g" {
		t.Errorf("asked about %v, want tags (g)", mask.asked)
	}
	// The caller's edges are left as they were.
	if len(edges) != 2 {
		t.Errorf("edges changed under the caller: %v", edges)
	}
}

func TestImageShown(t *testing.T) {
	if !ImageShown(context.Background(), 0, 200, 200) {
		t.Error("unmasked, every image shows")
	}
	ctx := WithMask(context.Background(), &withholding{})
	for name, c := range map[string]struct {
		votes, sexual, violence int16
		want                    bool
	}{
		"safe and tame":   {5, 50, 50, true},
		"suggestive":      {5, 51, 0, false},
		"violent":         {5, 0, 51, false},
		"nobody voted on": {0, 0, 0, false},
	} {
		if got := ImageShown(ctx, c.votes, c.sexual, c.violence); got != c.want {
			t.Errorf("%s: %v, want %v", name, got, c.want)
		}
	}
}
