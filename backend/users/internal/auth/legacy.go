package auth

import (
	"crypto/subtle"
	"encoding/hex"
	"strconv"
	"strings"

	"golang.org/x/crypto/scrypt"
)

// Passwords carried over from the service this one replaces.
//
// That one hashed with Werkzeug's default, which is scrypt written as
// `scrypt:N:r:p$salt$hex`. bcrypt cannot read those, and nothing but the
// password itself can turn one into the other -- so the choice was between
// reading the old form and locking every migrated reader out of an account
// they still have.
//
// So it is read, and Check says when what it read was the old form. A
// successful sign-in then re-hashes into the current one and saves it: the
// reader notices nothing, and the row stops being legacy the first time they
// use it. Nothing writes this format, and when the last row is gone this file
// can go with it.

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
