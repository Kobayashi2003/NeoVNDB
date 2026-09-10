package query

import (
	"context"
	"reflect"
	"testing"
)

type testRow struct{ id int32 }

// table declares two columns and one fragment fed by a single source, which is
// the arrangement title/alttitle/titles use on a real type.
func table(ran *[]string) Table[testRow] {
	source := func(name string) Source[testRow] {
		return func(context.Context, []testRow, Selection, map[int32]map[string]any) error {
			*ran = append(*ran, name)
			return nil
		}
	}
	return Table[testRow]{
		IDType: "vn",
		ID:     func(r testRow) int32 { return r.id },
		Fields: map[string]Field[testRow]{
			"olang":    {Row: func(testRow) any { return "ja" }},
			"title":    {Source: "titles"},
			"alttitle": {Source: "titles"},
			"titles":   {Kind: Fragment, Source: "titles", Subfields: []string{"lang"}},
			"tags":     {Kind: Fragment, Source: "tags", Subfields: []string{"id", "name"}},
		},
		Sources: map[string]Source[testRow]{
			"titles": source("titles"),
			"tags":   source("tags"),
		},
	}
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
		{"title,tags", []string{"tags", "titles"}},
		{"", nil},
	} {
		var ran []string
		tbl := table(&ran)
		sel, err := ParseFields(tbl.Registry(), tc.fields)
		if err != nil {
			t.Fatalf("fields=%q: %v", tc.fields, err)
		}
		if _, err := tbl.Apply(context.Background(), []testRow{{id: 17}}, sel); err != nil {
			t.Fatalf("fields=%q: %v", tc.fields, err)
		}
		if !reflect.DeepEqual(ran, tc.want) {
			t.Errorf("fields=%q ran %v, want %v", tc.fields, ran, tc.want)
		}
	}
}

// A field waiting on a source is present as null even when the source fills
// nothing, so a client can rely on the shape of the response.
func TestRequestedFieldAlwaysPresent(t *testing.T) {
	var ran []string
	tbl := table(&ran)
	sel, err := ParseFields(tbl.Registry(), "olang,title")
	if err != nil {
		t.Fatal(err)
	}
	out, err := tbl.Apply(context.Background(), []testRow{{id: 17}}, sel)
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

func TestRegistryRejectsBadTable(t *testing.T) {
	for name, fields := range map[string]map[string]Field[testRow]{
		"neither Row nor Source": {"x": {}},
		"both Row and Source":    {"x": {Row: func(testRow) any { return nil }, Source: "titles"}},
		"unknown source":         {"x": {Source: "nope"}},
		"fragment without source": {"x": {Kind: Fragment,
			Row: func(testRow) any { return nil }}},
	} {
		t.Run(name, func(t *testing.T) {
			defer func() {
				if recover() == nil {
					t.Error("expected a panic")
				}
			}()
			var ran []string
			tbl := table(&ran)
			tbl.Fields = fields
			tbl.Registry()
		})
	}
}

// A bare fragment means all of it, and must widen one a subfield already
// narrowed whichever order the two arrived in.
func TestParseFieldsOrderSymmetry(t *testing.T) {
	var ran []string
	reg := table(&ran).Registry()
	for _, fields := range []string{"tags,tags.name", "tags.name,tags"} {
		sel, err := ParseFields(reg, fields)
		if err != nil {
			t.Fatalf("fields=%q: %v", fields, err)
		}
		if subs := sel.Fragments["tags"]; len(subs) != 0 {
			t.Errorf("fields=%q narrowed to %v, want all", fields, subs)
		}
	}
}
