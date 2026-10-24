package config

import (
	"strings"
	"testing"
)

func TestLoadRefusesWhatItCannotRead(t *testing.T) {
	t.Setenv("NEOVNDB_DB_URL", "postgres://localhost/x")
	t.Setenv("NEOVNDB_PORT", "17O31")
	t.Setenv("NEOVNDB_CACHE_TTL", "an hour")
	_, err := Load()
	if err == nil {
		t.Fatal("loaded a port with a letter in it")
	}
	for _, key := range []string{"NEOVNDB_PORT", "NEOVNDB_CACHE_TTL"} {
		if !strings.Contains(err.Error(), key) {
			t.Errorf("the error does not name %s: %v", key, err)
		}
	}
}

func TestLoadFallsBackOnlyWhenUnset(t *testing.T) {
	t.Setenv("NEOVNDB_DB_URL", "postgres://localhost/x")
	t.Setenv("NEOVNDB_PORT", "")
	t.Setenv("NEOVNDB_MAX_COST", "0")
	c, err := Load()
	if err != nil {
		t.Fatal(err)
	}
	if c.Port != defaultPort || c.MaxCost != 0 {
		t.Errorf("port %d, max cost %d; want %d and 0", c.Port, c.MaxCost, defaultPort)
	}
}
