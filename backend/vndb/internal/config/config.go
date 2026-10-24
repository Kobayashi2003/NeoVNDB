// Package config loads runtime settings from the environment.
package config

import (
	"errors"
	"fmt"
	"os"
	"strconv"
	"time"

	"github.com/joho/godotenv"
)

const (
	defaultHost           = "127.0.0.1"
	defaultPort           = 17031
	defaultMaxConns       = 16
	defaultMinConns       = 2
	defaultConnLifetime   = time.Hour
	defaultConnectTimeout = 10 * time.Second
	// At the repository root: not source, and read by two modules.
	defaultDumpDir = "../../data/dumps"
	defaultDumpURL = "https://dl.vndb.org/dump/vndb-db-latest.tar.zst"
	// The archives behind the live and the previous generation.
	defaultDumpKeep = 2
	// The API process checks upstream daily and imports when it is newer. The
	// first check waits a while, so a restart is not followed by an import.
	defaultUpdateEvery      = 24 * time.Hour
	defaultUpdateFirstAfter = 10 * time.Minute
	// After upstream could not be reached; sooner than a day, rarely enough
	// that an outage costs one request an hour.
	defaultUpdateRetryAfter = time.Hour

	// Request bounds; 0 lifts a cap.
	defaultPageSize    = 24
	defaultMaxPageSize = 100
	// Target language of the trans schema (tag/trait text).
	defaultTransLang      = "ja"
	defaultMaxSearchTerms = 8
	defaultMaxFilterNodes = 64
	defaultMaxIDs         = 1000
	// The site's own VN page asks for characters.traits.translation.name.
	defaultMaxFieldDepth = 4
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
	defaultImagePort       = 17032
	defaultImageMaxBytes   = 32 << 20
	defaultImageFetchLimit = 30 * time.Second
	// Concurrent fetches from vndb's CDN.
	defaultImageFetchParallel = 8
	// The crawl that mirrors ahead of readers: hourly, a few hundred images at
	// a time, one every two seconds -- a day brings about 4,800 images in at a
	// pace vndb's CDN will not notice.
	defaultImageCrawlEvery      = time.Hour
	defaultImageCrawlFirstAfter = time.Minute
	defaultImageCrawlPerRun     = 200
	defaultImageCrawlDelay      = 2 * time.Second

	defaultRequestTimeout    = 5 * time.Second
	defaultReadHeaderTimeout = 10 * time.Second
	defaultShutdownTimeout   = 10 * time.Second
)

type Config struct {
	DatabaseURL string

	Host string
	Port int

	DumpDir  string
	DumpURL  string
	DumpKeep int // 0 keeps every archive
	// The scheduled update in `serve`; UpdateEvery 0 turns it off.
	UpdateEvery      time.Duration
	UpdateFirstAfter time.Duration
	UpdateRetryAfter time.Duration // 0 waits the full interval

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

	ImageDir             string
	ImagePort            int
	ImageMaxBytes        int64
	ImageFetchLimit      time.Duration
	ImageFetchParallel   int
	ImageCrawlEvery      time.Duration // 0 turns the crawl off
	ImageCrawlFirstAfter time.Duration
	ImageCrawlPerRun     int // 0 means no ceiling
	ImageCrawlDelay      time.Duration
}

// Load reads .env when present; real environment variables take precedence.
func Load() (*Config, error) {
	_ = godotenv.Load()

	e := &env{}
	c := &Config{
		DatabaseURL: os.Getenv("NEOVNDB_DB_URL"),
		Host:        e.text("NEOVNDB_HOST", defaultHost),
		Port:        e.int("NEOVNDB_PORT", defaultPort),
		DumpDir:     e.text("NEOVNDB_DUMP_DIR", defaultDumpDir),
		DumpURL:     e.text("NEOVNDB_DUMP_URL", defaultDumpURL),
		DumpKeep:    e.int("NEOVNDB_DUMP_KEEP", defaultDumpKeep),

		UpdateEvery:      e.duration("NEOVNDB_UPDATE_EVERY", defaultUpdateEvery),
		UpdateFirstAfter: e.duration("NEOVNDB_UPDATE_FIRST_AFTER", defaultUpdateFirstAfter),
		UpdateRetryAfter: e.duration("NEOVNDB_UPDATE_RETRY_AFTER", defaultUpdateRetryAfter),

		MaxConns:       int32(e.int("NEOVNDB_DB_MAX_CONNS", defaultMaxConns)),
		MinConns:       int32(e.int("NEOVNDB_DB_MIN_CONNS", defaultMinConns)),
		ConnLifetime:   e.duration("NEOVNDB_DB_CONN_LIFETIME", defaultConnLifetime),
		ConnectTimeout: e.duration("NEOVNDB_DB_CONNECT_TIMEOUT", defaultConnectTimeout),

		PageSize:       e.int("NEOVNDB_PAGE_SIZE", defaultPageSize),
		MaxPageSize:    e.int("NEOVNDB_MAX_PAGE_SIZE", defaultMaxPageSize),
		TransLang:      e.text("NEOVNDB_TRANS_LANG", defaultTransLang),
		MaxSearchTerms: e.int("NEOVNDB_MAX_SEARCH_TERMS", defaultMaxSearchTerms),
		MaxFilterNodes: e.int("NEOVNDB_MAX_FILTER_NODES", defaultMaxFilterNodes),
		MaxIDs:         e.int("NEOVNDB_MAX_IDS", defaultMaxIDs),
		MaxFieldDepth:  e.int("NEOVNDB_MAX_FIELD_DEPTH", defaultMaxFieldDepth),
		MaxCost:        e.int("NEOVNDB_MAX_COST", defaultMaxCost),

		GraphDepth:    e.int("NEOVNDB_GRAPH_DEPTH", defaultGraphDepth),
		MaxGraphDepth: e.int("NEOVNDB_MAX_GRAPH_DEPTH", defaultMaxGraphDepth),
		MaxGraphNodes: e.int("NEOVNDB_MAX_GRAPH_NODES", defaultMaxGraphNodes),

		RequestTimeout:    e.duration("NEOVNDB_REQUEST_TIMEOUT", defaultRequestTimeout),
		ReadHeaderTimeout: e.duration("NEOVNDB_READ_HEADER_TIMEOUT", defaultReadHeaderTimeout),
		ShutdownTimeout:   e.duration("NEOVNDB_SHUTDOWN_TIMEOUT", defaultShutdownTimeout),

		CacheBackend:  e.text("NEOVNDB_CACHE", defaultCacheBackend),
		CacheTTL:      e.duration("NEOVNDB_CACHE_TTL", defaultCacheTTL),
		CacheEntries:  e.int("NEOVNDB_CACHE_ENTRIES", defaultCacheEntries),
		CacheMaxEntry: e.int("NEOVNDB_CACHE_MAX_ENTRY", defaultCacheMaxEntry),
		RedisURL:      e.text("NEOVNDB_REDIS_URL", ""),

		GuardMaxLoss: e.float("NEOVNDB_GUARD_MAX_LOSS", defaultGuardMaxLoss),

		ImageDir:             e.text("NEOVNDB_IMAGE_DIR", defaultImageDir),
		ImagePort:            e.int("NEOVNDB_IMAGE_PORT", defaultImagePort),
		ImageMaxBytes:        int64(e.int("NEOVNDB_IMAGE_MAX_BYTES", defaultImageMaxBytes)),
		ImageFetchLimit:      e.duration("NEOVNDB_IMAGE_FETCH_TIMEOUT", defaultImageFetchLimit),
		ImageFetchParallel:   e.int("NEOVNDB_IMAGE_FETCH_PARALLEL", defaultImageFetchParallel),
		ImageCrawlEvery:      e.duration("NEOVNDB_IMAGE_CRAWL_EVERY", defaultImageCrawlEvery),
		ImageCrawlFirstAfter: e.duration("NEOVNDB_IMAGE_CRAWL_FIRST_AFTER", defaultImageCrawlFirstAfter),
		ImageCrawlPerRun:     e.int("NEOVNDB_IMAGE_CRAWL_PER_RUN", defaultImageCrawlPerRun),
		ImageCrawlDelay:      e.duration("NEOVNDB_IMAGE_CRAWL_DELAY", defaultImageCrawlDelay),
	}
	if c.DatabaseURL == "" {
		e.errs = append(e.errs, fmt.Errorf("NEOVNDB_DB_URL is not set"))
	}
	if err := errors.Join(e.errs...); err != nil {
		return nil, err
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

// env reads settings, keeping every value it cannot read: a typo then stops
// the process with its name, rather than quietly running on the default.
type env struct{ errs []error }

func (e *env) text(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func (e *env) int(key string, fallback int) int {
	return read(e, key, fallback, strconv.Atoi)
}

func (e *env) duration(key string, fallback time.Duration) time.Duration {
	return read(e, key, fallback, time.ParseDuration)
}

func (e *env) float(key string, fallback float64) float64 {
	return read(e, key, fallback, func(v string) (float64, error) { return strconv.ParseFloat(v, 64) })
}

func read[T any](e *env, key string, fallback T, parse func(string) (T, error)) T {
	v := os.Getenv(key)
	if v == "" {
		return fallback
	}
	got, err := parse(v)
	if err != nil {
		e.errs = append(e.errs, fmt.Errorf("%s=%q: %w", key, v, err))
		return fallback
	}
	return got
}
