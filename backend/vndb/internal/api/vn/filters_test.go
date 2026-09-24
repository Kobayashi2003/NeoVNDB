package vn

import (
	"strings"
	"testing"

	"github.com/kobayashi/neovndb/internal/api/query"
)

func TestCreditFilter(t *testing.T) {
	b := &query.Builder{}
	if err := creditFilter(b, "s224:scenario"); err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(b.SQL(), "vs.role = $2") || len(b.Args) != 2 {
		t.Errorf("with role: %s %v", b.SQL(), b.Args)
	}
	b = &query.Builder{}
	if err := creditFilter(b, "s224"); err != nil || strings.Contains(b.SQL(), "role") {
		t.Errorf("without role: %v %s", err, b.SQL())
	}
	for _, bad := range []string{"s224:cook", "v17:scenario", ":scenario", "s0"} {
		if err := creditFilter(&query.Builder{}, bad); err == nil {
			t.Errorf("%q: want an error", bad)
		}
	}
}
