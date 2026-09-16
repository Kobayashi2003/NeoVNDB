package auth

import "testing"

// Hashes produced by the Werkzeug the old service actually ran, so this tests
// the format as it exists in the rows being migrated rather than the format as
// this file understands it. A reimplementation that agrees only with itself
// would pass its own tests and lock everybody out.
var werkzeug = []struct {
	password string
	hash     string
}{
	{
		"correct horse battery",
		"scrypt:32768:8:1$GxC7CjiChDgdqrSt$da39fbc814b64d53e179874ca3ac9af3622418e412087c3f071034515ea9721c24d46dcab159a066a8e407ddfc43687300dd390b7b0b174ef86e6d05385ff92a",
	},
	{
		// Non-ASCII, to pin down that the password is hashed as UTF-8 bytes.
		"passwoerd 中文 äö",
		"scrypt:32768:8:1$FmTBm2vh5RMO3FZp$eda0cac1a89161d34b3d3dcd6408526f931df1dd08f5817de55257f5d906707b308ea47771e7cd65ca2126676c58b3ef0ff7e570f896d0b006950ad2a890c5de",
	},
	{
		"",
		"scrypt:32768:8:1$nxak9vFkaTzmiweO$3792ad5830288c33db3e3be1042c9e9068b176f080499784c2a83ec927621aaf4d1d94f28883672d741e0b374acd750efd0417cfe479583fcfc45190f37a97e8",
	},
	{
		// Longer than bcrypt's 72-byte window, which scrypt does not have: the
		// whole string counts, so the wrong-password case below is a real test.
		"xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
		"scrypt:32768:8:1$YXMJ26jMg6YB2hrY$41701938eee0d7d0cfce11b0baaa27291102b40b5c2de31bb574be7b21a7ee52b7c070316c307eac9b32c7912b2907f1eb1280694cc65a4b6b79b741c8562547",
	},
}

func TestCheckReadsWerkzeugScrypt(t *testing.T) {
	for _, c := range werkzeug {
		ok, stale := Check(c.hash, c.password)
		if !ok {
			t.Errorf("did not accept the password for %.24s...", c.hash)
		}
		if !stale {
			t.Errorf("accepted %.24s... without asking for it to be re-hashed", c.hash)
		}
		if ok, _ := Check(c.hash, c.password+"!"); ok {
			t.Errorf("accepted the wrong password for %.24s...", c.hash)
		}
	}
}

func TestCheckStillReadsItsOwn(t *testing.T) {
	// Cost 4 is bcrypt's floor; this is about the branch, not the work factor.
	hash, err := Hash("correct horse battery", 4)
	if err != nil {
		t.Fatal(err)
	}
	ok, stale := Check(hash, "correct horse battery")
	if !ok {
		t.Error("did not accept a password it hashed itself")
	}
	if stale {
		t.Error("asked for a re-hash of a hash it had just written")
	}
	if ok, _ := Check(hash, "something else"); ok {
		t.Error("accepted the wrong password")
	}
}

// A hash in no format this service knows is not a failed password, and must
// not be reported as a legacy one either -- saying so would send the caller
// off to re-hash something that never matched.
func TestCheckRefusesMalformedHashes(t *testing.T) {
	bad := []string{
		"",
		"scrypt:32768:8:1",
		"scrypt:32768:8:1$onlysalt",
		"scrypt:32768:8$salt$00",
		"scrypt:notanumber:8:1$salt$00",
		"scrypt:32768:8:1$salt$not-hex",
		"pbkdf2:sha256:600000$BO2hLemLkwZgATTw$1505b171215f436435876f8e930ebe26e0a67bf923b869282b7589ac60d5fb83",
	}
	for _, hash := range bad {
		if ok, stale := Check(hash, "correct horse battery"); ok || stale {
			t.Errorf("Check(%q) = (%v, %v), wanted both false", hash, ok, stale)
		}
	}
}
