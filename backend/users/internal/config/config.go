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
	defaultHost = "127.0.0.1"
	defaultPort = 5102

	defaultMaxConns       = 8
	defaultConnectTimeout = 10 * time.Second

	// How long a browser stays signed in without being asked again. Long,
	// because this is a private mirror rather than a bank, and a session can
	// be taken back the moment it needs to be.
	defaultSessionLife = 30 * 24 * time.Hour
	// Expired rows are useless but harmless, so they go in a sweep rather than
	// on the request that trips over one.
	defaultSweepEvery = time.Hour

	// bcrypt's work factor. 12 is a tenth of a second per attempt on current
	// hardware, which is nothing to a person signing in and a great deal to
	// anyone working through a list.
	defaultBcryptCost = 12

	defaultReadHeaderTimeout = 10 * time.Second
	defaultShutdownTimeout   = 10 * time.Second
)

type Config struct {
	DatabaseURL string

	Host string
	Port int

	MaxConns       int32
	ConnectTimeout time.Duration

	SessionLife time.Duration
	SweepEvery  time.Duration
	BcryptCost  int

	// Whether the session cookie may only travel over https. Off by default so
	// a local checkout works; on wherever this is actually served.
	SecureCookie bool

	ReadHeaderTimeout time.Duration
	ShutdownTimeout   time.Duration
}

// Load reads .env when present; real environment variables take precedence.
func Load() (*Config, error) {
	_ = godotenv.Load()

	c := &Config{
		DatabaseURL:    os.Getenv("NEOVNDB_USERS_DB_URL"),
		Host:           envString("NEOVNDB_USERS_HOST", defaultHost),
		Port:           envInt("NEOVNDB_USERS_PORT", defaultPort),
		MaxConns:       int32(envInt("NEOVNDB_USERS_DB_MAX_CONNS", defaultMaxConns)),
		ConnectTimeout: envDuration("NEOVNDB_USERS_DB_CONNECT_TIMEOUT", defaultConnectTimeout),

		SessionLife: envDuration("NEOVNDB_USERS_SESSION_LIFE", defaultSessionLife),
		SweepEvery:  envDuration("NEOVNDB_USERS_SWEEP_EVERY", defaultSweepEvery),
		BcryptCost:  envInt("NEOVNDB_USERS_BCRYPT_COST", defaultBcryptCost),

		SecureCookie: envBool("NEOVNDB_USERS_SECURE_COOKIE", false),

		ReadHeaderTimeout: envDuration("NEOVNDB_USERS_READ_HEADER_TIMEOUT", defaultReadHeaderTimeout),
		ShutdownTimeout:   envDuration("NEOVNDB_USERS_SHUTDOWN_TIMEOUT", defaultShutdownTimeout),
	}
	if c.DatabaseURL == "" {
		return nil, fmt.Errorf("NEOVNDB_USERS_DB_URL is not set")
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

func envBool(key string, fallback bool) bool {
	if v := os.Getenv(key); v != "" {
		if b, err := strconv.ParseBool(v); err == nil {
			return b
		}
	}
	return fallback
}
