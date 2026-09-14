package img

import (
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
)

// A Store is one directory of image files addressed the way vndb addresses
// them: kind, shard, number. Two of these exist -- the mirror, holding
// upstream bytes untouched, and the derived cache, holding a resized copy per
// width -- and they behave identically, which is why one type serves both.
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

func (s *Store) Has(ref Ref) bool {
	_, err := os.Stat(s.Path(ref))
	return err == nil
}

// Write puts the bytes at the image's path, and does it in one step as seen by
// any other reader: a temporary file in the same directory, then a rename.
// Without that a reverse proxy serving hits straight off disk would sooner or
// later hand out a half-written file, since it has no way to ask whether a
// write is in progress.
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
