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
	defaultDumpDir        = "data/dumps"
	defaultDumpURL        = "https://dl.vndb.org/dump/vndb-db-latest.tar.zst"
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
