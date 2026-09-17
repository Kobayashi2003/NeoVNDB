package db

import (
	"context"
	"encoding/hex"

	"github.com/kobayashi/neovndb/internal/db/gen"
	"github.com/kobayashi/neovndb/internal/trans"
)

// Translations is what one page's worth of English text is called in this
// database's target language. Both halves are looked up by content -- see
// package trans for why -- so this is a plain map from the text asked about to
// the text to show instead, and a miss means nobody has translated it yet.
type Translations struct {
	Lang     string
	names    map[string]string // by trans.Key
	passages map[string]string // by hex of trans.Hash
}

// Name is what this short name is called, or "" if it is not translated.
func (t *Translations) Name(source string) string {
	if t == nil {
		return ""
	}
	return t.names[trans.Key(source)]
}

// Passage is what this long text says, or "" if it is not translated.
func (t *Translations) Passage(source string) string {
	if t == nil {
		return ""
	}
	return t.passages[hex.EncodeToString(trans.Hash(source))]
}

// Translations looks up a page of names and long texts in one round trip each.
// Either list may be empty; duplicates and blanks are dropped before asking.
func (s *Store) Translations(ctx context.Context, names, texts []string) (*Translations, error) {
	out := &Translations{Lang: s.transLang,
		names: map[string]string{}, passages: map[string]string{}}

	if keys := distinct(names, trans.Key); len(keys) > 0 {
		rows, err := s.TermTranslations(ctx,
			gen.TermTranslationsParams{TargetLang: s.transLang, Keys: keys})
		if err != nil {
			return nil, err
		}
		for _, r := range rows {
			out.names[r.SourceKey] = r.TargetText
		}
	}

	if hashes := digests(texts); len(hashes) > 0 {
		rows, err := s.PassageTranslations(ctx,
			gen.PassageTranslationsParams{TargetLang: s.transLang, Hashes: hashes})
		if err != nil {
			return nil, err
		}
		for _, r := range rows {
			out.passages[hex.EncodeToString(r.SourceHash)] = r.TargetText
		}
	}
	return out, nil
}

// distinct keys the inputs and returns each key once. Text that normalises to
// nothing is dropped: it has no translation to find, and asking anyway would
// be asking for the translation of the empty string.
func distinct(values []string, key func(string) string) []string {
	seen := make(map[string]struct{}, len(values))
	out := make([]string, 0, len(values))
	for _, v := range values {
		k := key(v)
		if k == "" {
			continue
		}
		if _, dup := seen[k]; dup {
			continue
		}
		seen[k] = struct{}{}
		out = append(out, k)
	}
	return out
}

// digests is distinct for the passage side, where the key is bytes. Deduping
// on the hex form and decoding back would be the same work done twice.
func digests(texts []string) [][]byte {
	seen := map[string]struct{}{}
	out := make([][]byte, 0, len(texts))
	for _, t := range texts {
		if trans.Key(t) == "" {
			continue
		}
		h := trans.Hash(t)
		if _, dup := seen[string(h)]; dup {
			continue
		}
		seen[string(h)] = struct{}{}
		out = append(out, h)
	}
	return out
}
