package main

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"sort"
	"strings"

	"github.com/kobayashi/neovndb/internal/config"
	"github.com/kobayashi/neovndb/internal/db"
	"github.com/kobayashi/neovndb/internal/db/gen"
	"github.com/kobayashi/neovndb/internal/trans"
)

// The seed file: tag and trait names by category, and a flat list of the long
// texts. It is the format the previous incarnation of this project exported,
// which is where the corpus comes from; the corpus itself is defaultSeed.
type seedFile struct {
	TargetLang string                       `json:"target_lang"`
	Terms      map[string]map[string]string `json:"terms"`
	Passages   []struct {
		Source     string `json:"source"`
		Target     string `json:"target"`
		EntityType string `json:"entity_type"`
	} `json:"passages"`
}

// defaultSeed is the corpus kept in this repository, relative to backend/vndb
// where the command runs.
const defaultSeed = "internal/trans/init.json"

func runTrans(ctx context.Context, args []string) error {
	if len(args) == 0 {
		return fmt.Errorf("usage: neovndb trans <status|seed>")
	}
	switch args[0] {
	case "status":
		return transStatus(ctx)
	case "seed":
		if len(args) > 2 {
			return fmt.Errorf("usage: neovndb trans seed [file.json]")
		}
		file := defaultSeed
		if len(args) == 2 {
			file = args[1]
		}
		return transSeed(ctx, file)
	default:
		return fmt.Errorf("unknown trans command %q", args[0])
	}
}

func openStore(ctx context.Context) (*db.Store, error) {
	cfg, err := config.Load()
	if err != nil {
		return nil, err
	}
	return db.Open(ctx, cfg)
}

func transStatus(ctx context.Context) error {
	store, err := openStore(ctx)
	if err != nil {
		return err
	}
	defer store.Close()

	counts, err := store.TranslationCounts(ctx)
	if err != nil {
		return err
	}
	fmt.Printf("target language  %s\n", store.TransLang())
	fmt.Printf("terms            %d\n", counts.Terms)
	fmt.Printf("passages         %d\n", counts.Passages)
	return nil
}

// transSeed loads a corpus. Every passage is checked before anything is
// written, and one bad row stops the whole file: a seed is re-runnable, so
// refusing it costs an edit and a second run, while letting the good rows
// through would leave nobody able to say what is in the database.
func transSeed(ctx context.Context, path string) error {
	raw, err := os.ReadFile(path)
	if err != nil {
		return err
	}
	var seed seedFile
	if err := json.Unmarshal(raw, &seed); err != nil {
		return fmt.Errorf("reading %s: %w", path, err)
	}

	store, err := openStore(ctx)
	if err != nil {
		return err
	}
	defer store.Close()

	lang := seed.TargetLang
	if lang == "" {
		lang = store.TransLang()
	}
	if lang != store.TransLang() {
		return fmt.Errorf("%s holds %s translations, but this database is set up for %s",
			path, lang, store.TransLang())
	}

	var refused []string
	for _, p := range seed.Passages {
		if err := trans.CheckMarkup(p.Source, p.Target); err != nil {
			refused = append(refused, fmt.Sprintf("  %.60q: %v", p.Source, err))
		}
	}
	if len(refused) > 0 {
		sort.Strings(refused)
		shown := refused
		if len(shown) > 10 {
			shown = shown[:10]
		}
		return fmt.Errorf("%d of %d passages would not keep their markup:\n%s\n... nothing was written",
			len(refused), len(seed.Passages), strings.Join(shown, "\n"))
	}

	tx, err := store.Pool().Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx) //nolint:errcheck // a commit makes this a no-op
	q := gen.New(tx)

	terms := 0
	for category, pairs := range seed.Terms {
		for source, target := range pairs {
			if trans.Key(source) == "" || target == "" {
				continue
			}
			if err := q.UpsertTerm(ctx, gen.UpsertTermParams{
				TargetLang: lang, SourceKey: trans.Key(source),
				SourceText: source, TargetText: target, Category: &category,
			}); err != nil {
				return fmt.Errorf("term %q: %w", source, err)
			}
			terms++
		}
	}

	passages := 0
	for _, p := range seed.Passages {
		if trans.Key(p.Source) == "" || p.Target == "" {
			continue
		}
		entity := p.EntityType
		if err := q.UpsertPassage(ctx, gen.UpsertPassageParams{
			TargetLang: lang, SourceHash: trans.Hash(p.Source),
			SourceText: p.Source, TargetText: p.Target, EntityType: &entity,
		}); err != nil {
			return fmt.Errorf("passage %.40q: %w", p.Source, err)
		}
		passages++
	}

	if err := q.BumpTransRevision(ctx); err != nil {
		return err
	}
	if err := tx.Commit(ctx); err != nil {
		return err
	}
	fmt.Printf("seeded %d terms and %d passages into %s\n", terms, passages, lang)
	return nil
}
