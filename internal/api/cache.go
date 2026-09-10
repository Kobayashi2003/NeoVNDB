package api

import (
	"context"
	"fmt"
	"sync"
	"time"

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

// generations holds the live generation's code, which every cache key starts
// with. Reading it per request would cost a round trip on the very path the
// cache exists to shorten, so it is reused for a short while -- meaning a
// promote takes up to that long to be noticed.
type generations struct {
	store *db.Store
	ttl   time.Duration

	mu      sync.Mutex
	code    string
	fetched time.Time
}

func (g *generations) current(ctx context.Context) string {
	g.mu.Lock()
	defer g.mu.Unlock()

	if g.code != "" && time.Since(g.fetched) < g.ttl {
		return g.code
	}
	gen, err := g.store.Describe(ctx, db.SchemaLive)
	if err != nil || gen == nil {
		return ""
	}
	g.code, g.fetched = gen.Code, time.Now()
	return g.code
}
