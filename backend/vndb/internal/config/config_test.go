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

// No fetch slot would hang every image, and a negative one panics at start.
func TestLoadRefusesNoImageFetchSlots(t *testing.T) {
	t.Setenv("NEOVNDB_DB_URL", "postgres://localhost/x")
	for _, n := range []string{"0", "-1"} {
		t.Setenv("NEOVNDB_IMAGE_FETCH_PARALLEL", n)
		if _, err := Load(); err == nil || !strings.Contains(err.Error(), "NEOVNDB_IMAGE_FETCH_PARALLEL") {
			t.Errorf("NEOVNDB_IMAGE_FETCH_PARALLEL=%s: %v", n, err)
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
