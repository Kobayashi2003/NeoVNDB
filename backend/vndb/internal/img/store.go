package img

import (
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
)

// A Store is a directory of images addressed as vndb does (kind, shard,
// number). Used twice: the byte-exact mirror and the resized cache.
type Store struct{ root string }

func NewStore(root string) *Store { return &Store{root: root} }

// Path is where an image lives. It mirrors the upstream URL exactly, so a
// reverse proxy can answer a hit by serving the file the request names,
// without the process this package runs ever waking up.
func (s *Store) Path(ref Ref) string {
	return filepath.Join(s.root, ref.Kind, fmt.Sprintf("%02d", ref.Shard()), fmt.Sprintf("%d.jpg", ref.Num))
}

func (s *Store) Read(ref Ref) ([]byte, error) {
	b, err := os.ReadFile(s.Path(ref))
	if errors.Is(err, os.ErrNotExist) {
		return nil, ErrMissing
	}
	return b, err
}

// Write is atomic for readers (temporary file, then rename), since the edge
// serves files straight off disk and could otherwise send a partial one.
func (s *Store) Write(ref Ref, data []byte) error {
	path := s.Path(ref)
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}

	tmp, err := os.CreateTemp(filepath.Dir(path), ".tmp-*")
	if err != nil {
		return err
	}
	defer os.Remove(tmp.Name())

	if _, err := tmp.Write(data); err != nil {
		tmp.Close()
		return err
	}
	if err := tmp.Close(); err != nil {
		return err
	}
	return os.Rename(tmp.Name(), path)
}

// ReadFrom stores what the reader gives, refusing anything longer than max.
// The limit is on the body rather than on a declared length because an
// upstream that lies about Content-Length would otherwise fill the disk.
func (s *Store) ReadFrom(ref Ref, r io.Reader, max int64) ([]byte, error) {
	data, err := io.ReadAll(io.LimitReader(r, max+1))
	if err != nil {
		return nil, err
	}
	if int64(len(data)) > max {
		return nil, fmt.Errorf("image is larger than %d bytes", max)
	}
	return data, s.Write(ref, data)
}

var ErrMissing = errors.New("not in the store")
