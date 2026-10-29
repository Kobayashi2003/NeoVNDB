package vn

import (
	"testing"

	"github.com/kobayashi/neovndb/internal/api/query"
)

func TestParseLiked(t *testing.T) {
	got, err := ParseLiked("v17:2, v11,v4:-0.5,", 0)
	if err != nil {
		t.Fatal(err)
	}
	want := []Liked{{17, 2}, {11, 1}, {4, -0.5}}
	if len(got) != len(want) {
		t.Fatalf("%v, want %v", got, want)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Errorf("%d: %v, want %v", i, got[i], want[i])
		}
	}

	for _, bad := range []string{"", "v17:6", "v17:x", "r17", "v17,v11"} {
		max := 0
		if bad == "v17,v11" {
			max = 1
		}
		if _, err := ParseLiked(bad, max); !query.IsClientError(err) {
			t.Errorf("%q: want a client error, got %v", bad, err)
		}
	}
}
