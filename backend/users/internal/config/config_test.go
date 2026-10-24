package config

import (
	"strings"
	"testing"
)

func TestLoadRefusesWhatItCannotRead(t *testing.T) {
	t.Setenv("NEOVNDB_USERS_DB_URL", "postgres://localhost/x")
	t.Setenv("NEOVNDB_USERS_SECURE_COOKIE", "sure")
	_, err := Load()
	if err == nil || !strings.Contains(err.Error(), "NEOVNDB_USERS_SECURE_COOKIE") {
		t.Fatalf("want an error naming the setting, got %v", err)
	}
}
