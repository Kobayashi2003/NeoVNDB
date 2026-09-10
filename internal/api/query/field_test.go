package query

import (
	"context"
	"reflect"
	"testing"
)

type testRow struct{ id int32 }

// testResolver plays the part a real type's resolver plays: it carries what
// the sources need and it is what the catalog hands to other types.
type testResolver struct{ ran []string }

func (r *testResolver) Registry() Registry { return testTable.Registry() }

func (r *testResolver) Type() string { return "vn" }

func (r *testResolver) Objects(ctx context.Context, ids []int32,
	sel Selection) (map[int32]map[string]any, error) {
	return testTable.Objects(ctx, r, ids, sel)
}

// testTable declares two columns fed by a single source, which is the
// arrangement title/alttitle/titles use on a real type, plus a fragment that
// inherits another type's field surface.
var testTable = NewTable(Table[*testResolver, testRow]{
	IDType: "vn",
	ID:     func(r testRow) int32 { return r.id },
	Fetch: func(_ context.Context, _ *testResolver, ids []int32) ([]testRow, error) {
		rows := make([]testRow, len(ids))
		for i, id := range ids {
			rows[i] = testRow{id: id}
		}
		return rows, nil
	},
	Fields: map[string]Field[testRow]{
		"olang":    {Row: func(testRow) any { return "ja" }},
		"title":    {Source: "titles"},
		"alttitle": {Source: "titles"},
		"titles":   {Kind: Fragment, Source: "titles", Num: 3, Subfields: []string{"lang"}},
		"tags": {Kind: Fragment, Source: "tags", Num: 50,
			Edge: []string{"rating"}, Target: "tag"},
	},
	Sources: map[string]Source[*testResolver, testRow]{
		"titles": record("titles"),
		"tags":   record("tags"),
	},
})

func record(name string) Source[*testResolver, testRow] {
	return func(_ context.Context, r *testResolver, _ []testRow, _ Selection,
		_ map[int32]map[string]any) error {
		r.ran = append(r.ran, name)
		return nil
	}
}

// tagType stands in for the entity a relation points at.
type tagType struct{}

func (tagType) Type() string { return "tag" }

func (tagType) Registry() Registry {
	return Registry{
		"name":        {},
		"description": {},
		"kids":        {Kind: Fragment, Num: 4, Subfields: []string{"name"}},
	}
}

func (tagType) Objects(_ context.Context, ids []int32, sel Selection) (map[int32]map[string]any, error) {
	out := map[int32]map[string]any{}
	for _, id := range ids {
		obj := map[string]any{"id": id}
		for _, c := range sel.Columns {
			obj[c] = c + "-value"
		}
		if sel.All {
			obj["name"], obj["description"] = "all-name", "all-desc"
		}
		out[id] = obj
	}
	return out, nil
}

var lim = DefaultLimits()

func setup() (*Catalog, *testResolver) {
	cat := NewCatalog()
	r := &testResolver{}
	cat.Put("vn", r)
	cat.Put("tag", tagType{})
	return cat, r
}

func TestSourcesRunOncePerRequest(t *testing.T) {
	for _, tc := range []struct {
		fields string
		want   []string
	}{
		{"olang", nil},
		{"title", []string{"titles"}},
		{"title,alttitle", []string{"titles"}},
		{"title,alttitle,titles", []string{"titles"}},
		{"title,tags.name", []string{"tags", "titles"}},
		{"", nil},
	} {
		cat, r := setup()
		sel, err := ParseFields(cat, testTable.Registry(), lim.MaxFieldDepth, tc.fields)
		if err != nil {
			t.Fatalf("fields=%q: %v", tc.fields, err)
		}
		if _, err := testTable.Apply(context.Background(), r, []testRow{{id: 17}}, sel); err != nil {
			t.Fatalf("fields=%q: %v", tc.fields, err)
		}
		if !reflect.DeepEqual(r.ran, tc.want) {
			t.Errorf("fields=%q ran %v, want %v", tc.fields, r.ran, tc.want)
		}
	}
}

// A fragment that names a target accepts that target's fields without listing
// them, and rejects what the target does not have.
func TestTargetSuppliesSubfields(t *testing.T) {
	cat, _ := setup()
	reg := testTable.Registry()
	for _, f := range []string{"tags.name", "tags.description", "tags.rating", "tags.kids.name", "tags.id"} {
		if _, err := ParseFields(cat, reg, lim.MaxFieldDepth, f); err != nil {
			t.Errorf("fields=%q: %v", f, err)
		}
	}
	for _, f := range []string{"tags.nope", "tags.kids.nope", "tags.kids.name.deeper"} {
		if _, err := ParseFields(cat, reg, lim.MaxFieldDepth, f); err == nil {
			t.Errorf("fields=%q was accepted", f)
		}
	}
}

// A field waiting on a source is present as null even when the source fills
// nothing, so a client can rely on the shape of the response.
func TestRequestedFieldAlwaysPresent(t *testing.T) {
	cat, r := setup()
	sel, err := ParseFields(cat, testTable.Registry(), lim.MaxFieldDepth, "olang,title")
	if err != nil {
		t.Fatal(err)
	}
	out, err := testTable.Apply(context.Background(), r, []testRow{{id: 17}}, sel)
	if err != nil {
		t.Fatal(err)
	}
	obj := out[0]
	if obj["id"] != "v17" {
		t.Errorf("id = %v, want v17", obj["id"])
	}
	if obj["olang"] != "ja" {
		t.Errorf("olang = %v, want ja", obj["olang"])
	}
	if v, ok := obj["title"]; !ok || v != nil {
		t.Errorf("title = %v (present %v), want present and nil", v, ok)
	}
}

// Relate merges the edge's own attributes over the object the target rendered,
// and asks the target only about fields the target owns.
func TestRelateMergesEdgeOverTarget(t *testing.T) {
	cat, _ := setup()
	sel, err := ParseFields(cat, testTable.Registry(), lim.MaxFieldDepth, "tags.name,tags.rating")
	if err != nil {
		t.Fatal(err)
	}
	byID := map[int32]map[string]any{17: {}}
	edges := []Edge{{Parent: 17, Child: 2, Attrs: map[string]any{"rating": 2.5}}}

	if err := Relate(context.Background(), cat, "vn", "tags", edges, sel, byID); err != nil {
		t.Fatal(err)
	}
	got := byID[17]["tags"].([]map[string]any)
	if len(got) != 1 {
		t.Fatalf("got %d tags, want 1", len(got))
	}
	if got[0]["name"] != "name-value" {
		t.Errorf("name = %v, want the target's value", got[0]["name"])
	}
	if got[0]["rating"] != 2.5 {
		t.Errorf("rating = %v, want the edge's value", got[0]["rating"])
	}
	if _, ok := got[0]["description"]; ok {
		t.Error("description was not requested but came back")
	}
}

// Cost multiplies each level's field count by the fan-out declared for it, so
// a request can be refused before any of it runs.
func TestCostGrowsWithFanOut(t *testing.T) {
	cat, _ := setup()
	reg := testTable.Registry()
	cost := func(fields string, rows int) int {
		sel, err := ParseFields(cat, reg, lim.MaxFieldDepth, fields)
		if err != nil {
			t.Fatalf("fields=%q: %v", fields, err)
		}
		return Cost(cat, reg, sel, rows)
	}

	// id + olang, ten rows.
	if got := cost("olang", 10); got != 20 {
		t.Errorf("olang cost = %d, want 20", got)
	}
	// Per row: id + olang, plus 50 tags of (id + name).
	if got := cost("olang,tags.name", 10); got != (2+50*2)*10 {
		t.Errorf("tags cost = %d, want %d", got, (2+50*2)*10)
	}
	// Nesting multiplies: 50 tags each carrying 4 kids.
	if cost("tags.kids.name", 10) <= cost("tags.name", 10) {
		t.Error("a nested level did not raise the cost")
	}
}

// Check turns a Target naming a type nobody registered into a startup failure.
func TestCatalogCheckFindsDanglingTarget(t *testing.T) {
	cat := NewCatalog()
	cat.Put("vn", &testResolver{})
	if err := cat.Check(); err == nil {
		t.Error("expected an error for the unregistered tag type")
	}
	cat.Put("tag", tagType{})
	if err := cat.Check(); err != nil {
		t.Errorf("unexpected error once tag is registered: %v", err)
	}
}

func TestNewTableRejectsBadTable(t *testing.T) {
	for name, fields := range map[string]map[string]Field[testRow]{
		"neither Row nor Source": {"x": {}},
		"both Row and Source":    {"x": {Row: func(testRow) any { return nil }, Source: "titles"}},
		"unknown source":         {"x": {Source: "nope"}},
		"fragment without source": {"x": {Kind: Fragment,
			Row: func(testRow) any { return nil }}},
		"edge on a column": {"x": {Row: func(testRow) any { return nil },
			Edge: []string{"rating"}}},
		"target and subfields both": {"x": {Kind: Fragment, Source: "titles",
			Subfields: []string{"a"}, Target: "tag"}},
	} {
		t.Run(name, func(t *testing.T) {
			defer func() {
				if recover() == nil {
					t.Error("expected a panic")
				}
			}()
			NewTable(Table[*testResolver, testRow]{
				IDType: "vn",
				ID:     func(r testRow) int32 { return r.id },
				Fields: fields,
				Sources: map[string]Source[*testResolver, testRow]{
					"titles": record("titles"),
				},
			})
		})
	}
}

// A bare fragment means all of it, and must widen one a subfield already
// narrowed whichever order the two arrived in.
func TestParseFieldsOrderSymmetry(t *testing.T) {
	cat, _ := setup()
	reg := testTable.Registry()
	for _, fields := range []string{"tags,tags.name", "tags.name,tags"} {
		sel, err := ParseFields(cat, reg, lim.MaxFieldDepth, fields)
		if err != nil {
			t.Fatalf("fields=%q: %v", fields, err)
		}
		if !sel.Fragments["tags"].All {
			t.Errorf("fields=%q did not widen to all", fields)
		}
	}
}

// Asking only for the edge's own attributes must not read the entity at the
// other end: the relation row already carries its id.
func TestRelateSkipsTheTargetWhenOnlyEdgeIsWanted(t *testing.T) {
	cat, _ := setup()
	read := &countingTarget{}
	cat.Put("tag", read)

	sel, err := ParseFields(cat, testTable.Registry(), lim.MaxFieldDepth, "tags.rating")
	if err != nil {
		t.Fatal(err)
	}
	byID := map[int32]map[string]any{17: {}}
	edges := []Edge{{Parent: 17, Child: 2, Attrs: map[string]any{"rating": 2.5}}}
	if err := Relate(context.Background(), cat, "vn", "tags", edges, sel, byID); err != nil {
		t.Fatal(err)
	}
	if read.calls != 0 {
		t.Errorf("read the target %d times, want 0", read.calls)
	}
	got := byID[17]["tags"].([]map[string]any)[0]
	if got["id"] != "g2" || got["rating"] != 2.5 {
		t.Errorf("got %v, want the id and the edge attribute", got)
	}

	// Asking for one of the target's own fields does read it.
	sel, err = ParseFields(cat, testTable.Registry(), lim.MaxFieldDepth, "tags.name")
	if err != nil {
		t.Fatal(err)
	}
	if err := Relate(context.Background(), cat, "vn", "tags", edges, sel, byID); err != nil {
		t.Fatal(err)
	}
	if read.calls != 1 {
		t.Errorf("read the target %d times, want 1", read.calls)
	}
}

type countingTarget struct {
	tagType
	calls int
}

func (c *countingTarget) Objects(ctx context.Context, ids []int32,
	sel Selection) (map[int32]map[string]any, error) {
	c.calls++
	return c.tagType.Objects(ctx, ids, sel)
}
