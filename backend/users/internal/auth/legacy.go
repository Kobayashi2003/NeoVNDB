package auth

import (
	"crypto/subtle"
	"encoding/hex"
	"strconv"
	"strings"

	"golang.org/x/crypto/scrypt"
)

// Passwords from the replaced service, in Werkzeug's scrypt format
// (`scrypt:N:r:p$salt$hex`), which bcrypt can't read. Check reads them and
// reports them as stale, and a successful sign-in rehashes to bcrypt. Nothing
// writes this format; the file can go once no legacy rows remain.

const legacyPrefix = "scrypt:"

// Werkzeug asks hashlib for scrypt's default derived-key length and passes the
// salt as the bytes of its ASCII characters. Both have to match exactly or the
// comparison below is meaningless rather than merely false.
const legacyKeyLen = 64

// checkLegacy reports whether the password matches a Werkzeug scrypt hash, and
// whether the hash was one at all. A hash it cannot parse is not a failed
// password, it is not this format -- the caller still has bcrypt to try.
func checkLegacy(hash, password string) (ok, isLegacy bool) {
	if !strings.HasPrefix(hash, legacyPrefix) {
		return false, false
	}
	method, rest, found := strings.Cut(hash, "$")
	if !found {
		return false, false
	}
	salt, want, found := strings.Cut(rest, "$")
	if !found {
		return false, false
	}

	params := strings.Split(method, ":")
	if len(params) != 4 {
		return false, false
	}
	n, err1 := strconv.Atoi(params[1])
	r, err2 := strconv.Atoi(params[2])
	p, err3 := strconv.Atoi(params[3])
	if err1 != nil || err2 != nil || err3 != nil {
		return false, false
	}

	got, err := scrypt.Key([]byte(password), []byte(salt), n, r, p, legacyKeyLen)
	if err != nil {
		// Parameters this build will not run -- a bad row rather than a bad
		// password, and saying "wrong password" to it would be a lie.
		return false, false
	}
	return subtle.ConstantTimeCompare([]byte(hex.EncodeToString(got)), []byte(want)) == 1, true
}
