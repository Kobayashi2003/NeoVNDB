// Package importer loads a VNDB archive into a fresh generation schema.
package importer

import (
	"context"
	"errors"
	"fmt"
	"io"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/kobayashi/neovndb/internal/dump"
)

const nullField = `\N`

// Progress is called after each table so the caller can report movement
// without the importer knowing anything about output.
type Progress func(table string, rows int64, took time.Duration)

type Importer struct {
	pool     *pgxpool.Pool
	schema   string
	progress Progress

	// Voters who lost tag permission. Only about two hundred accounts, so the
	// deny set is kept rather than the whole users table -- and an unknown
	// voter is then allowed by construction, matching vndb's LEFT JOIN.
	denied map[string]bool
}

func New(pool *pgxpool.Pool, schema string, progress Progress) *Importer {
	if progress == nil {
		progress = func(string, int64, time.Duration) {}
	}
	return &Importer{pool: pool, schema: schema, progress: progress}
}

// Load streams every wanted table out of the archive and into the schema.
// It returns the row count per table.
func (im *Importer) Load(ctx context.Context, path string) (map[string]int64, error) {
	// Column names live in .header members that follow their table, so they
	// have to be collected before anything can be interpreted.
	headers, err := dump.Headers(path)
	if err != nil {
		return nil, fmt.Errorf("read headers: %w", err)
	}
	// tags_vn needs users.perm_tag and users sits after it in the archive, so
	// permissions are resolved in their own pass first.
	denied, err := readDeniedVoters(path, headers)
	if err != nil {
		return nil, fmt.Errorf("read permissions: %w", err)
	}
	im.denied = denied

	archive, err := dump.Open(path, headers)
	if err != nil {
		return nil, err
	}
	defer archive.Close()

	counts := map[string]int64{}
	for {
		table, err := archive.Next()
		if errors.Is(err, io.EOF) {
			break
		}
		if err != nil {
			return counts, err
		}
		if skipped[table.Name] {
			continue
		}
		s, ok := specFor(table.Name)
		if !ok {
			continue
		}

		started := time.Now()
		n, err := im.copyTable(ctx, s, table)
		if err != nil {
			return counts, fmt.Errorf("load %s: %w", table.Name, err)
		}
		counts[table.Name] = n
		im.progress(table.Name, n, time.Since(started))
	}
	return counts, nil
}

// copyTable rewrites rows as COPY text and streams them into Postgres, which
// parses the column types itself -- the same path the dump's own import.sql
// takes, so no per-column conversion lives here.
func (im *Importer) copyTable(ctx context.Context, s spec, table *dump.Table) (int64, error) {
	targets, transform := im.plan(s, table.Columns)

	conn, err := im.pool.Acquire(ctx)
	if err != nil {
		return 0, err
	}
	defer conn.Release()

	reader, writer := io.Pipe()
	// The count travels back over a channel rather than a shared variable, so
	// it is read only after the writer has finished producing it.
	counted := make(chan int64, 1)

	go func() {
		var rows int64
		var buf strings.Builder
		out := make([]string, 0, len(targets))
		defer func() { counted <- rows }()

		for table.Rows.Scan() {
			line, err := transform(strings.Split(table.Rows.Text(), "\t"), out[:0])
			if err != nil {
				writer.CloseWithError(err)
				return
			}
			buf.Reset()
			for i, f := range line {
				if i > 0 {
					buf.WriteByte('\t')
				}
				buf.WriteString(f)
			}
			buf.WriteByte('\n')
			if _, err := io.WriteString(writer, buf.String()); err != nil {
				writer.CloseWithError(err)
				return
			}
			rows++
		}
		writer.CloseWithError(table.Rows.Err())
	}()

	sql := fmt.Sprintf("COPY %s.%s (%s) FROM STDIN",
		pgx.Identifier{im.schema}.Sanitize(),
		pgx.Identifier{s.table}.Sanitize(),
		quoteAll(targets))
	_, err = conn.Conn().PgConn().CopyFrom(ctx, reader, sql)
	rows := <-counted
	if err != nil {
		reader.CloseWithError(err)
		return 0, err
	}
	return rows, nil
}

// plan resolves a spec against the header actually present in this archive,
// returning the target column list and the row transform. Matching by name
// rather than position means an upstream column reorder does not corrupt a
// load.
func (im *Importer) plan(s spec, header []string) ([]string, func([]string, []string) ([]string, error)) {
	index := make(map[string]int, len(header))
	for i, name := range header {
		index[name] = i
	}

	if s.table == "tags_vn" {
		return s.columns, im.tagVoteRow(index)
	}
	if s.rewrite != nil {
		rewrite := s.rewrite
		return s.columns, func(fields, out []string) ([]string, error) {
			return rewrite(named(index, fields), out)
		}
	}

	// The common case: keep every column, converting the ones that hold ids.
	isID := make([]bool, len(header))
	for _, name := range s.ids {
		if i, ok := index[name]; ok {
			isID[i] = true
		}
	}
	return header, func(fields, out []string) ([]string, error) {
		for i, f := range fields {
			if i < len(isID) && isID[i] {
				n, err := numericID(f)
				if err != nil {
					return nil, fmt.Errorf("column %s: %w", header[i], err)
				}
				f = n
			}
			out = append(out, f)
		}
		return out, nil
	}
}

// tagVoteRow drops uid and appends counts, the flag that says whether this
// vote is allowed to affect a tag score.
func (im *Importer) tagVoteRow(index map[string]int) func([]string, []string) ([]string, error) {
	return func(fields, out []string) ([]string, error) {
		f := named(index, fields)
		tag, err := numericID(f["tag"])
		if err != nil {
			return nil, err
		}
		vid, err := numericID(f["vid"])
		if err != nil {
			return nil, err
		}
		counts := "f"
		if f["ignore"] != "t" && !im.denied[f["uid"]] {
			counts = "t"
		}
		return append(out, f["date"], tag, vid, f["vote"], f["spoiler"],
			f["ignore"], f["lie"], f["notes"], counts), nil
	}
}

// readDeniedVoters collects the accounts that may no longer tag. Stops as soon
// as the users table has been read.
func readDeniedVoters(path string, headers map[string][]string) (map[string]bool, error) {
	archive, err := dump.Open(path, headers)
	if err != nil {
		return nil, err
	}
	defer archive.Close()

	for {
		table, err := archive.Next()
		if errors.Is(err, io.EOF) {
			return nil, errors.New("archive has no users table")
		}
		if err != nil {
			return nil, err
		}
		if table.Name != "users" {
			continue
		}

		index := map[string]int{}
		for i, name := range table.Columns {
			index[name] = i
		}
		id, perm := index["id"], index["perm_tag"]

		denied := map[string]bool{}
		for table.Rows.Scan() {
			fields := strings.Split(table.Rows.Text(), "\t")
			if fields[perm] != "t" {
				denied[fields[id]] = true
			}
		}
		return denied, table.Rows.Err()
	}
}

// numericID drops the letter prefix from a vndb id: 'v17' becomes '17'.
func numericID(value string) (string, error) {
	if value == nullField || value == "" {
		return value, nil
	}
	i := 0
	for i < len(value) && value[i] >= 'a' && value[i] <= 'z' {
		i++
	}
	if i == 0 || i == len(value) {
		return "", fmt.Errorf("not an id: %q", value)
	}
	if _, err := strconv.Atoi(value[i:]); err != nil {
		return "", fmt.Errorf("not an id: %q", value)
	}
	return value[i:], nil
}

// splitID separates the kind from the number: 'cv20339' becomes 'cv', '20339'.
func splitID(value string) (kind, num string, err error) {
	if value == nullField || value == "" {
		return nullField, nullField, nil
	}
	i := 0
	for i < len(value) && value[i] >= 'a' && value[i] <= 'z' {
		i++
	}
	if i == 0 || i == len(value) {
		return "", "", fmt.Errorf("not an id: %q", value)
	}
	return value[:i], value[i:], nil
}

func named(index map[string]int, fields []string) map[string]string {
	out := make(map[string]string, len(index))
	for name, i := range index {
		if i < len(fields) {
			out[name] = fields[i]
		}
	}
	return out
}

func quoteAll(columns []string) string {
	quoted := make([]string, len(columns))
	for i, c := range columns {
		quoted[i] = pgx.Identifier{c}.Sanitize()
	}
	return strings.Join(quoted, ", ")
}
