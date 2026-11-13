package db

import (
	"regexp"
	"strings"
	"testing"

	"github.com/kobayashi/neovndb/internal/trans"
)

// trans.norm is a copy of search_norm_term, kept in the trans schema because
// a stored column there cannot depend on a generation's function. A query is
// normalised by one and a translated name by the other, so the two bodies
// must not drift apart.
func TestTransNormIsSearchNormTerm(t *testing.T) {
	derived, err := sourceFS.ReadFile("ddl/02_derived.sql")
	if err != nil {
		t.Fatal(err)
	}
	body := func(sql, name string) string {
		t.Helper()
		m := regexp.MustCompile(`(?s)FUNCTION ` + regexp.QuoteMeta(name) + `\(str text\).*?\$\$(.*?)\$\$`).FindStringSubmatch(sql)
		if m == nil {
			t.Fatalf("no function %s", name)
		}
		return strings.Join(strings.Fields(m[1]), " ")
	}
	if a, b := body(string(derived), "search_norm_term"), body(trans.Schema(), "trans.norm"); a != b {
		t.Errorf("trans.norm differs from search_norm_term:\n  %s\n  %s", b, a)
	}
}
