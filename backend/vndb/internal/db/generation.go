package db

import (
	"context"
	"crypto/sha256"
	"embed"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io/fs"
	"sort"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
)

// Schema and derivation SQL are embedded so a deployed binary can build the
// schema it expects.
//
//go:embed ddl/*.sql derive/*.sql
var sourceFS embed.FS

// Generation describes one import, read from that generation's own
// import_info row.
type Generation struct {
	Schema      string
	Code        string
	DumpURL     string
	DumpSHA256  *string
	PublishedAt *time.Time
	StartedAt   time.Time
	FinishedAt  *time.Time
	DDLChecksum string
}

// Complete reports whether the import that built this generation ran to the
// end. An incomplete `vndb_next` is a leftover from a failed run.
func (g *Generation) Complete() bool { return g.FinishedAt != nil }

// DDLChecksum hashes every embedded SQL file, schema and derivation alike, and
// is recorded into each generation: a live schema built by older source can
// then be told apart from what is on disk now.
func DDLChecksum() (string, error) {
	h := sha256.New()
	for _, dir := range []string{"ddl", "derive"} {
		files, err := sqlFiles(dir)
		if err != nil {
			return "", err
		}
		for _, f := range files {
			h.Write([]byte(f.name))
			h.Write(f.body)
		}
	}
	return hex.EncodeToString(h.Sum(nil)), nil
}

// Describe reads the import_info row of one schema. A missing schema is
// reported as (nil, nil): absence is an expected state, not a failure. So is
// one an import died making before import_info was there, which the next
// import drops: asked for the table, it would fail until then.
func (s *Store) Describe(ctx context.Context, schema string) (*Generation, error) {
	var exists bool
	if err := s.pool.QueryRow(ctx, `SELECT to_regclass($1) IS NOT NULL`,
		pgx.Identifier{schema, "import_info"}.Sanitize()).Scan(&exists); err != nil || !exists {
		return nil, err
	}

	g := &Generation{Schema: schema}
	err := s.pool.QueryRow(ctx, fmt.Sprintf(`
		SELECT code, dump_url, dump_sha256, published_at, started_at, finished_at, ddl_checksum
		  FROM %s.import_info LIMIT 1`, pgx.Identifier{schema}.Sanitize()),
	).Scan(&g.Code, &g.DumpURL, &g.DumpSHA256, &g.PublishedAt,
		&g.StartedAt, &g.FinishedAt, &g.DDLChecksum)
	if IsNotFound(err) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return g, nil
}

// CreateNext drops any leftover `vndb_next` and creates the tables, without
// indexes: building ~70 indexes once after seven million inserts is far
// cheaper than maintaining them. Index adds them.
func (s *Store) CreateNext(ctx context.Context, code, dumpURL string) error {
	files, err := sqlFiles("ddl")
	if err != nil {
		return err
	}
	checksum, err := DDLChecksum()
	if err != nil {
		return err
	}

	if err := s.ensureExtensions(ctx); err != nil {
		return err
	}

	next := pgx.Identifier{SchemaNext}.Sanitize()
	if _, err := s.pool.Exec(ctx, "DROP SCHEMA IF EXISTS "+next+" CASCADE"); err != nil {
		return err
	}
	if _, err := s.pool.Exec(ctx, "CREATE SCHEMA "+next); err != nil {
		return err
	}

	for _, f := range files {
		if isIndexFile(f.name) {
			continue
		}
		// The DDL is unqualified, so it lands wherever search_path points.
		if err := s.execIn(ctx, SchemaNext, string(f.body)); err != nil {
			return fmt.Errorf("apply %s: %w", f.name, err)
		}
	}
	return s.execIn(ctx, SchemaNext,
		`INSERT INTO import_info (code, dump_url, ddl_checksum) VALUES ($1, $2, $3)`,
		code, dumpURL, checksum)
}

// Promote makes `vndb_next` live. Schema renames are transactional, so the
// swap is atomic and needs no cooperation from the application: it always
// talks to `vndb`.
func (s *Store) Promote(ctx context.Context) error {
	g, err := s.Describe(ctx, SchemaNext)
	if err != nil {
		return err
	}
	if g == nil {
		return fmt.Errorf("no %s schema to promote", SchemaNext)
	}
	if !g.Complete() {
		return fmt.Errorf("generation %s is unfinished; refusing to promote", g.Code)
	}

	// On a first import there is nothing to demote, so the statement list is
	// built up front: a failed statement would abort the whole transaction.
	live, err := s.schemaExists(ctx, SchemaLive)
	if err != nil {
		return err
	}
	stmts := []string{dropSchema(SchemaPrev)}
	if live {
		stmts = append(stmts, renameSchema(SchemaLive, SchemaPrev))
	}
	stmts = append(stmts, renameSchema(SchemaNext, SchemaLive))

	return s.atomically(ctx, stmts)
}

// Rollback swaps the previous generation back into place.
func (s *Store) Rollback(ctx context.Context) error {
	prev, err := s.Describe(ctx, SchemaPrev)
	if err != nil {
		return err
	}
	if prev == nil {
		return fmt.Errorf("no %s schema to roll back to", SchemaPrev)
	}

	live, err := s.schemaExists(ctx, SchemaLive)
	if err != nil {
		return err
	}
	stmts := []string{dropSchema(SchemaNext)}
	if live {
		stmts = append(stmts, renameSchema(SchemaLive, SchemaNext))
	}
	stmts = append(stmts, renameSchema(SchemaPrev, SchemaLive))

	return s.atomically(ctx, stmts)
}

// Drop removes one generation schema. Guarded against the live one so a typo
// cannot take the site down.
func (s *Store) Drop(ctx context.Context, schema string) error {
	if schema == SchemaLive {
		return fmt.Errorf("refusing to drop the live schema")
	}
	_, err := s.pool.Exec(ctx, dropSchema(schema))
	return err
}

// atomically runs the schema swap in one transaction. Renames are
// transactional in Postgres, which is what makes going live a single step.
func (s *Store) atomically(ctx context.Context, stmts []string) error {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	for _, stmt := range stmts {
		if _, err := tx.Exec(ctx, stmt); err != nil {
			return err
		}
	}
	return tx.Commit(ctx)
}

func dropSchema(name string) string {
	return "DROP SCHEMA IF EXISTS " + pgx.Identifier{name}.Sanitize() + " CASCADE"
}

func renameSchema(from, to string) string {
	return "ALTER SCHEMA " + pgx.Identifier{from}.Sanitize() +
		" RENAME TO " + pgx.Identifier{to}.Sanitize()
}

// execIn runs a statement against one schema regardless of the pool's pinned
// search_path. SET LOCAL only holds inside a transaction, so the statement
// travels with it rather than leaving state on a pooled connection.
func (s *Store) execIn(ctx context.Context, schema, sql string, args ...any) error {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	path := pgx.Identifier{schema}.Sanitize() + ",public"
	if _, err := tx.Exec(ctx, "SET LOCAL search_path TO "+path); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, sql, args...); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

// ensureExtensions installs what the DDL relies on. Extensions are per
// database, not per generation, so this is idempotent and outside the swap.
func (s *Store) ensureExtensions(ctx context.Context) error {
	_, err := s.pool.Exec(ctx, `
		CREATE EXTENSION IF NOT EXISTS pg_trgm  WITH SCHEMA public;
		CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA public;`)
	return err
}

func (s *Store) schemaExists(ctx context.Context, schema string) (bool, error) {
	var exists bool
	err := s.pool.QueryRow(ctx,
		`SELECT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = $1)`, schema).Scan(&exists)
	return exists, err
}

// Index builds the access paths, after COPY and before the derived step, which
// is itself index-dependent.
func (s *Store) Index(ctx context.Context, schema string) error {
	files, err := sqlFiles("ddl")
	if err != nil {
		return err
	}
	for _, f := range files {
		if !isIndexFile(f.name) {
			continue
		}
		if err := s.execIn(ctx, schema, string(f.body)); err != nil {
			return fmt.Errorf("apply %s: %w", f.name, err)
		}
	}
	// Freshly copied tables carry no planner statistics, so without this the
	// derived step plans against an assumed empty database and picks nested
	// loops over sequential scans.
	return s.analyze(ctx, schema)
}

// analyze gathers planner statistics for every table of schema. A bare
// ANALYZE would do the whole database: the live generation, the previous one
// and the translations as well as the one being built. One statement per
// table: listed in one, the same tables took 9s rather than 2.5s (measured
// on a whole generation).
func (s *Store) analyze(ctx context.Context, schema string) error {
	rows, err := s.pool.Query(ctx, `SELECT tablename FROM pg_tables WHERE schemaname = $1`, schema)
	if err != nil {
		return err
	}
	names, err := pgx.CollectRows(rows, pgx.RowTo[string])
	if err != nil {
		return err
	}
	for _, name := range names {
		if _, err := s.pool.Exec(ctx, "ANALYZE "+pgx.Identifier{schema, name}.Sanitize()); err != nil {
			return err
		}
	}
	return nil
}

func isIndexFile(name string) bool { return strings.Contains(name, "_indexes") }

// Derive computes what vndb keeps but the dump omits: tag scores, trait
// inheritance, closures, cached VN columns and the search index. step is
// called after each file with its duration.
func (s *Store) Derive(ctx context.Context, schema string, step func(name string, took time.Duration)) error {
	files, err := sqlFiles("derive")
	if err != nil {
		return err
	}
	for _, f := range files {
		started := time.Now()
		if err := s.execIn(ctx, schema, string(f.body)); err != nil {
			return fmt.Errorf("derive %s: %w", f.name, err)
		}
		if step != nil {
			step(f.name, time.Since(started))
		}
	}
	// What the steps filled and updated has no statistics yet, so the first
	// queries after an import would pick bad plans without this.
	return s.analyze(ctx, schema)
}

// SetNextSource records where the pending generation's data came from. It is
// separate from CreateNext because a local archive has no published date and
// a re-run of an already downloaded one has no fresh digest.
func (s *Store) SetNextSource(ctx context.Context, sha256 string, published *time.Time) error {
	return s.execIn(ctx, SchemaNext,
		`UPDATE import_info
		    SET dump_sha256  = COALESCE(NULLIF($1, ''), dump_sha256),
		        published_at = COALESCE($2, published_at)`, sha256, published)
}

// FinishNext marks the pending generation complete and records what it loaded.
// Promote refuses a generation that never got here.
func (s *Store) FinishNext(ctx context.Context, counts []byte) error {
	return s.execIn(ctx, SchemaNext,
		`UPDATE import_info SET finished_at = now(), row_counts = $1`, counts)
}

type sqlFile struct {
	name string
	body []byte
}

func sqlFiles(dir string) ([]sqlFile, error) {
	entries, err := fs.ReadDir(sourceFS, dir)
	if err != nil {
		return nil, err
	}

	var files []sqlFile
	for _, e := range entries {
		if e.IsDir() || !strings.HasSuffix(e.Name(), ".sql") {
			continue
		}
		body, err := sourceFS.ReadFile(dir + "/" + e.Name())
		if err != nil {
			return nil, err
		}
		files = append(files, sqlFile{name: e.Name(), body: body})
	}
	sort.Slice(files, func(i, j int) bool { return files[i].name < files[j].name })
	return files, nil
}

// Derived names the tables the derive step builds. They are not in the dump,
// so nothing else counts them, and an empty one is the only sign that a derive
// query matched nothing.
var Derived = []string{
	"tags_vn_direct", "tags_vn_inherit", "chars_traits_inherit",
	"search_cache", "tags_closure", "traits_closure", "vn_similar", "withheld",
}

// HasWithheld says whether the live generation has the tables all-ages mode
// reads, which generations from before it lack, and those from before
// vn_allages (2026-11-06) half lack: both, or it cannot be masked.
func (s *Store) HasWithheld(ctx context.Context) (bool, error) {
	var ok bool
	err := s.pool.QueryRow(ctx, `SELECT to_regclass($1) IS NOT NULL AND to_regclass($2) IS NOT NULL`,
		pgx.Identifier{SchemaLive, "withheld"}.Sanitize(),
		pgx.Identifier{SchemaLive, "vn_allages"}.Sanitize()).Scan(&ok)
	return ok, err
}

// WithheldVersion names the live generation's withheld table as built: its
// oid, which a rebuild changes, or 0 where there is none. Masked cache keys
// carry it, so answers made from the old list are not served after a rebuild.
func (s *Store) WithheldVersion(ctx context.Context) (uint32, error) {
	var oid uint32
	err := s.pool.QueryRow(ctx, `SELECT COALESCE(to_regclass($1)::oid, 0)`,
		pgx.Identifier{SchemaLive, "withheld"}.Sanitize()).Scan(&oid)
	return oid, err
}

// withheldBuild is where BuildWithheld fills the new table, inside its
// transaction, so the old one goes on answering until the swap.
const withheldBuild = "withheld_build"

// BuildWithheld makes the live generation's withheld table afresh from what
// it already holds, with the DDL and rules an import uses: a generation from
// before all-ages mode gets it without a whole import, and one whose rules
// changed is brought up to them. One transaction, so readers see the old
// table or the new one, and the new one is filled beside the old: readers
// wait only for the swap at the end, not the seconds the rules take. Callers
// hold ImportLock, so no promote moves the schema underneath.
func (s *Store) BuildWithheld(ctx context.Context) (map[string]int64, error) {
	table, err := sourceFS.ReadFile("ddl/02_withheld.sql")
	if err != nil {
		return nil, err
	}
	rules, err := sourceFS.ReadFile("derive/06_withheld.sql")
	if err != nil {
		return nil, err
	}
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)
	live, build := pgx.Identifier{SchemaLive}.Sanitize(), pgx.Identifier{withheldBuild}.Sanitize()
	for _, sql := range []string{
		"CREATE SCHEMA " + build,
		// The new table lands in the first schema; the rules read the live
		// generation's tables through the second.
		"SET LOCAL search_path TO " + build + "," + live + ",public",
		string(table),
		string(rules),
		"ANALYZE withheld",
		"ANALYZE vn_allages",
		"DROP TABLE IF EXISTS " + live + ".withheld, " + live + ".vn_allages",
		"ALTER TABLE " + build + ".withheld SET SCHEMA " + live,
		"ALTER TABLE " + build + ".vn_allages SET SCHEMA " + live,
		"DROP SCHEMA " + build,
		"SET LOCAL search_path TO " + live + ",public",
	} {
		if _, err := tx.Exec(ctx, sql); err != nil {
			return nil, fmt.Errorf("building withheld: %w", err)
		}
	}
	counts, err := withheldCounts(ctx, tx)
	if err != nil {
		return nil, err
	}
	return counts, tx.Commit(ctx)
}

// WithheldCounts is how many of each type the live generation withholds, or
// nil where it has no such table.
func (s *Store) WithheldCounts(ctx context.Context) (map[string]int64, error) {
	ready, err := s.HasWithheld(ctx)
	if err != nil || !ready {
		return nil, err
	}
	return withheldCounts(ctx, s.pool)
}

func withheldCounts(ctx context.Context, q querier) (map[string]int64, error) {
	rows, err := q.Query(ctx, `SELECT entity_type, COUNT(*) FROM withheld GROUP BY 1`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[string]int64{}
	for rows.Next() {
		var kind string
		var n int64
		if err := rows.Scan(&kind, &n); err != nil {
			return nil, err
		}
		out[kind] = n
	}
	return out, rows.Err()
}

// DerivedCounts counts what the derive step built, so the recorded row counts
// cover the whole generation rather than only what was copied in. A table a
// generation does not have -- it was built before the table was added -- is
// left out rather than counted as empty, so the guard sees it as new.
func (s *Store) DerivedCounts(ctx context.Context, schema string) (map[string]int64, error) {
	counts := make(map[string]int64, len(Derived))
	for _, table := range Derived {
		var exists bool
		if err := s.pool.QueryRow(ctx, `SELECT to_regclass($1) IS NOT NULL`,
			pgx.Identifier{schema, table}.Sanitize()).Scan(&exists); err != nil {
			return nil, err
		}
		if !exists {
			continue
		}
		var n int64
		err := s.pool.QueryRow(ctx,
			fmt.Sprintf(`SELECT COUNT(*) FROM %s.%s`, pgx.Identifier{schema}.Sanitize(), table)).Scan(&n)
		if err != nil {
			return nil, fmt.Errorf("count %s: %w", table, err)
		}
		counts[table] = n
	}
	return counts, nil
}

// Counts reads back what an import recorded for a generation.
func (s *Store) Counts(ctx context.Context, schema string) (map[string]int64, error) {
	var raw []byte
	err := s.pool.QueryRow(ctx,
		fmt.Sprintf(`SELECT row_counts FROM %s.import_info`, pgx.Identifier{schema}.Sanitize())).Scan(&raw)
	if err != nil {
		return nil, err
	}
	counts := map[string]int64{}
	if err := json.Unmarshal(raw, &counts); err != nil {
		return nil, fmt.Errorf("row_counts of %s: %w", schema, err)
	}
	return counts, nil
}
