package trans

import (
	"fmt"
	"regexp"
	"sort"
	"strings"
)

// Descriptions are written in vndb's small BBCode-like markup, and some of
// what they contain is not language at all:
//
//   - paired tags: [b] [i] [s] [spoiler]
//   - links: [url=HREF]text[/url] -- the href is an address, not words
//   - literal blocks: [raw]...[/raw]
//   - bare references such as g749, i3137, v17, which vndb turns into links
//
// A translation must carry every one of these through unchanged; only the
// prose around them is allowed to differ. Tokens returns what must survive, so
// that a seed can refuse a translation that dropped a link or translated an
// id, rather than storing text that renders wrongly forever.

var (
	tagRE = regexp.MustCompile(`(?i)\[(/?)(url|b|i|s|spoiler|raw)(=[^\]]*)?\]`)
	// \b here is ASCII-only, which is what this needs: it holds at the join
	// between an id and a Japanese particle (i568は) and not inside a longer
	// ASCII word.
	idRE = regexp.MustCompile(`\b[gicrpsvdw]\d+(?:\.\d+)?\b`)
)

// Tokens is everything in the text that is not open to translation, sorted.
// Order is dropped because translation legitimately moves things around; what
// must hold is that the same tokens appear the same number of times.
func Tokens(text string) []string {
	if text == "" {
		return nil
	}
	var out []string
	for _, m := range tagRE.FindAllStringSubmatch(text, -1) {
		// Lower-cased because vndb writes both [url=..] and [URL=..], but the
		// href is kept exactly: it is the link's target.
		out = append(out, "["+m[1]+strings.ToLower(m[2])+m[3]+"]")
	}
	out = append(out, idRE.FindAllString(text, -1)...)
	sort.Strings(out)
	return out
}

// CheckMarkup reports whether a translation preserved everything it had to,
// naming what diverged so a seed can say which row is wrong and how.
func CheckMarkup(source, target string) error {
	src, tgt := Tokens(source), Tokens(target)
	if equal(src, tgt) {
		return nil
	}
	missing, extra := diff(src, tgt), diff(tgt, src)
	var parts []string
	if len(missing) > 0 {
		parts = append(parts, fmt.Sprintf("dropped %v", missing))
	}
	if len(extra) > 0 {
		parts = append(parts, fmt.Sprintf("invented %v", extra))
	}
	return fmt.Errorf("markup not preserved: %s", strings.Join(parts, "; "))
}

func equal(a, b []string) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i] != b[i] {
			return false
		}
	}
	return true
}

// diff is the multiset a minus b: what a has that b does not account for.
func diff(a, b []string) []string {
	left := make(map[string]int, len(b))
	for _, t := range b {
		left[t]++
	}
	var out []string
	for _, t := range a {
		if left[t] > 0 {
			left[t]--
			continue
		}
		out = append(out, t)
	}
	return out
}
