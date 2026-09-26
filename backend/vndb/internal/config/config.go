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
	// At the repository root: not source, and read by two modules.
	defaultDumpDir = "../../data/dumps"
	defaultDumpURL = "https://dl.vndb.org/dump/vndb-db-latest.tar.zst"

	// Request bounds; 0 lifts a cap.
	defaultPageSize    = 24
	defaultMaxPageSize = 100
	// Target language of the trans schema (tag/trait text).
	defaultTransLang      = "ja"
	defaultMaxSearchTerms = 8
	defaultMaxFilterNodes = 64
	defaultMaxIDs         = 1000
	defaultMaxFieldDepth  = 3
	// Estimated field values per response; follows vndb's ceiling.
	defaultMaxCost = 100_000

	defaultGraphDepth    = 3
	defaultMaxGraphDepth = 8
	defaultMaxGraphNodes = 300

	// Data only changes on promote, so the TTL bounds memory, not staleness.
	defaultCacheBackend  = "memory"
	defaultCacheTTL      = time.Hour
	defaultCacheEntries  = 10000
	defaultCacheMaxEntry = 1 << 20

	// Max table shrink before promote is refused. vndb only grows, so a real
	// shrink means a truncated archive or a partial import.
	defaultGuardMaxLoss = 0.02

	// Originals only, byte-exact; thumbnails are vndb's own (cv.t, st).
	defaultImageDir        = "../../data/images"
	defaultImagePort       = 5101
	defaultImageMaxBytes   = 32 << 20
	defaultImageFetchLimit = 30 * time.Second
	// Concurrent fetches from vndb's CDN.
	defaultImageFetchParallel = 8
	// The crawl that mirrors ahead of readers: hourly, a few hundred images at
	// a time, one every two seconds -- a day brings about 4,800 images in at a
	// pace vndb's CDN will not notice.
	defaultImageCrawlEvery  = time.Hour
	defaultImageCrawlPerRun = 200
	defaultImageCrawlDelay  = 2 * time.Second

	defaultRequestTimeout    = 5 * time.Second
	defaultReadHeaderTimeout = 10 * time.Second
	defaultShutdownTimeout   = 10 * time.Second
)

type Config struct {
	DatabaseURL string

	Host string
	Port int

	DumpDir string
	DumpURL string

	MaxConns       int32
	MinConns       int32
	ConnLifetime   time.Duration
	ConnectTimeout time.Duration

	PageSize       int
	MaxPageSize    int
	TransLang      string
	MaxSearchTerms int
	MaxFilterNodes int
	MaxIDs         int
	MaxFieldDepth  int
	MaxCost        int

	// The relation graph is a walk, bounded by depth and node count.
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

	ImageDir           string
	ImagePort          int
	ImageMaxBytes      int64
	ImageFetchLimit    time.Duration
	ImageFetchParallel int
	ImageCrawlEvery    time.Duration // 0 turns the crawl off
	ImageCrawlPerRun   int           // 0 means no ceiling
	ImageCrawlDelay    time.Duration
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

		PageSize:       envInt("NEOVNDB_PAGE_SIZE", defaultPageSize),
		MaxPageSize:    envInt("NEOVNDB_MAX_PAGE_SIZE", defaultMaxPageSize),
		TransLang:      envString("NEOVNDB_TRANS_LANG", defaultTransLang),
		MaxSearchTerms: envInt("NEOVNDB_MAX_SEARCH_TERMS", defaultMaxSearchTerms),
		MaxFilterNodes: envInt("NEOVNDB_MAX_FILTER_NODES", defaultMaxFilterNodes),
		MaxIDs:         envInt("NEOVNDB_MAX_IDS", defaultMaxIDs),
		MaxFieldDepth:  envInt("NEOVNDB_MAX_FIELD_DEPTH", defaultMaxFieldDepth),
		MaxCost:        envInt("NEOVNDB_MAX_COST", defaultMaxCost),

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

		ImageDir:           envString("NEOVNDB_IMAGE_DIR", defaultImageDir),
		ImagePort:          envInt("NEOVNDB_IMAGE_PORT", defaultImagePort),
		ImageMaxBytes:      int64(envInt("NEOVNDB_IMAGE_MAX_BYTES", defaultImageMaxBytes)),
		ImageFetchLimit:    envDuration("NEOVNDB_IMAGE_FETCH_TIMEOUT", defaultImageFetchLimit),
		ImageFetchParallel: envInt("NEOVNDB_IMAGE_FETCH_PARALLEL", defaultImageFetchParallel),
		ImageCrawlEvery:    envDuration("NEOVNDB_IMAGE_CRAWL_EVERY", defaultImageCrawlEvery),
		ImageCrawlPerRun:   envInt("NEOVNDB_IMAGE_CRAWL_PER_RUN", defaultImageCrawlPerRun),
		ImageCrawlDelay:    envDuration("NEOVNDB_IMAGE_CRAWL_DELAY", defaultImageCrawlDelay),
	}
	if c.DatabaseURL == "" {
		return nil, fmt.Errorf("NEOVNDB_DB_URL is not set")
	}
	return c, nil
}

func (c *Config) Addr() string {
	return fmt.Sprintf("%s:%d", c.Host, c.Port)
}

// ImageAddr is the image mirror's own listener, on the same host as the API.
func (c *Config) ImageAddr() string {
	return fmt.Sprintf("%s:%d", c.Host, c.ImagePort)
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
