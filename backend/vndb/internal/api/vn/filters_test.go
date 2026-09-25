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

func TestCoverLevel(t *testing.T) {
	b := &query.Builder{}
	if err := filters["cover_sexual"](b, "safe,suggestive"); err != nil {
		t.Fatal(err)
	}
	// Levels become fixed SQL, never arguments; unvoted covers match none.
	if sql := b.SQL(); !strings.Contains(sql, "c_sexual_avg <= 50") ||
		!strings.Contains(sql, "BETWEEN 51 AND 150") || !strings.Contains(sql, "c_votecount > 0") || len(b.Args) != 0 {
		t.Errorf("SQL = %s, args %v", sql, b.Args)
	}
	for _, bad := range []string{"brutal", "Safe", ">=safe", "1"} {
		if err := filters["cover_sexual"](&query.Builder{}, bad); err == nil {
			t.Errorf("%q was accepted", bad)
		}
	}
}
