package query

import (
	"strings"
	"testing"
)

// shape renders a parsed expression so a test can say what it expects without
// reaching into the nodes.
func shape(n node) string {
	switch t := n.(type) {
	case nil:
		return ""
	case *leaf:
		return t.name + t.op + t.value
	case *negation:
		return "!" + shape(t.inner)
	case *junction:
		parts := make([]string, 0, len(t.children))
		for _, c := range t.children {
			parts = append(parts, shape(c))
		}
		join := "|"
		if t.and {
			join = "&"
		}
		return "(" + strings.Join(parts, join) + ")"
	}
	return "?"
}

func TestParseExpr(t *testing.T) {
	cases := []struct{ in, want string }{
		{"", ""},
		{"lang=en", "lang=en"},
		{"lang=en,lang=ja", "(lang=en|lang=ja)"},
		{"lang=en+freeware=true", "(lang=en&freeware=true)"},
		// and binds tighter than or, so this is one or of two ands.
		{"a=1+b=2,c=3+d=4", "((a=1&b=2)|(c=3&d=4))"},
		{"(a=1,b=2)+c=3", "((a=1|b=2)&c=3)"},
		{"!patch=true", "!patch=true"},
		{"!(a=1,b=2)", "!(a=1|b=2)"},
		{"!a=1+b=2", "(!a=1&b=2)"},
		{"rating>=70", "rating>=70"},
		{"rating!=70", "rating!=70"},
		// Whitespace is not part of anything.
		{" lang = en , lang = ja ", "(lang=en|lang=ja)"},
		// A quoted value keeps what would otherwise be punctuation.
		{`search="ever, out"`, "search=ever, out"},
		{`search="say \"no\""`, `search=say "no"`},
		{"released>=2010-01-01", "released>=2010-01-01"},
	}
	for _, c := range cases {
		got, err := ParseExpr(c.in, 0)
		if err != nil {
			t.Errorf("ParseExpr(%q): %v", c.in, err)
			continue
		}
		if shape(got) != c.want {
			t.Errorf("ParseExpr(%q) = %s, want %s", c.in, shape(got), c.want)
		}
	}
}

func TestParseExprRefuses(t *testing.T) {
	cases := []string{
		"lang",             // no operator
		"lang=",            // no value
		"=en",              // no name
		"(lang=en",         // unclosed bracket
		"lang=en)",         // stray bracket
		"lang=en+",         // ends mid-expression
		",lang=en",         // starts mid-expression
		`search="unclosed`, // unclosed quote
		"!",                // nothing to negate
		"Lang=en",          // names are lower case, so this is not one
	}
	for _, in := range cases {
		if _, err := ParseExpr(in, 0); err == nil {
			t.Errorf("ParseExpr(%q) was accepted", in)
		} else if !IsClientError(err) {
			t.Errorf("ParseExpr(%q) failed with %v, which is not a client error", in, err)
		}
	}
}

func TestParseExprBudget(t *testing.T) {
	if _, err := ParseExpr("a=1,b=2,c=3", 2); err == nil {
		t.Error("three conditions were accepted with a budget of two")
	}
	if _, err := ParseExpr("a=1,b=2,c=3", 3); err != nil {
		t.Errorf("three conditions with a budget of three: %v", err)
	}
	if _, err := ParseExpr("a=1,b=2,c=3", 0); err != nil {
		t.Errorf("no budget should mean no ceiling: %v", err)
	}
	if _, err := ParseExpr(strings.Repeat("(", 200)+"a=1", 0); err == nil {
		t.Error("a tree deeper than the stack guard was accepted")
	}
}

// The compiler is given a filter table of the same shape a type declares, so
// what is tested is what runs.
func TestCompileExpr(t *testing.T) {
	filters := map[string]FilterFunc{
		"lang":   ArrayColumn("vn.c_languages"),
		"rating": IntColumn("vn.c_rating", 10),
		"patch":  BoolFilter("r.patch", "NOT r.patch"),
	}
	cases := []struct{ in, want string }{
		{"lang=en", "$1 = ANY(vn.c_languages)"},
		{"lang=en,lang=ja", "($1 = ANY(vn.c_languages) OR $2 = ANY(vn.c_languages))"},
		{"lang=en+rating>=70", "($1 = ANY(vn.c_languages) AND vn.c_rating >= $2)"},
		{"!patch=true", "NOT (r.patch)"},
		{"lang!=en", "NOT ($1 = ANY(vn.c_languages))"},
		{"!(lang=en,lang=ja)", "NOT (($1 = ANY(vn.c_languages) OR $2 = ANY(vn.c_languages)))"},
	}
	for _, c := range cases {
		n, err := ParseExpr(c.in, 0)
		if err != nil {
			t.Errorf("ParseExpr(%q): %v", c.in, err)
			continue
		}
		b := &Builder{}
		if err := b.Expr(n, filters); err != nil {
			t.Errorf("compile(%q): %v", c.in, err)
			continue
		}
		if got := strings.Join(b.Conds, " AND "); got != c.want {
			t.Errorf("compile(%q) = %s, want %s", c.in, got, c.want)
		}
	}
}

func TestCompileExprRefuses(t *testing.T) {
	filters := map[string]FilterFunc{"lang": ArrayColumn("vn.c_languages")}
	for _, in := range []string{
		"nosuch=1", // not a filter
		"lang>=en", // this one matches rather than compares
	} {
		n, err := ParseExpr(in, 0)
		if err != nil {
			continue // refused earlier, which is also a refusal
		}
		if err := (&Builder{}).Expr(n, filters); err == nil {
			t.Errorf("compile(%q) was accepted", in)
		}
	}
}
