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
	defaultPort = 17033

	defaultMaxConns       = 8
	defaultConnectTimeout = 10 * time.Second

	// How long a browser stays signed in without being asked again. Long,
	// because this is a private mirror rather than a bank, and a session can
	// be taken back the moment it needs to be.
	defaultSessionLife = 30 * 24 * time.Hour
	// Expired rows are useless but harmless, so they go in a sweep rather than
	// on the request that trips over one.
	defaultSweepEvery      = time.Hour
	defaultSweepFirstAfter = time.Hour

	// bcrypt's work factor. 12 is a tenth of a second per attempt on current
	// hardware, which is nothing to a person signing in and a great deal to
	// anyone working through a list.
	defaultBcryptCost = 12

	// How often one address, or one username, may be tried before the answer
	// is no. Ten in five minutes is more than a person who has forgotten which
	// password they used, and nothing at all to anyone working through a list.
	defaultSignInTries  = 10
	defaultSignInWindow = 5 * time.Minute
	// Accounts are cheap to make and there is no email step yet, so this is
	// the only thing standing between the sign-up form and a thousand of them.
	defaultSignUpTries  = 5
	defaultSignUpWindow = time.Hour

	// One page of marks by default, and the most one request may ask for. The
	// ceiling is the read API's id-list limit: a page of marks is turned back
	// into things by handing those ids to it, so a page it could not resolve
	// in one request would be no use. 0 lifts it.
	defaultPageSize    = 24
	defaultMaxPageSize = 100
	// How much of a list may be handed over at once for the read API to sort
	// or search. Same ceiling, same reason.
	defaultMaxItems = 1000

	// The one database that cannot be rebuilt is copied weekly, and the last
	// eight copies -- two months -- are kept. Relative to backend/users.
	defaultBackupDir        = "../../data/backups/users"
	defaultBackupEvery      = 7 * 24 * time.Hour
	defaultBackupKeep       = 8
	defaultBackupCheckEvery = time.Hour
	defaultBackupFirstAfter = 0

	defaultReadHeaderTimeout = 10 * time.Second
	defaultShutdownTimeout   = 10 * time.Second
)

type Config struct {
	DatabaseURL string

	Host string
	Port int

	MaxConns       int32
	ConnectTimeout time.Duration

	SessionLife     time.Duration
	PageSize        int
	MaxPageSize     int
	MaxItems        int
	SignInTries     int
	SignInWindow    time.Duration
	SignUpTries     int
	SignUpWindow    time.Duration
	SweepEvery      time.Duration // 0 turns the sweep off
	SweepFirstAfter time.Duration
	BcryptCost      int

	BackupDir        string
	BackupEvery      time.Duration // how old the newest copy may get; 0 turns the schedule off
	BackupCheckEvery time.Duration
	BackupFirstAfter time.Duration
	BackupKeep       int // 0 keeps every copy
	PgDump           string

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

		SessionLife:     envDuration("NEOVNDB_USERS_SESSION_LIFE", defaultSessionLife),
		PageSize:        envInt("NEOVNDB_USERS_PAGE_SIZE", defaultPageSize),
		MaxPageSize:     envInt("NEOVNDB_USERS_MAX_PAGE_SIZE", defaultMaxPageSize),
		MaxItems:        envInt("NEOVNDB_USERS_MAX_ITEMS", defaultMaxItems),
		SignInTries:     envInt("NEOVNDB_USERS_SIGNIN_TRIES", defaultSignInTries),
		SignInWindow:    envDuration("NEOVNDB_USERS_SIGNIN_WINDOW", defaultSignInWindow),
		SignUpTries:     envInt("NEOVNDB_USERS_SIGNUP_TRIES", defaultSignUpTries),
		SignUpWindow:    envDuration("NEOVNDB_USERS_SIGNUP_WINDOW", defaultSignUpWindow),
		SweepEvery:      envDuration("NEOVNDB_USERS_SWEEP_EVERY", defaultSweepEvery),
		SweepFirstAfter: envDuration("NEOVNDB_USERS_SWEEP_FIRST_AFTER", defaultSweepFirstAfter),
		BcryptCost:      envInt("NEOVNDB_USERS_BCRYPT_COST", defaultBcryptCost),

		SecureCookie: envBool("NEOVNDB_USERS_SECURE_COOKIE", false),

		BackupDir:        envString("NEOVNDB_USERS_BACKUP_DIR", defaultBackupDir),
		BackupEvery:      envDuration("NEOVNDB_USERS_BACKUP_EVERY", defaultBackupEvery),
		BackupCheckEvery: envDuration("NEOVNDB_USERS_BACKUP_CHECK_EVERY", defaultBackupCheckEvery),
		BackupFirstAfter: envDuration("NEOVNDB_USERS_BACKUP_FIRST_AFTER", defaultBackupFirstAfter),
		BackupKeep:       envInt("NEOVNDB_USERS_BACKUP_KEEP", defaultBackupKeep),
		PgDump:           envString("NEOVNDB_USERS_PG_DUMP", "pg_dump"),

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
