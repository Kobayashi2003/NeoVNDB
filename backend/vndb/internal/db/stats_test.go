package db

import (
	"slices"
	"testing"
)

func TestSiteStatsTranslatesTagsAndTraits(t *testing.T) {
	m := &SiteStats{
		Tags:        map[string][]Ranked{"cont": {{Name: "Romance"}, {Name: "Comedy"}}},
		Traits:      map[string][]Ranked{"i1": {{Name: "Long Hair"}}},
		TraitGroups: []Ranked{{Name: "Hair"}},
		// Not a tag or trait: never translated.
		Developers: []Ranked{{Name: "Romance"}},
	}

	names := m.TagNames()
	slices.Sort(names)
	if want := []string{"Comedy", "Hair", "Long Hair", "Romance"}; !slices.Equal(names, want) {
		t.Fatalf("TagNames = %v, want %v", names, want)
	}

	known := map[string]string{"Romance": "恋愛", "Hair": "髪"}
	m.Translate(func(name string) string { return known[name] })
	if got := m.Tags["cont"][0].Translation; got == nil || *got != "恋愛" {
		t.Errorf("Romance translated to %v", got)
	}
	if got := m.TraitGroups[0].Translation; got == nil || *got != "髪" {
		t.Errorf("Hair translated to %v", got)
	}
	// None found: left out rather than set empty.
	if got := m.Tags["cont"][1].Translation; got != nil {
		t.Errorf("Comedy translated to %q", *got)
	}
	if m.Developers[0].Translation != nil {
		t.Error("a developer was translated")
	}
}
