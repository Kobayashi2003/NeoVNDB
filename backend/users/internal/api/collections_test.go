package api

import "testing"

func TestParseID(t *testing.T) {
	cases := []struct {
		in   string
		kind string
		num  int32
		ok   bool
	}{
		{"v17", "v", 17, true},
		{"g749", "g", 749, true},
		{"x17", "", 0, false},
		{"v", "", 0, false},
		{"vx", "", 0, false},
		{"v0", "", 0, false},
		{"v-1", "", 0, false},
		{"v+17", "", 0, false},
		{"v017", "", 0, false},
		{"v99999999999", "", 0, false},
	}
	for _, c := range cases {
		kind, num, ok := parseID(c.in)
		if kind != c.kind || num != c.num || ok != c.ok {
			t.Errorf("parseID(%q) = %q %d %v, want %q %d %v", c.in, kind, num, ok, c.kind, c.num, c.ok)
		}
	}
}
