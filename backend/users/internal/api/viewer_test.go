package api

import (
	"net/http"
	"testing"
	"time"

	"github.com/kobayashi/neovndb-users/internal/config"
)

// viewer answers every request, a guest's included, and says which it was.
func TestViewer(t *testing.T) {
	h := server(t, func(*config.Config) {})
	session := register(t, h, "reader")
	// In order: the last is answered from what the first left in the cache.
	for _, c := range []struct {
		name    string
		session string
		want    string
	}{
		{"signed in", session, "member"},
		{"no cookie", "", "guest"},
		{"a session forged", "not-a-session", "guest"},
		{"signed in, again", session, "member"},
	} {
		w := call(h, "GET", "/auth/viewer", "", c.session)
		if w.Code != http.StatusNoContent || w.Header().Get("X-Viewer") != c.want {
			t.Errorf("%s: %d %q, want 204 %q", c.name, w.Code, w.Header().Get("X-Viewer"), c.want)
		}
	}
}

func TestMembersForget(t *testing.T) {
	m := &members{until: map[string]time.Time{}}
	now := time.Now()
	m.remember("a", now)
	if !m.good("a", now.Add(viewerFor/2)) {
		t.Error("forgot a session it was told of")
	}
	if m.good("a", now.Add(viewerFor+time.Second)) {
		t.Error("believed a session past its time")
	}
	if m.good("b", now) {
		t.Error("believed a session never seen")
	}
}
