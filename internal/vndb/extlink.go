package vndb

import (
	"fmt"
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
