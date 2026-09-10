// Package config loads runtime settings from the environment.
package config

import (
	"fmt"
	"os"
	"strconv"
	"time"

	"github.com/joho/godotenv"
)

const (
	defaultHost           = "127.0.0.1"
	defaultPort           = 5100
	defaultMaxConns       = 16
	defaultMinConns       = 2
	defaultConnLifetime   = time.Hour
	defaultConnectTimeout = 10 * time.Second
	// Archives live at the repository root, beside the backend rather than
	// inside it, because they are neither source nor Go module content.
	defaultDumpDir = "../data/dumps"
	defaultDumpURL = "https://dl.vndb.org/dump/vndb-db-latest.tar.zst"

	// What one request may ask for. These bound work, not correctness, so they
	// are settings: what a deployment can afford differs, and a private
	// instance serving one frontend can afford far more than a public one.
	defaultPageSize      = 24
	defaultMaxPageSize   = 100
	defaultMaxIDs        = 100
	defaultMaxFieldDepth = 3
	// Estimated field values in a response, priced from each level's declared
	// fan-out before the request runs. Follows vndb's own ceiling.
	defaultMaxCost = 100_000

	defaultGraphDepth    = 3
	defaultMaxGraphDepth = 8
	defaultMaxGraphNodes = 300

	// The database only changes when an import is promoted, so a cached
	// response stays correct until then and the TTL is a memory bound rather
	// than a freshness one.
	defaultCacheBackend  = "memory"
	defaultCacheTTL      = time.Hour
	defaultCacheEntries  = 10000
	defaultCacheMaxEntry = 1 << 20

	// How much of a table may disappear between generations before promoting
	// is refused. vndb only grows -- entries are hidden rather than deleted,
	// and hidden ones never reach the dump -- so any real shrink means a
	// truncated archive or an import that stopped partway.
	defaultGuardMaxLoss = 0.02

	defaultRequestTimeout    = 5 * time.Second
	defaultReadHeaderTimeout = 10 * time.Second
	defaultShutdownTimeout   = 10 * time.Second
)

type Config struct {
	DatabaseURL string

	Host string
	Port int

	// Where archives are kept, and where the latest one is fetched from.
	DumpDir string
	DumpURL string

	MaxConns       int32
	MinConns       int32
	ConnLifetime   time.Duration
	ConnectTimeout time.Duration

	// Bounds on a single request.
	PageSize      int
	MaxPageSize   int
	MaxIDs        int
	MaxFieldDepth int
	MaxCost       int

	// Bounds on the VN relation graph, which is a walk rather than a page and
	// so is bounded by depth and node count instead.
	GraphDepth    int
	MaxGraphDepth int
	MaxGraphNodes int

	RequestTimeout    time.Duration
	ReadHeaderTimeout time.Duration
	ShutdownTimeout   time.Duration

	// CacheBackend is "memory", "redis" or "off".
	CacheBackend  string
	CacheTTL      time.Duration
	CacheEntries  int
	CacheMaxEntry int
	RedisURL      string

	// GuardMaxLoss is a fraction: 0.02 refuses a table that lost 2%.
	GuardMaxLoss float64
}

// Load reads .env when present; real environment variables take precedence.
func Load() (*Config, error) {
	_ = godotenv.Load()

	c := &Config{
		DatabaseURL:    os.Getenv("NEOVNDB_DB_URL"),
		Host:           envString("NEOVNDB_HOST", defaultHost),
		Port:           envInt("NEOVNDB_PORT", defaultPort),
		DumpDir:        envString("NEOVNDB_DUMP_DIR", defaultDumpDir),
		DumpURL:        envString("NEOVNDB_DUMP_URL", defaultDumpURL),
		MaxConns:       int32(envInt("NEOVNDB_DB_MAX_CONNS", defaultMaxConns)),
		MinConns:       int32(envInt("NEOVNDB_DB_MIN_CONNS", defaultMinConns)),
		ConnLifetime:   envDuration("NEOVNDB_DB_CONN_LIFETIME", defaultConnLifetime),
		ConnectTimeout: envDuration("NEOVNDB_DB_CONNECT_TIMEOUT", defaultConnectTimeout),

		PageSize:      envInt("NEOVNDB_PAGE_SIZE", defaultPageSize),
		MaxPageSize:   envInt("NEOVNDB_MAX_PAGE_SIZE", defaultMaxPageSize),
		MaxIDs:        envInt("NEOVNDB_MAX_IDS", defaultMaxIDs),
		MaxFieldDepth: envInt("NEOVNDB_MAX_FIELD_DEPTH", defaultMaxFieldDepth),
		MaxCost:       envInt("NEOVNDB_MAX_COST", defaultMaxCost),

		GraphDepth:    envInt("NEOVNDB_GRAPH_DEPTH", defaultGraphDepth),
		MaxGraphDepth: envInt("NEOVNDB_MAX_GRAPH_DEPTH", defaultMaxGraphDepth),
		MaxGraphNodes: envInt("NEOVNDB_MAX_GRAPH_NODES", defaultMaxGraphNodes),

		RequestTimeout:    envDuration("NEOVNDB_REQUEST_TIMEOUT", defaultRequestTimeout),
		ReadHeaderTimeout: envDuration("NEOVNDB_READ_HEADER_TIMEOUT", defaultReadHeaderTimeout),
		ShutdownTimeout:   envDuration("NEOVNDB_SHUTDOWN_TIMEOUT", defaultShutdownTimeout),

		CacheBackend:  envString("NEOVNDB_CACHE", defaultCacheBackend),
		CacheTTL:      envDuration("NEOVNDB_CACHE_TTL", defaultCacheTTL),
		CacheEntries:  envInt("NEOVNDB_CACHE_ENTRIES", defaultCacheEntries),
		CacheMaxEntry: envInt("NEOVNDB_CACHE_MAX_ENTRY", defaultCacheMaxEntry),
		RedisURL:      envString("NEOVNDB_REDIS_URL", ""),

		GuardMaxLoss: envFloat("NEOVNDB_GUARD_MAX_LOSS", defaultGuardMaxLoss),
	}
	if c.DatabaseURL == "" {
		return nil, fmt.Errorf("NEOVNDB_DB_URL is not set")
	}
	return c, nil
}

func (c *Config) Addr() string {
	return fmt.Sprintf("%s:%d", c.Host, c.Port)
}

func envString(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func envInt(key string, fallback int) int {
	if v := os.Getenv(key); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			return n
		}
	}
	return fallback
}

func envDuration(key string, fallback time.Duration) time.Duration {
	if v := os.Getenv(key); v != "" {
		if d, err := time.ParseDuration(v); err == nil {
			return d
		}
	}
	return fallback
}

func envFloat(key string, fallback float64) float64 {
	if v := os.Getenv(key); v != "" {
		if f, err := strconv.ParseFloat(v, 64); err == nil {
			return f
		}
	}
	return fallback
}
