// Package dump reads VNDB database archives: a zstd tar of COPY-format table
// files, each with a .header file of column names. Read as a stream so only
// wanted tables are decoded. Headers follow their tables, so Headers must
// collect them before any table can be read.
package dump

import (
	"archive/tar"
	"bufio"
	"errors"
	"fmt"
	"io"
	"os"
	"strings"

	"github.com/klauspost/compress/zstd"
)

// Rows can be long: a VN description runs to a few KB, and bufio's default
// 64KB limit would split one.
const maxRowSize = 4 << 20

// Table is one table inside the archive: its column names and a reader over
// its rows. The reader is only valid until the next call to Next.
type Table struct {
	Name    string
	Columns []string
	Rows    *bufio.Scanner
}

// Archive walks the table members of one .tar.zst.
type Archive struct {
	file    *os.File
	zr      *zstd.Decoder
	tr      *tar.Reader
	headers map[string][]string
}

// Open prepares a walk. headers comes from a prior call to Headers.
func Open(path string, headers map[string][]string) (*Archive, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	zr, err := zstd.NewReader(f)
	if err != nil {
		f.Close()
		return nil, err
	}
	return &Archive{file: f, zr: zr, tr: tar.NewReader(zr.IOReadCloser()), headers: headers}, nil
}

func (a *Archive) Close() error {
	a.zr.Close()
	return a.file.Close()
}

// Next advances to the following table, returning io.EOF when the archive is
// exhausted. A caller that has everything it needs can stop early.
func (a *Archive) Next() (*Table, error) {
	for {
		h, err := a.tr.Next()
		if err != nil {
			return nil, err
		}
		if h.Typeflag != tar.TypeReg ||
			!strings.HasPrefix(h.Name, "db/") ||
			strings.HasSuffix(h.Name, ".header") {
			continue
		}

		name := strings.TrimPrefix(h.Name, "db/")
		columns, ok := a.headers[name]
		if !ok {
			return nil, fmt.Errorf("no header for table %q", name)
		}
		rows := bufio.NewScanner(a.tr)
		rows.Buffer(make([]byte, 0, 64*1024), maxRowSize)
		return &Table{Name: name, Columns: columns, Rows: rows}, nil
	}
}

// Headers reads every .header member. They total a few kilobytes, so this pass
// costs one decompression and nothing else.
func Headers(path string) (map[string][]string, error) {
	a, err := Open(path, nil)
	if err != nil {
		return nil, err
	}
	defer a.Close()

	headers := map[string][]string{}
	for {
		h, err := a.tr.Next()
		if errors.Is(err, io.EOF) {
			return headers, nil
		}
		if err != nil {
			return nil, err
		}
		name, ok := strings.CutSuffix(strings.TrimPrefix(h.Name, "db/"), ".header")
		if !ok || h.Typeflag != tar.TypeReg {
			continue
		}
		line, err := io.ReadAll(a.tr)
		if err != nil {
			return nil, err
		}
		headers[name] = strings.Split(strings.TrimRight(string(line), "\r\n"), "\t")
	}
}
