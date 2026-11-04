package vn

import (
	"context"
	"slices"
	"testing"

	"github.com/kobayashi/neovndb/internal/api/query"
	"github.com/kobayashi/neovndb/internal/db/gen"
)

type withholding map[int32]bool

func (w withholding) Withheld(_ context.Context, _ string, ids []int32) (map[int32]bool, error) {
	out := map[int32]bool{}
	for _, id := range ids {
		if w[id] {
			out[id] = true
		}
	}
	return out, nil
}

// Masked, a graph loses its withheld titles and what only they joined to the
// root, and each depth is the shortest way left: 4 sat past 3 at depth 3, and
// is now reached through 5 at depth 2.
func TestGraphUnmasked(t *testing.T) {
	rows := []gen.VNRelationGraphRow{
		{ID: 1, Vid: 2, Depth: 0}, {ID: 2, Vid: 3, Depth: 1}, {ID: 3, Vid: 4, Depth: 2},
		{ID: 3, Vid: 6, Depth: 2}, // 6 hangs off 3 alone
		{ID: 1, Vid: 5, Depth: 0}, {ID: 5, Vid: 4, Depth: 1},
	}
	ctx := query.WithMask(context.Background(), withholding{3: true})
	got, err := unmasked(ctx, 1, rows)
	if err != nil {
		t.Fatal(err)
	}
	want := []gen.VNRelationGraphRow{
		{ID: 1, Vid: 2, Depth: 0}, {ID: 1, Vid: 5, Depth: 0}, {ID: 5, Vid: 4, Depth: 1},
	}
	if !slices.Equal(got, want) {
		t.Errorf("got  %v\nwant %v", got, want)
	}

	if _, err := unmasked(query.WithMask(context.Background(), withholding{1: true}), 1, rows); !query.IsClientError(err) {
		t.Errorf("a withheld root: %v, want it refused", err)
	}
	if same, _ := unmasked(context.Background(), 1, rows); !slices.Equal(same, rows) {
		t.Error("unmasked, the rows changed")
	}
}
