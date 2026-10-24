package vn

import (
	"context"
	"testing"

	"github.com/kobayashi/neovndb/internal/api/query"
	"github.com/kobayashi/neovndb/internal/db/gen"
)

// 1 → 2 → 4 → 5, and 1 → 3: rows as the walk returns them, one layer past
// whatever depth is asked for.
var chain = []gen.VNRelationGraphRow{
	{ID: 1, Vid: 2, Relation: "seq", Depth: 0},
	{ID: 1, Vid: 3, Relation: "fan", Depth: 0},
	{ID: 2, Vid: 4, Relation: "seq", Depth: 1},
	{ID: 4, Vid: 5, Relation: "seq", Depth: 2},
}

func TestWalkDepth(t *testing.T) {
	w := walk(1, chain, 2, 0)
	if len(w.kept) != 3 || len(w.included) != 4 || !w.truncated || w.capped {
		t.Errorf("depth 2: %d edges, %d titles, truncated %v, capped %v",
			len(w.kept), len(w.included), w.truncated, w.capped)
	}
	if w.depthOf[4] != 2 {
		t.Errorf("v4 sits at %d, want 2", w.depthOf[4])
	}

	w = walk(1, chain, 3, 0)
	if len(w.kept) != 4 || w.truncated {
		t.Errorf("depth 3 holds all of it: %d edges, truncated %v", len(w.kept), w.truncated)
	}
}

func TestWalkNodeCeiling(t *testing.T) {
	w := walk(1, chain, 3, 3)
	if len(w.included) != 3 || !w.capped || !w.truncated {
		t.Errorf("ceiling of 3: %d titles, capped %v, truncated %v", len(w.included), w.capped, w.truncated)
	}
	// An edge between titles already in is kept: the ceiling counts titles.
	loop := append(chain[:2:2], gen.VNRelationGraphRow{ID: 2, Vid: 3, Relation: "set", Depth: 1})
	if w := walk(1, loop, 3, 3); len(w.kept) != 3 || w.capped {
		t.Errorf("edge inside the ceiling: %d edges, capped %v", len(w.kept), w.capped)
	}
}

func TestDeepestUseful(t *testing.T) {
	// chain's relations, stored both ways as vn_relations stores them.
	near := map[int32][]int32{1: {2, 3}, 2: {1, 4}, 3: {1}, 4: {2, 5}, 5: {4}}
	next := func(ids []int32) ([]int32, error) {
		var out []int32
		for _, id := range ids {
			out = append(out, near[id]...)
		}
		return out, nil
	}
	for _, c := range []struct {
		name string
		root int32
		opt  GraphOpts
		want int
	}{
		{"where the component ends", 1, GraphOpts{}, 3},
		{"from the middle of it", 2, GraphOpts{}, 2},
		{"at the depth ceiling", 1, GraphOpts{MaxDepth: 2}, 2},
		// Within one step there are three titles, which fill a ceiling of 3.
		{"at the node ceiling", 1, GraphOpts{MaxNodes: 3}, 1},
		{"one past a step that leaves room", 1, GraphOpts{MaxNodes: 4}, 2},
		{"a title alone", 9, GraphOpts{}, 1},
	} {
		got, err := deepestUseful(c.root, c.opt, next)
		if err != nil || got != c.want {
			t.Errorf("%s: %d, %v; want %d", c.name, got, err, c.want)
		}
	}
}

func TestGraphDepthCeiling(t *testing.T) {
	// Refused before the database is asked anything, so no database is needed.
	_, err := (&Resolver{}).RelationGraph(context.Background(), "v17", GraphOpts{Depth: 9, MaxDepth: 8})
	if err == nil || !query.IsClientError(err) {
		t.Errorf("depth 9 over a ceiling of 8: %v", err)
	}
}
