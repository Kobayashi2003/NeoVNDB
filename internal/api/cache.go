package api

import (
	"context"
	"fmt"
	"sync"

	"github.com/kobayashi/neovndb/internal/cache"
	"github.com/kobayashi/neovndb/internal/config"
	"github.com/kobayashi/neovndb/internal/db"
)

func newCache(ctx context.Context, cfg *config.Config) (cache.Cache, error) {
	switch cfg.CacheBackend {
	case "off", "none", "":
		return cache.Nop{}, nil
	case "memory":
		return cache.NewMemory(cfg.CacheEntries, cfg.CacheTTL), nil
	case "redis":
		if cfg.RedisURL == "" {
			return nil, fmt.Errorf("NEOVNDB_CACHE=redis needs NEOVNDB_REDIS_URL")
		}
		return cache.NewRedis(ctx, cfg.RedisURL, cfg.CacheTTL)
	default:
		return nil, fmt.Errorf("unknown cache backend %q", cfg.CacheBackend)
	}
}

// generations reports which generation is live, which every cache key starts
// with.
type generations struct {
	store *db.Store

	mu   sync.Mutex
	last string
}

// current reads the code rather than remembering it. One row of a one-row
// table costs a fraction of a millisecond; reusing it for even a few seconds
// leaves a window where some types answer out of the new generation and others
// out of entries keyed to the old one -- incoherent rather than merely stale.
func (g *generations) current(ctx context.Context) string {
	gen, err := g.store.Describe(ctx, db.SchemaLive)

	g.mu.Lock()
	defer g.mu.Unlock()
	if err != nil || gen == nil {
		// Unreachable: the last code known keeps hits working, where an empty
		// one would collapse every generation's keys onto each other.
		return g.last
	}
	g.last = gen.Code
	return g.last
}
