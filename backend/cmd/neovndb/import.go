package main

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"time"

	"github.com/kobayashi/neovndb/internal/config"
	"github.com/kobayashi/neovndb/internal/db"
	"github.com/kobayashi/neovndb/internal/dump"
	"github.com/kobayashi/neovndb/internal/importer"
)

// A local archive is named after the day it was published, which is the same
// code the download path derives.
var localCode = regexp.MustCompile(`vndb-db-(\d{4})-?(\d{2})-?(\d{2})\.tar\.zst`)

func runImport(ctx context.Context, args []string) error {
	fs := flag.NewFlagSet("import", flag.ContinueOnError)
	file := fs.String("file", "", "import a local archive instead of downloading")
	promote := fs.Bool("promote", false, "go live once the import succeeds")
	force := fs.Bool("force", false, "promote even when the checks object")
	if err := fs.Parse(args); err != nil {
		return err
	}

	cfg, err := config.Load()
	if err != nil {
		return err
	}
	store, err := db.Open(ctx, cfg)
	if err != nil {
		return err
	}
	defer store.Close()

	path, code, sum, published, err := resolve(ctx, cfg, *file)
	if err != nil {
		return err
	}
	fmt.Printf("archive   %s\n", path)
	fmt.Printf("code      %s\n\n", code)

	started := time.Now()
	if err := store.CreateNext(ctx, code, cfg.DumpURL); err != nil {
		return fmt.Errorf("create schema: %w", err)
	}
	if err := store.SetNextSource(ctx, sum, published); err != nil {
		return err
	}

	counts, err := load(ctx, store, path)
	if err != nil {
		return err
	}

	fmt.Println("\nindexing")
	indexed := time.Now()
	if err := store.Index(ctx, db.SchemaNext); err != nil {
		return err
	}
	fmt.Printf("  %-22s %10s\n", "03_indexes.sql", time.Since(indexed).Round(time.Millisecond))

	fmt.Println("\nderiving")
	if err := store.Derive(ctx, db.SchemaNext, func(name string, took time.Duration) {
		fmt.Printf("  %-22s %10s\n", name, took.Round(time.Millisecond))
	}); err != nil {
		return err
	}

	// The derive step's tables are counted here so the recorded totals cover
	// the whole generation: an empty one is what a derive query that matched
	// nothing looks like, and the guard has no other way to see it.
	derived, err := store.DerivedCounts(ctx, db.SchemaNext)
	if err != nil {
		return err
	}
	for table, n := range derived {
		counts[table] = n
	}

	encoded, err := json.Marshal(counts)
	if err != nil {
		return err
	}
	if err := store.FinishNext(ctx, encoded); err != nil {
		return err
	}

	var total int64
	for _, n := range counts {
		total += n
	}
	fmt.Printf("\n%d rows across %d tables in %s\n",
		total, len(counts), time.Since(started).Round(time.Second))

	if !*promote {
		fmt.Println("staged in " + db.SchemaNext + "; run `db check` then `db promote`")
		return nil
	}
	if err := inspect(ctx, cfg, store, *force); err != nil {
		return err
	}
	if err := store.Promote(ctx); err != nil {
		return err
	}
	fmt.Printf("generation %s is now live\n", code)
	return nil
}

func load(ctx context.Context, store *db.Store, path string) (map[string]int64, error) {
	im := importer.New(store.Pool(), db.SchemaNext, func(table string, rows int64, took time.Duration) {
		fmt.Printf("  %-22s %9d rows  %6s\n", table, rows, took.Round(time.Millisecond))
	})
	return im.Load(ctx, path)
}

// resolve settles on an archive: a local file if given, otherwise whatever
// dl.vndb.org currently redirects `latest` to, downloading it only when the
// dump directory does not already hold it.
func resolve(ctx context.Context, cfg *config.Config, file string) (path, code, sum string, published *time.Time, err error) {
	if file != "" {
		m := localCode.FindStringSubmatch(filepath.Base(file))
		if m == nil {
			return "", "", "", nil, fmt.Errorf("cannot read a date out of %q", filepath.Base(file))
		}
		if _, err := os.Stat(file); err != nil {
			return "", "", "", nil, err
		}
		return file, m[1] + m[2] + m[3], "", nil, nil
	}

	rel, err := dump.Latest(ctx, cfg.DumpURL)
	if err != nil {
		return "", "", "", nil, err
	}
	fmt.Printf("upstream  %s (%.0f MB, published %s)\n",
		rel.Code, float64(rel.Size)/(1<<20), rel.PublishedAt.Format(time.DateOnly))

	path, sum, err = dump.Download(ctx, rel, cfg.DumpDir)
	if err != nil {
		return "", "", "", nil, err
	}
	return path, rel.Code, sum, &rel.PublishedAt, nil
}
