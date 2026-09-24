package vndb

import (
	"fmt"
	"sort"
	"strconv"
	"strings"
)

// ExtLink is one rendered external link.
type ExtLink struct {
	Site  string `json:"site"`
	Label string `json:"label"`
	URL   string `json:"url"`
}

// BuildExtLink renders a stored (site, value) pair. An unknown site yields no
// link rather than a broken one: upstream adds sites between imports, and a
// missing entry should degrade quietly.
func BuildExtLink(site, value string) (ExtLink, bool) {
	def, ok := extlinkSites[site]
	if !ok {
		return ExtLink{}, false
	}

	url, ok := formatExtLink(def.format, value)
	if !ok {
		return ExtLink{}, false
	}
	return ExtLink{Site: site, Label: def.label, URL: url}, true
}

// formatExtLink fills a recipe. Most take the value whole; itch is the one
// whose value carries two path segments, author and game.
func formatExtLink(format, value string) (string, bool) {
	switch strings.Count(format, "%") {
	case 1:
		if strings.Contains(format, "%d") {
			n, err := strconv.Atoi(value)
			if err != nil {
				return "", false
			}
			return fmt.Sprintf(format, n), true
		}
		return fmt.Sprintf(format, value), true
	case 2:
		author, game, found := strings.Cut(value, "/")
		if !found {
			return "", false
		}
		return fmt.Sprintf(format, author, game), true
	default:
		return "", false
	}
}

// Site is one external link site, as the condition builder offers it.
type Site struct {
	Site  string `json:"site"`
	Label string `json:"label"`
	// Entities lists the id prefixes the site appears on, e.g. "ps".
	Entities string `json:"entities"`
}

// Sites lists every known site by label.
func Sites() []Site {
	out := make([]Site, 0, len(extlinkSites))
	for name, def := range extlinkSites {
		out = append(out, Site{Site: name, Label: def.label, Entities: def.entities})
	}
	sort.Slice(out, func(i, j int) bool { return strings.ToLower(out[i].Label) < strings.ToLower(out[j].Label) })
	return out
}

// KnownSite reports whether a site name is one links are stored under.
func KnownSite(site string) bool {
	_, ok := extlinkSites[site]
	return ok
}
