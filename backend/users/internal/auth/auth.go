// Package auth handles password hashes and session cookies. Sessions are
// opaque tokens in a table rather than signed tokens, so revoking one is a
// delete.
package auth

import (
	"crypto/rand"
	"encoding/base64"
	"fmt"
	"net/http"
	"strings"
	"time"
	"unicode"

	"golang.org/x/crypto/bcrypt"
)

const Cookie = "__Host-neovndb_session"

// The __Host- prefix requires Secure, so plain-http setups use a plain name.
const insecureCookie = "neovndb_session"

func CookieName(secure bool) string {
	if secure {
		return Cookie
	}
	return insecureCookie
}

// NewToken returns 32 random bytes, encoded.
func NewToken() (string, error) {
	var b [32]byte
	if _, err := rand.Read(b[:]); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(b[:]), nil
}

func Hash(password string, cost int) (string, error) {
	h, err := bcrypt.GenerateFromPassword([]byte(password), cost)
	return string(h), err
}

// Check reports whether the password matches, and whether the hash is a
// legacy format the caller should replace (see legacy.go).
func Check(hash, password string) (ok, stale bool) {
	if ok, isLegacy := checkLegacy(hash, password); isLegacy {
		return ok, ok
	}
	return bcrypt.CompareHashAndPassword([]byte(hash), []byte(password)) == nil, false
}

func SetCookie(w http.ResponseWriter, secure bool, token string, life time.Duration) {
	http.SetCookie(w, &http.Cookie{
		Name:     CookieName(secure),
		Value:    token,
		Path:     "/",
		MaxAge:   int(life.Seconds()),
		HttpOnly: true,
		Secure:   secure,
		SameSite: http.SameSiteLaxMode,
	})
}

func ClearCookie(w http.ResponseWriter, secure bool) {
	http.SetCookie(w, &http.Cookie{
		Name:     CookieName(secure),
		Value:    "",
		Path:     "/",
		MaxAge:   -1,
		HttpOnly: true,
		Secure:   secure,
		SameSite: http.SameSiteLaxMode,
	})
}

func TokenFrom(r *http.Request, secure bool) string {
	if c, err := r.Cookie(CookieName(secure)); err == nil {
		return c.Value
	}
	// Both names are read, so flipping the setting signs nobody out.
	for _, name := range []string{Cookie, insecureCookie} {
		if c, err := r.Cookie(name); err == nil {
			return c.Value
		}
	}
	return ""
}

/* ─── What a new account has to look like ──────────────────────────────────── */

const (
	minPassword = 8
	// bcrypt's own ceiling, in bytes.
	maxPassword = 72
	maxUsername = 32
)

// ValidUsername is narrow on purpose: widening later is free, narrowing isn't.
func ValidUsername(name string) error {
	if len(name) < 2 || len(name) > maxUsername {
		return fmt.Errorf("a username is between 2 and %d characters", maxUsername)
	}
	for _, r := range name {
		ok := r < unicode.MaxASCII && (unicode.IsLetter(r) || unicode.IsDigit(r)) ||
			r == '-' || r == '_'
		if !ok {
			return fmt.Errorf("a username may hold letters, digits, - and _")
		}
	}
	return nil
}

// ValidPassword checks length only; composition rules make passwords worse.
func ValidPassword(password string) error {
	if len(password) < minPassword {
		return fmt.Errorf("a password is at least %d characters", minPassword)
	}
	if len(password) > maxPassword {
		return fmt.Errorf("a password is at most %d bytes (fewer characters outside ASCII)", maxPassword)
	}
	return nil
}

// ValidEmail is a shape check only; nothing sends mail yet.
func ValidEmail(email string) error {
	at := strings.IndexByte(email, '@')
	if at <= 0 || at == len(email)-1 || strings.Count(email, "@") != 1 {
		return fmt.Errorf("that does not look like an email address")
	}
	return nil
}
