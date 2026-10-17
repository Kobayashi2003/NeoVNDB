package api

import (
	"fmt"
	"net/http"
	"strings"
	"testing"

	"github.com/kobayashi/neovndb-users/internal/config"
)

func TestSearchCeiling(t *testing.T) {
	h := server(t, func(c *config.Config) { c.MaxSearches = 2 })
	session := register(t, h, "reader")

	for i, kind := range []string{"v", "c"} {
		body := fmt.Sprintf(`{"type":%q,"name":"n%d","query":"search=x"}`, kind, i)
		if w := call(h, "POST", "/searches", body, session); w.Code != http.StatusCreated {
			t.Fatalf("search %d: %d %s", i+1, w.Code, w.Body)
		}
	}
	// Over the ceiling, of whichever type, and told how many are allowed.
	w := call(h, "POST", "/searches", `{"type":"p","name":"n3","query":"search=x"}`, session)
	if w.Code != http.StatusConflict || !strings.Contains(w.Body.String(), "2") {
		t.Errorf("third over 2: %d %s", w.Code, w.Body)
	}
}

func TestSettingsRefuseWhatTheSiteWouldNotSend(t *testing.T) {
	h := server(t, func(*config.Config) {})
	session := register(t, h, "reader")

	if w := call(h, "GET", "/me/prefs", "", ""); w.Code != http.StatusUnauthorized {
		t.Errorf("preferences signed out: %d", w.Code)
	}
	if w := call(h, "GET", "/me/prefs", "", session); w.Code != http.StatusOK || !strings.Contains(w.Body.String(), `"prefs":null`) {
		t.Errorf("before any: %d %s", w.Code, w.Body)
	}
	for _, bad := range []string{`[1,2]`, `"dark"`, `null`, `{"a":`, `{"pad":"` + strings.Repeat("x", maxPrefs) + `"}`} {
		if w := call(h, "PUT", "/me/prefs", bad, session); w.Code != http.StatusBadRequest {
			t.Errorf("preferences %.20q: %d", bad, w.Code)
		}
	}
	if w := call(h, "PUT", "/me/prefs", `{"spoiler":1}`, session); w.Code != http.StatusNoContent {
		t.Fatalf("preferences: %d %s", w.Code, w.Body)
	}
	if w := call(h, "GET", "/me/prefs", "", session); !strings.Contains(w.Body.String(), `"spoiler": 1`) &&
		!strings.Contains(w.Body.String(), `"spoiler":1`) {
		t.Errorf("read back: %s", w.Body)
	}

	for _, bad := range []string{
		`{"type":"v","name":"x","query":""}`,
		`{"type":"v","name":"x","query":"?lang=en"}`,
		`{"type":"v","name":"x","query":"lang=%zz"}`,
		`{"type":"x","name":"x","query":"lang=en"}`,
		`{"type":"v","name":"  ","query":"lang=en"}`,
		fmt.Sprintf(`{"type":"v","name":"x","query":"search=%s"}`, strings.Repeat("a", maxQuery)),
	} {
		if w := call(h, "POST", "/searches", bad, session); w.Code != http.StatusBadRequest {
			t.Errorf("search %.40s: %d", bad, w.Code)
		}
	}
	if w := call(h, "DELETE", "/searches/999", "", session); w.Code != http.StatusNotFound {
		t.Errorf("no such search: %d", w.Code)
	}
}
