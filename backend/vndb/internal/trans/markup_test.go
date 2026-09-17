package trans

import (
	"strings"
	"testing"
)

func TestTokens(t *testing.T) {
	cases := []struct {
		name string
		in   string
		want []string
	}{
		{"nothing to protect", "Just prose.", nil},
		{"paired tags", "a [b]bold[/b] word", []string{"[/b]", "[b]"}},
		{"case folds but the href does not",
			"[URL=https://x.test/A]link[/url]",
			[]string{"[/url]", "[url=https://x.test/A]"}},
		{"bare ids", "see g749 and v17", []string{"g749", "v17"}},
		{"a doc section keeps its part", "read d2.3", []string{"d2.3"}},
		// The reason this uses an ASCII word boundary: an id with a Japanese
		// particle glued on is still that id.
		{"id against kana", "i568は面白い", []string{"i568"}},
		{"not inside a word", "the vector v17x and av17", nil},
	}
	for _, c := range cases {
		got := Tokens(c.in)
		if strings.Join(got, "|") != strings.Join(c.want, "|") {
			t.Errorf("%s: Tokens(%q) = %v, want %v", c.name, c.in, got, c.want)
		}
	}
}

func TestCheckMarkup(t *testing.T) {
	const src = "A [b]bold[/b] claim about g749."

	if err := CheckMarkup(src, "g749についての[b]大胆な[/b]主張。"); err != nil {
		t.Errorf("a faithful translation was refused: %v", err)
	}
	// Reordering is what translation does; the tokens still all appear.
	if err := CheckMarkup(src, "[b]太字[/b]のg749。"); err != nil {
		t.Errorf("reordering was refused: %v", err)
	}
	for _, bad := range []struct{ name, target string }{
		{"lost a tag", "g749についての大胆な主張。"},
		{"translated an id", "[b]大胆な[/b]主張、g750について。"},
		{"invented a link", "[url=x]g749[/url][b]x[/b][/b]"},
	} {
		if err := CheckMarkup(src, bad.target); err == nil {
			t.Errorf("%s: accepted", bad.name)
		}
	}
}
