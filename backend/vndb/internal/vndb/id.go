// Package vndb holds the encoding conventions of the upstream database: how
// an id is written, how a release date is packed, and how an external link
// becomes a URL. It knows nothing about HTTP or about our schema, so it can be
// exercised on its own.
package vndb

import (
	"fmt"
	"strconv"
	"strings"
)

// Entity types, in the letters vndb uses. The route takes the long name; ids
// on the wire use the letter.
const (
	TypeVN        = "vn"
	TypeRelease   = "release"
	TypeCharacter = "character"
	TypeProducer  = "producer"
	TypeStaff     = "staff"
	TypeTag       = "tag"
	TypeTrait     = "trait"
)

var prefixes = map[string]string{
	TypeVN: "v", TypeRelease: "r", TypeCharacter: "c",
	TypeProducer: "p", TypeStaff: "s", TypeTag: "g", TypeTrait: "i",
}

func KnownType(name string) bool {
	_, ok := prefixes[name]
	return ok
}

// FormatID turns a stored integer into the form every client speaks: 17 -> v17.
func FormatID(entity string, id int32) string {
	return prefixes[entity] + strconv.Itoa(int(id))
}

// ParseID accepts both 'v17' and '17'. The bare number is allowed because a
// client that already knows the type should not have to repeat it.
func ParseID(entity, value string) (int32, error) {
	prefix, ok := prefixes[entity]
	if !ok {
		return 0, fmt.Errorf("unknown type %q", entity)
	}
	digits := strings.TrimPrefix(value, prefix)
	if digits == value && strings.IndexFunc(value, isLetter) == 0 {
		return 0, fmt.Errorf("%q is not a %s id", value, entity)
	}
	// Parsed within int32 so an oversized id is refused rather than wrapped,
	// and digits only: ParseInt alone would take a sign.
	n, err := strconv.ParseInt(digits, 10, 32)
	if err != nil || n <= 0 || digits[0] < '0' || digits[0] > '9' {
		return 0, fmt.Errorf("%q is not a %s id", value, entity)
	}
	return int32(n), nil
}

// ParseIDs splits a comma-separated list, as a filter value carries it.
func ParseIDs(entity, value string, max int) ([]int32, error) {
	parts := strings.Split(value, ",")
	ids := make([]int32, 0, len(parts))
	for _, p := range parts {
		p = strings.TrimSpace(p)
		if p == "" {
			continue
		}
		id, err := ParseID(entity, p)
		if err != nil {
			return nil, err
		}
		ids = append(ids, id)
	}
	if len(ids) == 0 {
		return nil, fmt.Errorf("no ids given")
	}
	if max > 0 && len(ids) > max {
		return nil, fmt.Errorf("at most %d ids per request, got %d", max, len(ids))
	}
	return ids, nil
}

// ImageHost is where vndb serves its images.
const ImageHost = "https://t.vndb.org"

// ImagePath is where a stored (kind, num) pair lives, splitting on the last
// two digits the way t.vndb.org shards its files: cv/20339 -> /cv/39/20339.jpg
//
// Separate from ImageURL because the local mirror files images at this same
// path, and the rule has to be stated once: a mirror that sharded differently
// would answer a rewritten address with nothing.
func ImagePath(kind string, num int32) string {
	return fmt.Sprintf("/%s/%02d/%d.jpg", kind, num%100, num)
}

// ImageURL is the address the API hands out, which is vndb's own.
func ImageURL(kind string, num int32) string {
	return ImageHost + ImagePath(kind, num)
}

func isLetter(r rune) bool { return r >= 'a' && r <= 'z' }
