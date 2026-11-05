package release

import (
	"strings"
	"testing"

	"github.com/kobayashi/neovndb/internal/api/query"
)

func TestResolutionFilter(t *testing.T) {
	cases := []struct {
		in, want string
	}{
		{"1920x1080", "(r.reso_x = $1::bigint AND r.reso_y = $2::bigint)"},
		{">=1280x720", "(r.reso_x >= $1::bigint AND r.reso_y >= $2::bigint)"},
		// Unknown (0x0) must not count as "at most" anything.
		{"<=800x600", "(r.reso_x > 0 AND r.reso_x <= $1::bigint AND r.reso_y <= $2::bigint)"},
	}
	for _, c := range cases {
		b := &query.Builder{}
		if err := resolutionFilter(b, c.in); err != nil {
			t.Fatalf("%q: %v", c.in, err)
		}
		if got := b.SQL(); got != c.want {
			t.Errorf("%q: got %s, want %s", c.in, got, c.want)
		}
	}
	for _, bad := range []string{"1920", "x1080", "0x0", "wide", ">1920x1080"} {
		if err := resolutionFilter(&query.Builder{}, bad); err == nil {
			t.Errorf("%q: want an error", bad)
		}
	}
	// A list is any of.
	b := &query.Builder{}
	if err := resolutionFilter(b, "1920x1080,1280x720"); err != nil || !strings.Contains(b.SQL(), " OR ") {
		t.Errorf("list: %v %s", err, b.SQL())
	}
}
