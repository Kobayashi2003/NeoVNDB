package trans

import (
	"bytes"
	"encoding/json"
	"io"
	"sort"
)

// Corpus is the translation corpus as a file: tag and trait names by
// category, and the long texts. It is the format the previous incarnation of
// this project exported, kept so that file still loads; init.json is the copy
// in this repository.
type Corpus struct {
	SourceLang string                       `json:"source_lang"`
	TargetLang string                       `json:"target_lang"`
	Comment    string                       `json:"_comment"`
	Terms      map[string]map[string]string `json:"terms"`
	Passages   []Passage                    `json:"passages"`
}

type Passage struct {
	Source     string `json:"source"`
	Target     string `json:"target"`
	EntityType string `json:"entity_type"`
}

// CorpusComment heads every exported corpus.
const CorpusComment = "The translation corpus, the only copy: it cannot be rebuilt from a dump. " +
	`"terms" holds tag and trait NAMES by category, keyed by the English name; ` +
	`"passages" holds DESCRIPTIONS keyed by their English text, with vndb markup kept exactly (checked on load). ` +
	"Load it with `neovndb trans seed` from backend/vndb; it replaces rows with the same key and leaves others alone, " +
	"so running it again is safe. `neovndb trans export` (or the admin page) writes the database's corpus back out."

// Encode writes the corpus in one stable form -- names in key order, long
// texts by type and text -- so exporting an unchanged database changes nothing
// and an edit shows up in a diff as itself.
func (c *Corpus) Encode(w io.Writer) error {
	sorted := *c
	sorted.Passages = append([]Passage(nil), c.Passages...)
	sort.SliceStable(sorted.Passages, func(i, j int) bool {
		a, b := sorted.Passages[i], sorted.Passages[j]
		if a.EntityType != b.EntityType {
			return a.EntityType < b.EntityType
		}
		return a.Source < b.Source
	})

	var buf bytes.Buffer
	enc := json.NewEncoder(&buf)
	enc.SetEscapeHTML(false) // descriptions are full of <, > and &
	enc.SetIndent("", " ")
	if err := enc.Encode(&sorted); err != nil {
		return err
	}
	_, err := w.Write(buf.Bytes())
	return err
}
