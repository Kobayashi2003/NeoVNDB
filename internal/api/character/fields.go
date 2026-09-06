package character

import (
	"github.com/kobayashi/neovndb/internal/api/query"
	"github.com/kobayashi/neovndb/internal/db/gen"
)

// name and original are resolved from chars_names rather than being columns,
// the same way a visual novel's title is.
var registry = query.Registry{
	"name":        {Kind: query.Column},
	"original":    {Kind: query.Column},
	"description": {Kind: query.Column},
	"blood_type":  {Kind: query.Column},
	"cup":         {Kind: query.Column},
	"sex":         {Kind: query.Column},
	"gender":      {Kind: query.Column},
	"height":      {Kind: query.Column},
	"weight":      {Kind: query.Column},
	"bust":        {Kind: query.Column},
	"waist":       {Kind: query.Column},
	"hips":        {Kind: query.Column},
	"age":         {Kind: query.Column},
	"birthday":    {Kind: query.Column},
	"instance_of": {Kind: query.Column},

	"image":   {Kind: query.Fragment, Subfields: []string{"url", "dims", "sexual", "violence"}},
	"names":   {Kind: query.Fragment, Subfields: []string{"lang", "name", "latin"}},
	"aliases": {Kind: query.Fragment, Subfields: []string{"name", "latin", "spoiler"}},
	"traits":  {Kind: query.Fragment, Subfields: []string{"id", "name", "group", "spoiler", "lie", "sexual"}},
	"vns":     {Kind: query.Fragment, Subfields: []string{"id", "title", "role", "spoiler", "release"}},
	"seiyuu":  {Kind: query.Fragment, Subfields: []string{"id", "name", "original", "vn", "note"}},
}

func column(row gen.Char, name string) (any, bool) {
	switch name {
	case "description":
		return query.EmptyToNil(row.Description), true
	case "blood_type":
		return unknownToNil(row.Bloodt, "unknown"), true
	case "cup":
		return query.EmptyToNil(row.CupSize), true
	case "sex":
		return query.EmptyToNil(row.Sex), true
	case "gender":
		return row.Gender, true
	case "height":
		return zeroToNil(row.Height), true
	case "weight":
		return row.Weight, true
	case "bust":
		return zeroToNil(row.SBust), true
	case "waist":
		return zeroToNil(row.SWaist), true
	case "hips":
		return zeroToNil(row.SHip), true
	case "age":
		return row.Age, true
	case "birthday":
		return birthday(row.Birthday), true
	case "instance_of":
		return instanceOf(row.Main), true
	}
	// name and original come from chars_names.
	return nil, false
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
	s := vndbCharID(*v)
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
