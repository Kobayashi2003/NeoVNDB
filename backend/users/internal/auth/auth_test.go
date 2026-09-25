package auth

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"golang.org/x/crypto/bcrypt"
)

func TestValidUsername(t *testing.T) {
	for _, ok := range []string{"ab", "Kobayashi_99", "a-b", strings.Repeat("x", 32)} {
		if err := ValidUsername(ok); err != nil {
			t.Errorf("%q: %v", ok, err)
		}
	}
	// ASCII only: lookalike letters and digits would make two names that read
	// the same.
	for _, bad := range []string{"a", strings.Repeat("x", 33), "a b", "名前", "ab١", "ab１", "a.b", "a@b"} {
		if err := ValidUsername(bad); err == nil {
			t.Errorf("%q was accepted", bad)
		}
	}
}

func TestValidPassword(t *testing.T) {
	if ValidPassword("1234567") == nil {
		t.Error("seven characters were accepted")
	}
	longest := strings.Repeat("x", maxPassword)
	if err := ValidPassword(longest); err != nil {
		t.Fatalf("longest allowed: %v", err)
	}
	if ValidPassword(longest+"x") == nil {
		t.Error("a password over the limit was accepted")
	}
	// Whatever passes the check has to hash: bcrypt refuses past 72 bytes.
	if _, err := Hash(longest, bcrypt.MinCost); err != nil {
		t.Errorf("an allowed password did not hash: %v", err)
	}
	if ValidPassword(strings.Repeat("密", 25)) == nil {
		t.Error("75 bytes of CJK were accepted")
	}
}

func TestValidEmail(t *testing.T) {
	for _, ok := range []string{"a@b", "me@example.com"} {
		if ValidEmail(ok) != nil {
			t.Errorf("%q was refused", ok)
		}
	}
	for _, bad := range []string{"", "a", "@b", "a@", "a@b@c"} {
		if ValidEmail(bad) == nil {
			t.Errorf("%q was accepted", bad)
		}
	}
}

func TestHashCheck(t *testing.T) {
	h, err := Hash("correct horse", bcrypt.MinCost)
	if err != nil {
		t.Fatal(err)
	}
	if !Check(h, "correct horse") {
		t.Error("right password refused")
	}
	if Check(h, "wrong horse") {
		t.Error("wrong password matched")
	}
}

func TestTokenFromTheConfiguredCookie(t *testing.T) {
	for _, secure := range []bool{true, false} {
		r := httptest.NewRequest("GET", "/", nil)
		r.AddCookie(&http.Cookie{Name: CookieName(secure), Value: "tok"})
		if got := TokenFrom(r, secure); got != "tok" {
			t.Errorf("secure %v: got %q", secure, got)
		}
		// Only the configured name is read.
		if got := TokenFrom(r, !secure); got != "" {
			t.Errorf("secure %v read the other cookie: %q", !secure, got)
		}
	}
}

func TestNewTokenIsUnique(t *testing.T) {
	a, _ := NewToken()
	b, _ := NewToken()
	if a == b || len(a) != 43 {
		t.Errorf("tokens %q %q", a, b)
	}
}
