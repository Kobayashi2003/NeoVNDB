package db

import (
	"context"
	"errors"
	"fmt"
)

// ImportLock is held by whatever builds or swaps generations -- an import,
// a promote, a rollback -- so two of them never interleave.
const ImportLock = "neovndb import"

// ErrBusy means another process holds the lock.
var ErrBusy = errors.New("another run holds the lock")

// Exclusive runs fn while holding a Postgres advisory lock named name, so a
// scheduled run and one started by hand never overlap. It does not wait: a
// held lock is ErrBusy.
func (s *Store) Exclusive(ctx context.Context, name string, fn func() error) error {
	conn, err := s.pool.Acquire(ctx)
	if err != nil {
		return err
	}
	defer conn.Release()

	var got bool
	if err := conn.QueryRow(ctx, `SELECT pg_try_advisory_lock(hashtext($1))`, name).Scan(&got); err != nil {
		return err
	}
	if !got {
		return fmt.Errorf("%s: %w", name, ErrBusy)
	}
	// The lock belongs to the session, and the pool keeps sessions open: a
	// connection that could not unlock is closed rather than handed back.
	defer func() {
		if _, err := conn.Exec(context.Background(), `SELECT pg_advisory_unlock(hashtext($1))`, name); err != nil {
			conn.Conn().Close(context.Background()) //nolint:errcheck
		}
	}()
	return fn()
}
