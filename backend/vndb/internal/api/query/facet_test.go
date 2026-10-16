package query

import (
	"strings"
	"testing"
)

var facetSpec = PageSpec{Table: "vn", Alias: "vn", IDType: "v", Filters: map[string]FilterFunc{
	"lang":   ArrayColumn("vn.c_languages"),
	"length": IntColumn("vn.length", 1),
}}

func TestFacetSetsItsOwnFilterAside(t *testing.T) {
	req, err := parse("lang=en&length=3", lim)
	if err != nil {
		t.Fatal(err)
	}
	sql, args, err := facetSQL(facetSpec, req, "lang", []string{"en", "ja"})
	if err != nil {
		t.Fatal(err)
	}
	// length narrows every count; lang=en, the filter being counted, does not.
	where := sql[strings.LastIndex(sql, " WHERE "):]
	if !strings.Contains(where, "vn.length") || strings.Contains(where, "c_languages") {
		t.Errorf("where: %s", where)
	}
	if n := strings.Count(sql, "COUNT(*) FILTER"); n != 2 {
		t.Errorf("%d counts for two values: %s", n, sql)
	}
	// One argument for length=3, one for each value, numbered in step.
	if len(args) != 3 || !strings.Contains(sql, "$3") {
		t.Errorf("args %v for %s", args, sql)
	}
}

func TestFacetRefuses(t *testing.T) {
	req, _ := parse("", lim)
	tight := lim
	tight.MaxFilterNodes = 2
	small, _ := parse("", tight)
	for name, c := range map[string]struct {
		req    *Request
		filter string
		values []string
	}{
		"an unknown filter":        {req, "nosuch", []string{"a"}},
		"id, which names rows":     {req, "id", []string{"v1"}},
		"no values":                {req, "lang", nil},
		"a value the filter lacks": {req, "length", []string{"long"}},
		"more values than nodes":   {small, "lang", []string{"en", "ja", "fr"}},
	} {
		if _, _, err := facetSQL(facetSpec, c.req, c.filter, c.values); err == nil || !IsClientError(err) {
			t.Errorf("%s: %v", name, err)
		}
	}
}
