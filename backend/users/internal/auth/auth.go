// Package auth turns a password into a stored hash and a sign-in into a
// session cookie.
//
// Sessions are opaque random strings kept in a table, not signed tokens. A
// signed token carries its own claim and so cannot be taken back without a
// second table listing the ones that were revoked -- which is this table with
// an extra step and an inverted meaning. A row can simply be deleted.
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

// Cookie is the name the browser holds the session under. Prefixed so it is
// never sent anywhere but the origin that set it, in browsers that enforce it.
const Cookie = "__Host-neovndb_session"

// The cookie prefix demands Secure, which a plain-http checkout cannot set. On
// those, a plain name.
const insecureCookie = "neovndb_session"

func CookieName(secure bool) string {
	if secure {
		return Cookie
	}
	return insecureCookie
}

// NewToken returns a session token. 32 bytes from the system source: long
// enough that guessing is not a strategy, and opaque so it says nothing about
// whose it is.
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

// Check reports whether the password matches. It takes the same time either
// way, which is bcrypt's doing rather than ours.
func Check(hash, password string) bool {
	return bcrypt.CompareHashAndPassword([]byte(hash), []byte(password)) == nil
}

// SetCookie writes the session cookie. HttpOnly because no script on the page
// has any use for the value, and SameSite=Lax because every request that needs
// it is a navigation or a same-site fetch.
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
	// The prefixed and plain names are both read whatever the setting says, so
	// flipping it does not sign everyone out.
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
	maxPassword = 128
	maxUsername = 32
)

// ValidUsername keeps names to what can appear in a URL and be told apart from
// another. The rules are narrow on purpose: widening them later takes nothing
// away from anyone, narrowing them takes away names people are using.
func ValidUsername(name string) error {
	if len(name) < 2 || len(name) > maxUsername {
		return fmt.Errorf("a username is between 2 and %d characters", maxUsername)
	}
	for _, r := range name {
		ok := unicode.IsLetter(r) && r < unicode.MaxASCII ||
			unicode.IsDigit(r) || r == '-' || r == '_'
		if !ok {
			return fmt.Errorf("a username may hold letters, digits, - and _")
		}
	}
	return nil
}

// ValidPassword checks length and nothing else. Rules about which characters
// must appear push people towards the shortest password that satisfies them,
// which is the opposite of the intent.
func ValidPassword(password string) error {
	if len(password) < minPassword {
		return fmt.Errorf("a password is at least %d characters", minPassword)
	}
	if len(password) > maxPassword {
		// bcrypt reads the first 72 bytes and ignores the rest, so a very long
		// password is not the extra security it looks like. Refused rather
		// than silently truncated.
		return fmt.Errorf("a password is at most %d characters", maxPassword)
	}
	return nil
}

// ValidEmail is a shape check, not a proof of delivery. Nothing here sends
// mail, so the address is somewhere to write down and nothing more.
func ValidEmail(email string) error {
	at := strings.IndexByte(email, '@')
	if at <= 0 || at == len(email)-1 || strings.Count(email, "@") != 1 {
		return fmt.Errorf("that does not look like an email address")
	}
	return nil
}
