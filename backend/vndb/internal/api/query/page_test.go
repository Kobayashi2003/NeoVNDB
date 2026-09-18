package query

import (
	"strings"
	"testing"
)

func TestSearchTerms(t *testing.T) {
	cases := []struct {
		in   string
		want []string
	}{
		{"ever17", []string{"ever17"}},
		{"ever out infinity", []string{"ever", "out", "infinity"}},
		{"  spaced   out  ", []string{"spaced", "out"}},
		{"", nil},
		{"   ", nil},
		// A phrase is one part, so the words in it keep their order.
		{`"out of infinity"`, []string{"out of infinity"}},
		{`ever "out of" infinity`, []string{"ever", "out of", "infinity"}},
		// An unclosed quote is still a phrase: refusing it would be refusing a
		// query somebody is halfway through typing.
		{`ever "out of infinity`, []string{"ever", "out of infinity"}},
		{`"" ever`, []string{"ever"}},
		// Full-width space, which a Japanese title is as likely to carry.
		{"ひぐらし　なく", []string{"ひぐらし", "なく"}},
	}
	for _, c := range cases {
		got := SearchTerms(c.in)
		if strings.Join(got, "|") != strings.Join(c.want, "|") {
			t.Errorf("SearchTerms(%q) = %q, want %q", c.in, got, c.want)
		}
	}
}
