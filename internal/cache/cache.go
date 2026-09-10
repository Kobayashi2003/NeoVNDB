// Package cache stores rendered API responses. The database only changes when
// an import is promoted, so a response stays correct until then -- which is
// why the live generation's code is part of every key: promoting a new one
// makes the whole previous generation's keys unreachable at once, with nothing
// to invalidate by hand.
package cache

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"strings"
)

type Cache interface {
	Get(ctx context.Context, key string) ([]byte, bool)
	Set(ctx context.Context, key string, value []byte)
	// Name says which backend this is, for logging and /health.
	Name() string
	Close() error
}

// Key composes the cache key for one request. generation makes a promote
// invalidate everything; parts are whatever else changes the answer.
func Key(generation string, parts ...string) string {
	sum := sha256.Sum256([]byte(strings.Join(parts, "\x00")))
	return "neovndb:" + generation + ":" + hex.EncodeToString(sum[:12])
}

// Nop is the backend when caching is switched off.
type Nop struct{}

func (Nop) Get(context.Context, string) ([]byte, bool) { return nil, false }
func (Nop) Set(context.Context, string, []byte)        {}
func (Nop) Name() string                               { return "off" }
func (Nop) Close() error                               { return nil }
