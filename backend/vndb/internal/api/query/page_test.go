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

func TestSearchRankOrder(t *testing.T) {
	spec := PageSpec{Alias: "vn", SearchEntity: "v", Popularity: "vn.c_votecount",
		Sorts: map[string]Sort{"id": {Expr: "vn.id"}, "searchrank": {}}}

	for _, c := range []struct {
		search string
		args   int
	}{
		{"fate", 1},              // the query only
		{"ever out infinity", 2}, // plus the word list
	} {
		b := &Builder{}
		b.Arg("already bound") // a filter's argument, which stays $1
		req := &Request{Sort: "searchrank", Reverse: true, Filters: map[string]string{"search": c.search}}
		sql, join, err := orderBy(spec, req, b)
		if err != nil || join != "" {
			t.Fatalf("%q: %v", c.search, err)
		}
		if len(b.Args) != 1+c.args {
			t.Errorf("%q: %d arguments, want %d", c.search, len(b.Args), 1+c.args)
		}
		if strings.Contains(sql, "$1") || !strings.Contains(sql, "$2") {
			t.Errorf("%q: ranking must number its arguments after the filters':\n%s", c.search, sql)
		}
		if !strings.HasSuffix(sql, "DESC NULLS LAST, vn.id ASC") || !strings.Contains(sql, "vn.c_votecount") {
			t.Errorf("%q: unexpected ordering tail:\n%s", c.search, sql)
		}
	}

	if _, _, err := orderBy(spec, &Request{Sort: "searchrank", Filters: map[string]string{}}, &Builder{}); err == nil {
		t.Error("searchrank without a search should be refused")
	}
}

// A sort's join comes with that sort only.
func TestSortBringsItsJoin(t *testing.T) {
	spec := PageSpec{Alias: "vn", Sorts: map[string]Sort{
		"id":    {Expr: "vn.id"},
		"title": {Expr: "vt.title", Join: "LEFT JOIN vn_titles vt ON vt.id = vn.id"},
	}}
	if _, join, _ := orderBy(spec, &Request{Sort: "title"}, &Builder{}); join == "" {
		t.Error("title sort lost its join")
	}
	if _, join, _ := orderBy(spec, &Request{}, &Builder{}); join != "" {
		t.Errorf("the default sort brought a join: %q", join)
	}
	if _, _, err := orderBy(spec, &Request{Sort: "nosuch"}, &Builder{}); err == nil {
		t.Error("an unknown sort was accepted")
	}
}
