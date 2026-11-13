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
		// Voice work is its own table, apart from the credits.
		{vndb.TypeStaff, "role=seiyuu", "FROM vn_seiyuu vs"},
		{vndb.TypeStaff, "voiced=v17", "FROM vn_seiyuu vs"},
		{vndb.TypeStaff, "role=scenario", "FROM vn_staff vs"},
		// Every relation takes conditions on what it reaches, as vndb's own
		// search does: a work's character's voice actor, by what they are.
		{vndb.TypeVN, "character=(seiyuu=(gender=m+lang=ja))", "s.gender ="},
		{vndb.TypeVN, "trait=(sexual=false)", "JOIN traits i ON i.id = ct.tid"},
		{vndb.TypeVN, "trait=i568:0", "ct.spoil <="},
		{vndb.TypeStaff, "vn=(olang=ja)", "vn.olang ="},
		{vndb.TypeStaff, "voiced=(length>=4)", "vn.length >="},
		{vndb.TypeStaff, "character=(sex=f)", "c.sex ="},
		{vndb.TypeProducer, "vn=(rating>=80)", "vn.c_rating >="},
		{vndb.TypeProducer, "release=(freeware=true)", "r.freeware"},
		{vndb.TypeTag, "vn=(votecount>=1000)", "vn.c_votecount >="},
		{vndb.TypeTrait, "character=(age>=20)", "c.age >="},
		// A type related to itself: the owner is judged against the outer row
		// before the inner one, under the same alias, is brought in.
		{vndb.TypeProducer, "relation=(type=co)", "pr.id = p.id AND EXISTS (SELECT 1 FROM producers p WHERE p.id = pr.pid AND"},
		{vndb.TypeCharacter, "variant_of=(sex=f)", "cm.id = c.main AND EXISTS (SELECT 1 FROM chars c WHERE c.id = cm.id AND"},
		{vndb.TypeTag, "parent=(category=cont)", "tp.id = g.id AND EXISTS (SELECT 1 FROM tags g WHERE g.id = tp.parent AND"},
		{vndb.TypeTag, "under=(search=school)", "tc.descendant = g.id AND EXISTS (SELECT 1 FROM tags g"},
		{vndb.TypeTrait, "group=(search=hair)", "ig.id = i.gid AND EXISTS (SELECT 1 FROM traits i"},
		{vndb.TypeTrait, "parent=(sexual=true)", "tp.id = i.id AND EXISTS (SELECT 1 FROM traits i"},
		{vndb.TypeTrait, "under=(char_count>=10)", "tc.descendant = i.id AND EXISTS (SELECT 1 FROM traits i"},
		{vndb.TypeRelease, "supersedes=(patch=true)", "rs.id = r.id AND EXISTS (SELECT 1 FROM releases r WHERE r.id = rs.rid AND"},
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

// The types reach each other in cycles, so how far down one condition goes
// is bounded across the whole request, not per bracket.
func TestRelationsNestOnlySoDeep(t *testing.T) {
	cat := realCatalog(t)
	// From a work: release=(vn=(release=(...olang=ja...))), which both types take.
	down := func(levels int) string {
		open := ""
		for i := range levels {
			open += map[bool]string{true: "release=(", false: "vn=("}[i%2 == 0]
		}
		return open + "olang=ja" + strings.Repeat(")", levels)
	}
	if _, err := compile(cat, vndb.TypeVN, down(8)); err != nil {
		t.Errorf("eight relations deep: %v", err)
	}
	if _, err := compile(cat, vndb.TypeVN, down(9)); err == nil || !query.IsClientError(err) {
		t.Errorf("nine relations deep: got %v, want a client error", err)
	}
}

func TestNestedTagRefusesItsOwnUnknowns(t *testing.T) {
	cat := realCatalog(t)
	for _, expr := range []string{"tag=(nosuch=1)", "tag=()", "trait=(sexual=maybe)", "character=(seiyuu=(nosuch=1))"} {
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
			// Nothing to match is refused by every filter; a search is text, and
			// may look for a comma or what reads as an operator (<3), as may a
			// search of descriptions.
			text := name == "search" || name == "description" || name == "notes"
			for _, v := range []string{"", ",", ">="} {
				if text && v != "" {
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

// Every type the server runs can describe itself, which is what /meta/openapi
// is built from.
func TestEveryTypeDescribesItself(t *testing.T) {
	_, resolvers, err := newCatalog(&db.Store{})
	if err != nil {
		t.Fatal(err)
	}
	for name, r := range resolvers {
		d, ok := r.(described)
		if !ok {
			t.Errorf("%s cannot describe itself", name)
			continue
		}
		if len(d.Registry()) == 0 || len(d.Filters()) == 0 || len(d.Sorts()) == 0 {
			t.Errorf("%s: %d fields, %d filters, %d sorts", name, len(d.Registry()), len(d.Filters()), len(d.Sorts()))
		}
	}
}
