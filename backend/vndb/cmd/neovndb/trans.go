package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"os"
	"sort"
	"strings"

	"github.com/kobayashi/neovndb/internal/trans"
)

// defaultCorpus is the corpus kept in this repository, relative to
// backend/vndb where the command runs.
const defaultCorpus = "internal/trans/init.json"

func runTrans(ctx context.Context, args []string) error {
	if len(args) == 0 {
		return fmt.Errorf("usage: neovndb trans <status|seed|export>")
	}
	switch args[0] {
	case "status":
		return transStatus(ctx)
	case "seed", "export":
		if len(args) > 2 {
			return fmt.Errorf("usage: neovndb trans %s [file.json]", args[0])
		}
		file := defaultCorpus
		if len(args) == 2 {
			file = args[1]
		}
		if args[0] == "export" {
			return transExport(ctx, file)
		}
		return transSeed(ctx, file)
	default:
		return fmt.Errorf("unknown trans command %q", args[0])
	}
}

func transStatus(ctx context.Context) error {
	_, store, err := open(ctx)
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
	var seed trans.Corpus
	if err := json.Unmarshal(raw, &seed); err != nil {
		return fmt.Errorf("reading %s: %w", path, err)
	}

	_, store, err := open(ctx)
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

	terms, passages, err := store.Seed(ctx, &seed)
	if err != nil {
		return err
	}
	fmt.Printf("seeded %d terms and %d passages into %s\n", terms, passages, lang)
	return nil
}

// transExport writes what the database holds -- including edits made on the
// admin page -- to a corpus file, by default the repository's own copy. The
// file is replaced whole, and only once the new one is written.
func transExport(ctx context.Context, path string) error {
	_, store, err := open(ctx)
	if err != nil {
		return err
	}
	defer store.Close()

	corpus, err := store.Corpus(ctx)
	if err != nil {
		return err
	}
	var buf bytes.Buffer
	if err := corpus.Encode(&buf); err != nil {
		return err
	}
	partial := path + ".partial"
	if err := os.WriteFile(partial, buf.Bytes(), 0o644); err != nil {
		return err
	}
	if err := os.Rename(partial, path); err != nil {
		os.Remove(partial)
		return err
	}
	terms := 0
	for _, pairs := range corpus.Terms {
		terms += len(pairs)
	}
	fmt.Printf("exported %d terms and %d passages to %s\n", terms, len(corpus.Passages), path)
	return nil
}
