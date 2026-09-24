package api

import (
	"strings"
	"testing"

	"github.com/kobayashi/neovndb/internal/api/query"
	"github.com/kobayashi/neovndb/internal/db"
	"github.com/kobayashi/neovndb/internal/vndb"
)

// The catalog the server runs with, not a stand-in: every nested field and
// condition has to resolve against the real types.
func realCatalog(t *testing.T) *query.Catalog {
	t.Helper()
	cat, _, err := newCatalog(&db.Store{})
	if err != nil {
		t.Fatal(err)
	}
	return cat
}

func compile(cat *query.Catalog, typ, expr string) (string, error) {
	n, err := query.ParseExpr(expr, query.Budget(0))
	if err != nil {
		return "", err
	}
	b := newBuilder(cat)
	if err := b.Expr(n, cat.Get(typ).Filters()); err != nil {
		return "", err
	}
	return b.SQL(), nil
}

// Conditions reach across types; each of these crosses at least one boundary.
func TestNestedConditionsCompile(t *testing.T) {
	cat := realCatalog(t)
	for _, c := range []struct{ typ, expr, want string }{
		{vndb.TypeVN, "release=(resolution>=1920x1080+lang=en)", "r.reso_x >="},
		{vndb.TypeVN, "staff=(gender=f)+credit=s224:scenario", "vs.role ="},
		{vndb.TypeVN, "character=(trait=i568+birthday=12)", "c.birthday BETWEEN"},
		{vndb.TypeCharacter, "vn=(release=(developer=p1))", "EXISTS"},
		{vndb.TypeRelease, "vn=(length_minutes>=600)", "vn.c_length >="},
		// Tags and traits by what they are, not by id.
		{vndb.TypeVN, "tag=(search=school+category=cont)", "JOIN tags g ON g.id = t.tag"},
		{vndb.TypeVN, "!dtag=(vn_count>=100)", "g.c_items >="},
		{vndb.TypeCharacter, "trait=(search=glasses)", "JOIN traits i ON i.id = ct.tid"},
	} {
		sql, err := compile(cat, c.typ, c.expr)
		if err != nil {
			t.Errorf("%s %q: %v", c.typ, c.expr, err)
			continue
		}
		if !strings.Contains(sql, c.want) {
			t.Errorf("%s %q: %s lacks %q", c.typ, c.expr, sql, c.want)
		}
	}
}

func TestNestedTagRefusesItsOwnUnknowns(t *testing.T) {
	cat := realCatalog(t)
	for _, expr := range []string{"tag=(nosuch=1)", "tag=()", "trait=(search=x)"} {
		if _, err := compile(cat, vndb.TypeVN, expr); err == nil || !query.IsClientError(err) {
			t.Errorf("%q: got %v, want a client error", expr, err)
		}
	}
}

// Every filter of every type answers bad input with a client error: a panic
// or a server error here would be a 500 anyone can trigger.
func TestEveryFilterFailsAsAClientError(t *testing.T) {
	cat := realCatalog(t)
	types := []string{vndb.TypeVN, vndb.TypeRelease, vndb.TypeCharacter,
		vndb.TypeProducer, vndb.TypeStaff, vndb.TypeTag, vndb.TypeTrait}
	for _, typ := range types {
		for name, f := range cat.Get(typ).Filters() {
			// Nothing to match is refused by every filter; a search may look
			// for a comma.
			for _, v := range []string{"", ",", ">="} {
				if name == "search" && v == "," {
					continue
				}
				if err := f(newBuilder(cat), v); err == nil || !query.IsClientError(err) {
					t.Errorf("%s %s=%q: got %v, want a client error", typ, name, v, err)
				}
			}
			// Free-text filters may take these; the rest must refuse cleanly.
			for _, v := range []string{"(", "(nosuch=1)", "((", "x:y:z:w", ">=-", "99999999999999999999"} {
				if err := f(newBuilder(cat), v); err != nil && !query.IsClientError(err) {
					t.Errorf("%s %s=%q: %v is not a client error", typ, name, v, err)
				}
			}
		}
	}
}

func newBuilder(cat *query.Catalog) *query.Builder {
	return &query.Builder{Types: cat, Budget: query.Budget(0), Limits: query.DefaultLimits()}
}
