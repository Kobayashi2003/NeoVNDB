package main

import (
	"context"
	"fmt"
	"io"

	"github.com/kobayashi/neovndb/internal/config"
	"github.com/kobayashi/neovndb/internal/db"
	"github.com/kobayashi/neovndb/internal/db/guard"
)

// inspect refuses to let a suspect import go live. See internal/db/guard.
func inspect(ctx context.Context, out io.Writer, cfg *config.Config, store *db.Store, force bool) error {
	next, err := store.Describe(ctx, db.SchemaNext)
	if err != nil {
		return err
	}
	if next == nil {
		return fmt.Errorf("nothing staged in %s", db.SchemaNext)
	}

	live, err := store.Describe(ctx, db.SchemaLive)
	if err != nil {
		return err
	}
	if live == nil {
		fmt.Fprintln(out, "checks    skipped: no live generation to compare against")
		return nil
	}

	before, err := counts(ctx, store, db.SchemaLive)
	if err != nil {
		return err
	}
	after, err := counts(ctx, store, db.SchemaNext)
	if err != nil {
		return err
	}

	g := guard.Default(cfg.GuardMaxLoss, db.Derived)
	found := g.Inspect(
		guard.Snapshot{Code: live.Code, Tables: before},
		guard.Snapshot{Code: next.Code, Tables: after},
	)

	fmt.Fprintf(out, "checks    %s against %s (%v, max loss %.0f%%)\n",
		next.Code, live.Code, g.Names(), cfg.GuardMaxLoss*100)
	if len(found) == 0 {
		fmt.Fprintln(out, "          all clear")
		return nil
	}
	for _, f := range found {
		fmt.Fprintln(out, "          "+f.String())
	}
	if force {
		fmt.Fprintln(out, "          overridden by -force")
		return nil
	}
	return fmt.Errorf("%d check(s) object; inspect the archive, or pass -force to promote anyway", len(found))
}

// counts reads what an import recorded, counting the derive step's tables
// itself when absent -- a generation imported before those were recorded would
// otherwise look as though the derive step never ran.
func counts(ctx context.Context, store *db.Store, schema string) (map[string]int64, error) {
	recorded, err := store.Counts(ctx, schema)
	if err != nil {
		return nil, err
	}
	for _, table := range db.Derived {
		if _, ok := recorded[table]; ok {
			continue
		}
		live, err := store.DerivedCounts(ctx, schema)
		if err != nil {
			return nil, err
		}
		for name, n := range live {
			if _, ok := recorded[name]; !ok {
				recorded[name] = n
			}
		}
		break
	}
	return recorded, nil
}
