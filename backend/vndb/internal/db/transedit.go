package db

import (
	"context"
	"fmt"

	"github.com/kobayashi/neovndb/internal/db/gen"
	"github.com/kobayashi/neovndb/internal/trans"
)

// Translatable is one tag or trait as a translator sees it: the English and
// what it is called now, "" where nobody has translated it.
type Translatable struct {
	ID          int32  `json:"id"`
	Name        string `json:"name"`
	Description string `json:"description"`
	// A trait's group, which tells "Black" the hair from "Black" the eyes.
	Group         string `json:"group,omitempty"`
	Items         int32  `json:"items"`
	NameTo        string `json:"name_to"`
	DescriptionTo string `json:"description_to"`
}

// Translatable lists every tag ("tag") or trait ("trait") of the live
// generation with its translations. A few thousand rows each, so callers
// filter and page in memory rather than in SQL, where the lookup rule of
// package trans would have to be written a second time.
func (s *Store) Translatable(ctx context.Context, category string) ([]Translatable, error) {
	var out []Translatable
	switch category {
	case "tag":
		rows, err := s.TranslatableTags(ctx)
		if err != nil {
			return nil, err
		}
		for _, r := range rows {
			out = append(out, Translatable{ID: r.ID, Name: r.Name, Description: r.Description, Items: r.CItems})
		}
	case "trait":
		rows, err := s.TranslatableTraits(ctx)
		if err != nil {
			return nil, err
		}
		for _, r := range rows {
			out = append(out, Translatable{ID: r.ID, Name: r.Name, Description: r.Description, Group: r.GroupName, Items: r.CItems})
		}
	default:
		return nil, fmt.Errorf("no translations for %q", category)
	}

	names := make([]string, len(out))
	texts := make([]string, len(out))
	for i, t := range out {
		names[i], texts[i] = t.Name, t.Description
	}
	found, err := s.Translations(ctx, names, texts)
	if err != nil {
		return nil, err
	}
	for i := range out {
		out[i].NameTo = found.Name(out[i].Name)
		out[i].DescriptionTo = found.Passage(out[i].Description)
	}
	return out, nil
}

// SetTranslation stores what source is called -- a name, or with long a
// description -- and bumps the revision so cached pages show it at once. An
// empty target removes the translation. A description must keep its markup.
func (s *Store) SetTranslation(ctx context.Context, category, source, target string, long bool) error {
	if trans.Key(source) == "" {
		return fmt.Errorf("nothing to translate")
	}
	if long && target != "" {
		if err := trans.CheckMarkup(source, target); err != nil {
			return err
		}
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	q := gen.New(tx)
	lang := s.transLang

	switch {
	case !long && target == "":
		err = q.DeleteTerm(ctx, gen.DeleteTermParams{TargetLang: lang, SourceKey: trans.Key(source)})
	case !long:
		err = q.UpsertTerm(ctx, gen.UpsertTermParams{TargetLang: lang, SourceKey: trans.Key(source),
			SourceText: source, TargetText: target, Category: &category})
	case target == "":
		err = q.DeletePassage(ctx, gen.DeletePassageParams{TargetLang: lang, SourceHash: trans.Hash(source)})
	default:
		err = q.UpsertPassage(ctx, gen.UpsertPassageParams{TargetLang: lang, SourceHash: trans.Hash(source),
			SourceText: source, TargetText: target, EntityType: &category})
	}
	if err != nil {
		return err
	}
	if err := q.BumpTransRevision(ctx); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

// Seed stores a corpus's translations into this database's target language
// and bumps the revision, all in one transaction; entries with nothing to
// translate or no translation are skipped. The caller checks the markup.
func (s *Store) Seed(ctx context.Context, c *trans.Corpus) (terms, passages int, err error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return 0, 0, err
	}
	defer tx.Rollback(ctx)
	q := gen.New(tx)
	lang := s.transLang

	for category, pairs := range c.Terms {
		for source, target := range pairs {
			if trans.Key(source) == "" || target == "" {
				continue
			}
			if err := q.UpsertTerm(ctx, gen.UpsertTermParams{
				TargetLang: lang, SourceKey: trans.Key(source),
				SourceText: source, TargetText: target, Category: &category,
			}); err != nil {
				return 0, 0, fmt.Errorf("term %q: %w", source, err)
			}
			terms++
		}
	}
	for _, p := range c.Passages {
		if trans.Key(p.Source) == "" || p.Target == "" {
			continue
		}
		entity := p.EntityType
		if err := q.UpsertPassage(ctx, gen.UpsertPassageParams{
			TargetLang: lang, SourceHash: trans.Hash(p.Source),
			SourceText: p.Source, TargetText: p.Target, EntityType: &entity,
		}); err != nil {
			return 0, 0, fmt.Errorf("passage %.40q: %w", p.Source, err)
		}
		passages++
	}

	if err := q.BumpTransRevision(ctx); err != nil {
		return 0, 0, err
	}
	return terms, passages, tx.Commit(ctx)
}

// Corpus is everything translated, in the corpus file's form.
func (s *Store) Corpus(ctx context.Context) (*trans.Corpus, error) {
	c := &trans.Corpus{SourceLang: "en", TargetLang: s.transLang, Comment: trans.CorpusComment,
		Terms: map[string]map[string]string{}, Passages: []trans.Passage{}}

	terms, err := s.AllTerms(ctx, s.transLang)
	if err != nil {
		return nil, err
	}
	for _, t := range terms {
		category := orEmpty(t.Category)
		if c.Terms[category] == nil {
			c.Terms[category] = map[string]string{}
		}
		c.Terms[category][t.SourceText] = t.TargetText
	}

	passages, err := s.AllPassages(ctx, s.transLang)
	if err != nil {
		return nil, err
	}
	for _, p := range passages {
		c.Passages = append(c.Passages, trans.Passage{Source: p.SourceText, Target: p.TargetText, EntityType: orEmpty(p.EntityType)})
	}
	return c, nil
}

func orEmpty(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}
