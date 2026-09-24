// Package trans holds translations of vndb's English-only tag and trait text.
// It is project data, not dump data, so it lives outside the generation
// schemas and survives imports (see ddl/schema.sql). Key is the one lookup
// rule shared by what is stored and what is asked for.
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
