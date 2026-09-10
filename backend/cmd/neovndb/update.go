package main

import (
	"context"
	"flag"
	"fmt"

	"github.com/kobayashi/neovndb/internal/config"
	"github.com/kobayashi/neovndb/internal/db"
	"github.com/kobayashi/neovndb/internal/dump"
)

// runUpdate is the whole weekly cycle in one command, and the same command a
// person runs by hand: an update path that only ever runs unattended is one
// nobody can reproduce when it fails.
func runUpdate(ctx context.Context, args []string) error {
	fs := flag.NewFlagSet("update", flag.ContinueOnError)
	force := fs.Bool("force", false, "go live even when the checks object")
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

	rel, err := dump.Latest(ctx, cfg.DumpURL)
	if err != nil {
		return fmt.Errorf("check upstream: %w", err)
	}

	live, err := store.Describe(ctx, db.SchemaLive)
	if err != nil {
		return err
	}
	switch {
	case live == nil:
		fmt.Printf("upstream  %s; nothing is live yet\n", rel.Code)
	case live.Code == rel.Code:
		fmt.Printf("upstream  %s; already live, nothing to do\n", rel.Code)
		return nil
	case live.Code > rel.Code:
		// Upstream republishing an older archive is the shape a mirror
		// problem takes, and importing it would lose a week of edits.
		return fmt.Errorf("upstream offers %s but %s is live; refusing to go backwards",
			rel.Code, live.Code)
	default:
		fmt.Printf("upstream  %s, live %s\n", rel.Code, live.Code)
	}

	importArgs := []string{"-promote"}
	if *force {
		importArgs = append(importArgs, "-force")
	}
	return runImport(ctx, importArgs)
}
