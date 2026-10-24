package main

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"regexp"
	"time"

	"github.com/kobayashi/neovndb/internal/config"
	"github.com/kobayashi/neovndb/internal/db"
	"github.com/kobayashi/neovndb/internal/db/similar"
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

	cfg, store, err := open(ctx)
	if err != nil {
		return err
	}
	defer store.Close()

	return importArchive(ctx, os.Stdout, cfg, store, *file, *promote, *force)
}

// importArchive builds vndb_next from an archive (a local file, or upstream's
// latest) and, if asked, promotes it.
func importArchive(ctx context.Context, out io.Writer, cfg *config.Config, store *db.Store, file string, promote, force bool) error {
	return store.Exclusive(ctx, db.ImportLock, func() error {
		return importLocked(ctx, out, cfg, store, file, promote, force)
	})
}

func importLocked(ctx context.Context, out io.Writer, cfg *config.Config, store *db.Store, file string, promote, force bool) error {
	path, code, sum, published, err := resolve(ctx, out, cfg, file)
	if err != nil {
		return err
	}
	fmt.Fprintf(out, "archive   %s\n", path)
	fmt.Fprintf(out, "code      %s\n\n", code)

	started := time.Now()
	if err := store.CreateNext(ctx, code, cfg.DumpURL); err != nil {
		return fmt.Errorf("create schema: %w", err)
	}
	if err := store.SetNextSource(ctx, sum, published); err != nil {
		return err
	}

	counts, err := load(ctx, out, store, path)
	if err != nil {
		return err
	}

	fmt.Fprintln(out, "\nindexing")
	indexed := time.Now()
	if err := store.Index(ctx, db.SchemaNext); err != nil {
		return err
	}
	fmt.Fprintf(out, "  %-22s %10s\n", "03_indexes.sql", time.Since(indexed).Round(time.Millisecond))

	fmt.Fprintln(out, "\nderiving")
	if err := store.Derive(ctx, db.SchemaNext, func(name string, took time.Duration) {
		fmt.Fprintf(out, "  %-22s %10s\n", name, took.Round(time.Millisecond))
	}); err != nil {
		return err
	}
	// The one derived table SQL cannot build at a sensible cost.
	built := time.Now()
	if _, err := similar.Build(ctx, store.Pool(), db.SchemaNext); err != nil {
		return fmt.Errorf("similar works: %w", err)
	}
	fmt.Fprintf(out, "  %-22s %10s\n", "similar (Go)", time.Since(built).Round(time.Millisecond))

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
	fmt.Fprintf(out, "\n%d rows across %d tables in %s\n",
		total, len(counts), time.Since(started).Round(time.Second))

	if !promote {
		fmt.Fprintln(out, "staged in "+db.SchemaNext+"; run `db check` then `db promote`")
		return nil
	}
	if err := inspect(ctx, out, cfg, store, force); err != nil {
		return err
	}
	if err := store.Promote(ctx); err != nil {
		return err
	}
	fmt.Fprintf(out, "generation %s is now live\n", code)

	if cfg.DumpKeep > 0 {
		removed, err := dump.Prune(cfg.DumpDir, cfg.DumpKeep, path)
		for _, p := range removed {
			fmt.Fprintf(out, "removed   %s\n", p)
		}
		if err != nil {
			// The new generation is live; a leftover archive only costs disk.
			fmt.Fprintf(out, "pruning archives: %v\n", err)
		}
	}
	return nil
}

func load(ctx context.Context, out io.Writer, store *db.Store, path string) (map[string]int64, error) {
	im := importer.New(store.Pool(), db.SchemaNext, func(table string, rows int64, took time.Duration) {
		fmt.Fprintf(out, "  %-22s %9d rows  %6s\n", table, rows, took.Round(time.Millisecond))
	})
	return im.Load(ctx, path)
}

// resolve settles on an archive: a local file if given, otherwise whatever
// dl.vndb.org currently redirects `latest` to, downloading it only when the
// dump directory does not already hold it.
func resolve(ctx context.Context, out io.Writer, cfg *config.Config, file string) (path, code, sum string, published *time.Time, err error) {
	if file != "" {
		m := localCode.FindStringSubmatch(filepath.Base(file))
		if m == nil {
			return "", "", "", nil, fmt.Errorf("cannot read a date out of %q", filepath.Base(file))
		}
		if _, err := os.Stat(file); err != nil {
			return "", "", "", nil, err
		}
		// The name's date stands in for the publication date upstream would
		// have given; without one the generation would have none.
		day, err := time.Parse("20060102", m[1]+m[2]+m[3])
		if err != nil {
			return "", "", "", nil, err
		}
		return file, m[1] + m[2] + m[3], "", &day, nil
	}

	rel, err := dump.Latest(ctx, cfg.DumpURL)
	if err != nil {
		return "", "", "", nil, fmt.Errorf("check %w: %w", errUpstream, err)
	}
	fmt.Fprintf(out, "upstream  %s (%.0f MB, published %s)\n",
		rel.Code, float64(rel.Size)/(1<<20), rel.PublishedAt.Format(time.DateOnly))

	path, sum, err = dump.Download(ctx, rel, cfg.DumpDir)
	if err != nil {
		return "", "", "", nil, fmt.Errorf("download from %w: %w", errUpstream, err)
	}
	return path, rel.Code, sum, &rel.PublishedAt, nil
}
