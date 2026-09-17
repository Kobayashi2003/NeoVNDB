// Package trans holds the translations of text vndb writes in English, and the
// rule for how a piece of that text is looked up.
//
// vndb writes tag and trait names and descriptions in English only, so unlike
// a VN title there is no original script to fall back to -- the Japanese here
// is something this project supplies. It is therefore not dump data, does not
// live in a generation schema, and survives a re-import untouched. See
// ddl/schema.sql.
//
// The lookup rule is the whole contract between what is stored and what is
// asked for, which is why it is one exported function rather than spelled out
// at each call site.
package trans

import (
	"crypto/sha256"
	_ "embed"
	"strings"
	"unicode"
)

//go:embed ddl/schema.sql
var schema string

// Key is the form a piece of text is stored and looked up under: whitespace
// collapsed to single spaces, ends trimmed, lower-cased. Two names that differ
// only in case or spacing are the same name.
func Key(text string) string {
	return strings.ToLower(strings.Join(strings.FieldsFunc(text, unicode.IsSpace), " "))
}

// Hash is the key for a passage. A description is far too long to index whole,
// so what is indexed is a hash of its Key -- which makes a lookup exact: text
// that has been edited since the translation was written simply does not match.
func Hash(text string) []byte {
	sum := sha256.Sum256([]byte(Key(text)))
	return sum[:]
}

// Schema is the DDL for the trans schema, idempotent and safe to apply on
// every start.
func Schema() string { return schema }
