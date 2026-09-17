// Command neovndb is the single binary for every backend role. Later roles
// (import, serve) become subcommands here, so a deployment stays one artifact.
package main

import (
	"context"
	"flag"
	"fmt"
	"os"
	"os/signal"
	"syscall"
	"text/tabwriter"
	"time"

	"github.com/kobayashi/neovndb/internal/config"
	"github.com/kobayashi/neovndb/internal/db"
)

const usage = `neovndb

  serve  [--addr host:port]              run the read-only HTTP API
  images [--addr host:port]              run the image mirror
  import [--file p] [--promote] [--force] load an archive into vndb_next
  update [--force]                       import and go live if upstream is newer

  db status              generations, DDL freshness and row counts
  db init <code>         build an empty vndb_next from the embedded DDL
  db check               compare vndb_next with the live generation
  db promote [--force]   run db check, then swap vndb_next into place (atomic)
  db rollback            swap vndb_prev back
  db drop <schema>       drop one generation schema
  db verify              round-trip the generated query layer, then roll back

  trans status           what the translation corpus holds
  trans seed <file>      load a corpus; refuses the file if any markup is lost`

func main() {
	if err := run(); err != nil {
		fmt.Fprintln(os.Stderr, "error:", err)
		os.Exit(1)
	}
}

func run() error {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	args := os.Args[1:]
	if len(args) == 0 {
		fmt.Println(usage)
		return nil
	}

	switch args[0] {
	case "serve":
		return runServe(ctx, args[1:])
	case "images":
		return runImages(ctx, args[1:])
	case "import":
		return runImport(ctx, args[1:])
	case "update":
		return runUpdate(ctx, args[1:])
	case "db":
		return runDB(ctx, args[1:])
	case "trans":
		return runTrans(ctx, args[1:])
	case "help", "-h", "--help":
		fmt.Println(usage)
		return nil
	default:
		fmt.Println(usage)
		return fmt.Errorf("unknown command %q", args[0])
	}
}

func runDB(ctx context.Context, args []string) error {
	if len(args) == 0 {
		return fmt.Errorf("db: expected status, init, promote, rollback, drop or verify")
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

	switch args[0] {
	case "status":
		return status(ctx, store)
	case "init":
		if len(args) < 2 {
			return fmt.Errorf("db init: expected a generation code, e.g. 20260903")
		}
		return initGeneration(ctx, store, args[1], cfg.DumpURL)
	case "check":
		return inspect(ctx, cfg, store, false)
	case "promote":
		return promote(ctx, cfg, store, args[1:])
	case "rollback":
		return rollback(ctx, store)
	case "drop":
		if len(args) < 2 {
			return fmt.Errorf("db drop: expected a schema name")
		}
		return drop(ctx, store, args[1])
	case "verify":
		return verify(ctx, store)
	default:
		return fmt.Errorf("db: unknown subcommand %q", args[0])
	}
}

func status(ctx context.Context, store *db.Store) error {
	st, err := store.Status(ctx)
	if err != nil {
		return err
	}

	fmt.Printf("server    %s\n", st.Server)
	fmt.Printf("database  %s as %s\n", st.Database, st.User)
	fmt.Printf("size      %.1f MB\n", float64(st.SizeBytes)/(1<<20))
	fmt.Printf("pool      %d acquired, %d idle, ping %s\n",
		st.Acquired, st.Idle, st.Latency.Round(time.Microsecond))

	w := tabwriter.NewWriter(os.Stdout, 0, 0, 2, ' ', 0)
	if len(st.Generations) == 0 {
		fmt.Println("\nno generation schema exists yet -- run `db init <code>`")
	} else {
		fmt.Fprintln(w, "\nSCHEMA\tCODE\tSTATE\tDDL")
		for _, g := range st.Generations {
			state := "importing"
			if g.Complete() {
				state = "complete"
			}
			fmt.Fprintf(w, "%s\t%s\t%s\t%s\n", g.Schema, g.Code, state, g.DDLChecksum[:12])
		}
	}
	if st.DDLStale {
		fmt.Fprintln(w, "\nthe live generation was built by older DDL -- re-import to apply changes")
	}
	if len(st.Tables) > 0 {
		fmt.Fprintln(w, "\nTABLE\tROWS")
		for _, t := range st.Tables {
			fmt.Fprintf(w, "%s\t%d\n", t.Name, t.Rows)
		}
	}
	return w.Flush()
}

func initGeneration(ctx context.Context, store *db.Store, code, dumpURL string) error {
	if err := store.CreateNext(ctx, code, dumpURL); err != nil {
		return err
	}
	fmt.Printf("%s built for generation %s\n", db.SchemaNext, code)
	return nil
}

func promote(ctx context.Context, cfg *config.Config, store *db.Store, args []string) error {
	fs := flag.NewFlagSet("db promote", flag.ContinueOnError)
	force := fs.Bool("force", false, "promote even when the checks object")
	if err := fs.Parse(args); err != nil {
		return err
	}
	if err := inspect(ctx, cfg, store, *force); err != nil {
		return err
	}
	if err := store.Promote(ctx); err != nil {
		return err
	}
	g, err := store.Describe(ctx, db.SchemaLive)
	if err != nil {
		return err
	}
	fmt.Printf("generation %s is now live\n", g.Code)
	return nil
}

func rollback(ctx context.Context, store *db.Store) error {
	if err := store.Rollback(ctx); err != nil {
		return err
	}
	g, err := store.Describe(ctx, db.SchemaLive)
	if err != nil {
		return err
	}
	fmt.Printf("rolled back to generation %s\n", g.Code)
	return nil
}

func drop(ctx context.Context, store *db.Store, schema string) error {
	if err := store.Drop(ctx, schema); err != nil {
		return err
	}
	fmt.Println("dropped", schema)
	return nil
}

func verify(ctx context.Context, store *db.Store) error {
	steps, err := store.Verify(ctx)
	for _, step := range steps {
		fmt.Println(" ", step)
	}
	if err != nil {
		return err
	}
	fmt.Println("\nquery layer OK")
	return nil
}
