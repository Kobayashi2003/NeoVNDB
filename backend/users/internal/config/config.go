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
	// Named searches per reader, of every type together. Each is a row of a
	// couple of hundred bytes; this only stops a script filling the table.
	defaultMaxSearches = 200

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
	MaxSearches     int
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

	e := &env{}
	c := &Config{
		DatabaseURL:    os.Getenv("NEOVNDB_USERS_DB_URL"),
		Host:           e.text("NEOVNDB_USERS_HOST", defaultHost),
		Port:           e.int("NEOVNDB_USERS_PORT", defaultPort),
		MaxConns:       int32(e.int("NEOVNDB_USERS_DB_MAX_CONNS", defaultMaxConns)),
		ConnectTimeout: e.duration("NEOVNDB_USERS_DB_CONNECT_TIMEOUT", defaultConnectTimeout),

		SessionLife:     e.duration("NEOVNDB_USERS_SESSION_LIFE", defaultSessionLife),
		PageSize:        e.int("NEOVNDB_USERS_PAGE_SIZE", defaultPageSize),
		MaxPageSize:     e.int("NEOVNDB_USERS_MAX_PAGE_SIZE", defaultMaxPageSize),
		MaxItems:        e.int("NEOVNDB_USERS_MAX_ITEMS", defaultMaxItems),
		MaxSearches:     e.int("NEOVNDB_USERS_MAX_SEARCHES", defaultMaxSearches),
		SignInTries:     e.int("NEOVNDB_USERS_SIGNIN_TRIES", defaultSignInTries),
		SignInWindow:    e.duration("NEOVNDB_USERS_SIGNIN_WINDOW", defaultSignInWindow),
		SignUpTries:     e.int("NEOVNDB_USERS_SIGNUP_TRIES", defaultSignUpTries),
		SignUpWindow:    e.duration("NEOVNDB_USERS_SIGNUP_WINDOW", defaultSignUpWindow),
		SweepEvery:      e.duration("NEOVNDB_USERS_SWEEP_EVERY", defaultSweepEvery),
		SweepFirstAfter: e.duration("NEOVNDB_USERS_SWEEP_FIRST_AFTER", defaultSweepFirstAfter),
		BcryptCost:      e.int("NEOVNDB_USERS_BCRYPT_COST", defaultBcryptCost),

		SecureCookie: e.bool("NEOVNDB_USERS_SECURE_COOKIE", false),

		BackupDir:        e.text("NEOVNDB_USERS_BACKUP_DIR", defaultBackupDir),
		BackupEvery:      e.duration("NEOVNDB_USERS_BACKUP_EVERY", defaultBackupEvery),
		BackupCheckEvery: e.duration("NEOVNDB_USERS_BACKUP_CHECK_EVERY", defaultBackupCheckEvery),
		BackupFirstAfter: e.duration("NEOVNDB_USERS_BACKUP_FIRST_AFTER", defaultBackupFirstAfter),
		BackupKeep:       e.int("NEOVNDB_USERS_BACKUP_KEEP", defaultBackupKeep),
		PgDump:           e.text("NEOVNDB_USERS_PG_DUMP", "pg_dump"),

		ReadHeaderTimeout: e.duration("NEOVNDB_USERS_READ_HEADER_TIMEOUT", defaultReadHeaderTimeout),
		ShutdownTimeout:   e.duration("NEOVNDB_USERS_SHUTDOWN_TIMEOUT", defaultShutdownTimeout),
	}
	if c.DatabaseURL == "" {
		e.errs = append(e.errs, fmt.Errorf("NEOVNDB_USERS_DB_URL is not set"))
	}
	if err := errors.Join(e.errs...); err != nil {
		return nil, err
	}
	return c, nil
}

func (c *Config) Addr() string {
	return fmt.Sprintf("%s:%d", c.Host, c.Port)
}

// env reads settings, keeping every value it cannot read: a typo then stops
// the service with its name, rather than quietly running on the default.
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

func (e *env) bool(key string, fallback bool) bool {
	return read(e, key, fallback, strconv.ParseBool)
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
