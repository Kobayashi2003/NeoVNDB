package character

import (
	"context"

	"github.com/kobayashi/neovndb/internal/api/query"
	"github.com/kobayashi/neovndb/internal/db/gen"
	"github.com/kobayashi/neovndb/internal/vndb"
)

type field = query.Field[gen.Char]
type source = query.Source[*Resolver, gen.Char]

var fields = query.NewTable(query.Table[*Resolver, gen.Char]{
	IDType: vndb.TypeCharacter,
	ID:     func(c gen.Char) int32 { return c.ID },
	Fetch:  fetch,

	Fields: map[string]field{
		"description": {Row: func(c gen.Char) any { return query.EmptyToNil(c.Description) }},
		"blood_type":  {Row: func(c gen.Char) any { return unknownToNil(c.Bloodt, "unknown") }},
		"cup":         {Row: func(c gen.Char) any { return query.EmptyToNil(c.CupSize) }},
		"sex":         {Row: func(c gen.Char) any { return query.EmptyToNil(c.Sex) }},
		"gender":      {Row: func(c gen.Char) any { return c.Gender }},
		"height":      {Row: func(c gen.Char) any { return zeroToNil(c.Height) }},
		"weight":      {Row: func(c gen.Char) any { return c.Weight }},
		"bust":        {Row: func(c gen.Char) any { return zeroToNil(c.SBust) }},
		"waist":       {Row: func(c gen.Char) any { return zeroToNil(c.SWaist) }},
		"hips":        {Row: func(c gen.Char) any { return zeroToNil(c.SHip) }},
		"age":         {Row: func(c gen.Char) any { return c.Age }},
		"birthday":    {Row: func(c gen.Char) any { return birthday(c.Birthday) }},
		"instance_of": {Row: func(c gen.Char) any { return instanceOf(c.Main) }},

		// The name is the chars_names row in the character's own language,
		// which the import resolved into chars.c_lang -- the same read the
		// names fragment needs.
		"name":     {Source: "names"},
		"original": {Source: "names"},
		"names": {Kind: query.Fragment, Source: "names", Num: 2,
			Subfields: []string{"lang", "name", "latin"}},

		"image": {Kind: query.Fragment, Source: "image", Num: 1,
			Subfields: []string{"url", "dims", "sexual", "violence"}},
		"aliases": {Kind: query.Fragment, Source: "aliases", Num: 2,
			Subfields: []string{"name", "latin", "spoiler"}},

		"traits": {Kind: query.Fragment, Source: "traits", Num: 30,
			Edge: []string{"spoiler", "lie"}, Target: vndb.TypeTrait},
		// release names the one release a character is tied to when the
		// appearance is route-specific rather than across the whole VN.
		"vns": {Kind: query.Fragment, Source: "vns", Num: 3,
			Edge: []string{"role", "spoiler", "release"}, Target: vndb.TypeVN},
		// name is the alias credited for this voice role, not the person's own.
		"seiyuu": {Kind: query.Fragment, Source: "seiyuu", Num: 2,
			Edge:   []string{"vn", "note", "name", "original"},
			Target: vndb.TypeStaff},
	},
	Sources: map[string]source{
		"names":   loadNames,
		"image":   loadImage,
		"aliases": loadAliases,
		"traits":  loadTraits,
		"vns":     loadVNs,
		"seiyuu":  loadSeiyuu,
	},
})

func fetch(ctx context.Context, r *Resolver, ids []int32) ([]gen.Char, error) {
	return r.q.GetChars(ctx, ids)
}

// The dump packs a birthday as mmdd in one smallint, with 0 for unknown.
func birthday(v int16) []int16 {
	if v == 0 {
		return nil
	}
	return []int16{v / 100, v % 100}
}

func instanceOf(v *int32) *string {
	if v == nil {
		return nil
	}
	s := vndb.FormatID(vndb.TypeCharacter, *v)
	return &s
}

func zeroToNil(v int16) *int16 {
	if v == 0 {
		return nil
	}
	return &v
}

// A few enum-like columns spell "not recorded" as a word rather than as null.
func unknownToNil(v, blank string) *string {
	if v == "" || v == blank {
		return nil
	}
	return &v
}
