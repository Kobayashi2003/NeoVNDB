package character

import (
	"context"

	"github.com/kobayashi/neovndb/internal/api/query"
	"github.com/kobayashi/neovndb/internal/db/gen"
	"github.com/kobayashi/neovndb/internal/vndb"
)

type field = query.Field[gen.Char]
type source = query.Source[*Resolver, gen.Char]

// Each field is tagged with where its value comes from; the tags are defined
// in query.Field's documentation.
var fields = query.NewTable(query.Table[*Resolver, gen.Char]{
	IDType: vndb.TypeCharacter,
	ID:     func(c gen.Char) int32 { return c.ID },
	Fetch:  fetch,

	Fields: map[string]field{
		// COL -- chars, passed through.
		"weight": {Row: func(c gen.Char) any { return c.Weight }}, // chars.weight
		"age":    {Row: func(c gen.Char) any { return c.Age }},    // chars.age

		// CONV -- one chars column, re-expressed. The measurements and the
		// height spell "not recorded" as 0, bloodt spells it as a word, and
		// the text columns spell it as either NULL or ''.
		"description": {Row: func(c gen.Char) any { return query.EmptyToNil(c.Description) }},   // chars.description; '' -> null
		"blood_type":  {Row: func(c gen.Char) any { return unknownToNil(c.Bloodt, "unknown") }}, // chars.bloodt; 'unknown' -> null
		"cup":         {Row: func(c gen.Char) any { return query.EmptyToNil(c.CupSize) }},       // chars.cup_size
		"height":      {Row: func(c gen.Char) any { return zeroToNil(c.Height) }},               // chars.height; 0 -> null
		"bust":        {Row: func(c gen.Char) any { return zeroToNil(c.SBust) }},                // chars.s_bust
		"waist":       {Row: func(c gen.Char) any { return zeroToNil(c.SWaist) }},               // chars.s_waist
		"hips":        {Row: func(c gen.Char) any { return zeroToNil(c.SHip) }},                 // chars.s_hip
		"birthday":    {Row: func(c gen.Char) any { return birthday(c.Birthday) }},              // chars.birthday, mmdd in one smallint -> [month, day]
		"instance_of": {Row: func(c gen.Char) any { return instanceOf(c.Main) }},                // chars.main, an integer id -> 'cNNN'
		// Whether being an instance of that character is itself a spoiler.
		// It sits on this row because the link does, and it is the same value
		// the instances fragment carries from the other end.
		"instance_of_spoiler": {Row: func(c gen.Char) any { return c.MainSpoil }}, // chars.main_spoil

		// CONV -- sex is what a character appears to be and spoil_sex what
		// they turn out to be, which the dump keeps apart precisely because
		// the second one spoils the first. gender is the separate
		// self-identification axis, spoiled the same way.
		"sex":          {Row: func(c gen.Char) any { return query.EmptyToNil(c.Sex) }},   // chars.sex; '' -> null
		"spoil_sex":    {Row: func(c gen.Char) any { return blankToNil(c.SpoilSex) }},    // chars.spoil_sex; NULL and '' both -> null
		"gender":       {Row: func(c gen.Char) any { return blankToNil(c.Gender) }},      // chars.gender
		"spoil_gender": {Row: func(c gen.Char) any { return blankToNil(c.SpoilGender) }}, // chars.spoil_gender

		// JOIN1 + LIST -- chars_names, one read. The row picked for name and
		// original is the one in chars.c_lang, which is itself DERIV: the
		// import chooses it from the VNs this character appears in (see
		// derive/01_vncache.sql), so a name can change language without the
		// character row changing at all.
		"name":     {Source: "names"}, // JOIN1 chars_names WHERE lang = chars.c_lang, romanised form
		"original": {Source: "names"}, // JOIN1 chars_names WHERE lang = chars.c_lang, original script
		"names": {Kind: query.Fragment, Source: "names", Num: 2, // LIST chars_names
			Subfields: []string{"lang", "name", "latin"}},

		// JOIN1 -- images, keyed by the portrait id on the row. url is MADE
		// from (kind, num).
		"image": {Kind: query.Fragment, Source: "image", Num: 1, // JOIN1 images WHERE kind='ch' AND num = chars.image
			Subfields: []string{"url", "dims", "sexual", "violence"}},

		// LIST -- every alias row this character has.
		"aliases": {Kind: query.Fragment, Source: "aliases", Num: 2, // LIST chars_alias
			Subfields: []string{"name", "latin", "spoiler"}},

		// REL -- another entity, plus whatever the relation table holds itself.
		"traits": {Kind: query.Fragment, Source: "traits", Num: 30, // REL chars_traits -> traits
			Edge: []string{"spoiler", "lie"}, Target: vndb.TypeTrait},
		// release names the one release a character is tied to when the
		// appearance is route-specific rather than across the whole VN.
		"vns": {Kind: query.Fragment, Source: "vns", Num: 3, // REL chars_vns -> vn
			Edge: []string{"role", "spoiler", "release"}, Target: vndb.TypeVN},
		// chars.main read from the other end: the characters that are
		// instances of this one. The edge spoiler is each instance's own
		// main_spoil, because it describes that one link.
		"instances": {Kind: query.Fragment, Source: "instances", Num: 3, // REL chars WHERE main = this id -> chars
			Edge: []string{"spoiler"}, Target: vndb.TypeCharacter},
		// vn_seiyuu is keyed by (work, character, actor), so reading it from
		// the character side returns credits from every work they appear in.
		// The vn edge attribute is what tells them apart -- a caller showing
		// one work has to filter; this type cannot, it does not know which.
		// name is the alias credited for this voice role, not the person's own.
		"seiyuu": {Kind: query.Fragment, Source: "seiyuu", Num: 2, // REL vn_seiyuu JOIN staff_alias -> staff
			Edge:   []string{"vn", "note", "name", "original"},
			Target: vndb.TypeStaff},
	},
	Sources: map[string]source{
		"names":     loadNames,
		"image":     loadImage,
		"aliases":   loadAliases,
		"traits":    loadTraits,
		"vns":       loadVNs,
		"instances": loadInstances,
		"seiyuu":    loadSeiyuu,
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

// A nullable text column can still arrive as the empty string -- the dump has
// both spellings of "not recorded" in the same column (spoil_sex has 9 empties
// among its nulls). They mean the same thing and must read the same.
func blankToNil(v *string) *string {
	if v == nil || *v == "" {
		return nil
	}
	return v
}

// A few enum-like columns spell "not recorded" as a word rather than as null.
func unknownToNil(v, blank string) *string {
	if v == "" || v == blank {
		return nil
	}
	return &v
}
