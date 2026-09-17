package trans

import (
	"encoding/hex"
	"testing"
)

func TestKey(t *testing.T) {
	cases := []struct{ in, want string }{
		{"Protagonist", "protagonist"},
		{"AI Protagonist", "ai protagonist"},
		{"  padded  ", "padded"},
		{"runs\t of\n  space", "runs of space"},
		{"100% Completion Bonus", "100% completion bonus"},
		{"", ""},
		{"   ", ""},
	}
	for _, c := range cases {
		if got := Key(c.in); got != c.want {
			t.Errorf("Key(%q) = %q, want %q", c.in, got, c.want)
		}
	}
}

// The corpus was written by the old service, under its rule. These two values
// are copied out of rows it wrote: if either stops matching, every translation
// already in the database has become unfindable.
func TestKeyMatchesTheStoredCorpus(t *testing.T) {
	if got := Key("1001 Nights"); got != "1001 nights" {
		t.Errorf("term key = %q, want %q", got, "1001 nights")
	}
	const (
		source = "All the rape scenes in which this character gets raped by monsters can be avoided."
		want   = "008f62d4b0184d3c32eacd9cb38637e5b2bf0a2e2ab4f9a070ec7963d6ddc00b"
	)
	if got := hex.EncodeToString(Hash(source)); got != want {
		t.Errorf("passage hash = %s, want %s", got, want)
	}
}

// A passage is keyed by a hash of the same normalised form a term is keyed by,
// so two descriptions differing only in spacing or case share a translation.
func TestHashIsOfTheKey(t *testing.T) {
	a := hex.EncodeToString(Hash("A  Long   Description"))
	b := hex.EncodeToString(Hash("a long description"))
	if a != b {
		t.Errorf("hash depends on more than the key: %s vs %s", a, b)
	}
	if c := hex.EncodeToString(Hash("a long description!")); c == a {
		t.Error("hash ignores the text itself")
	}
}
