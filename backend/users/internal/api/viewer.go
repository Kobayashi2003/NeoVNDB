package api

import (
	"net/http"
	"sync"
	"time"

	"github.com/kobayashi/neovndb-users/internal/auth"
)

// The edge asks viewer before every read API request that carries a session
// cookie, so a page of results is a dozen lookups; a session found good is
// believed for this long. A sign-out clears the cookie, so its next request
// is a guest's at once; only another device's session outlives a password
// change by up to this.
const viewerFor = 10 * time.Second

// members remembers which session tokens were good, and until when.
type members struct {
	mu    sync.Mutex
	until map[string]time.Time
}

func (m *members) good(token string, now time.Time) bool {
	m.mu.Lock()
	defer m.mu.Unlock()
	t, ok := m.until[token]
	if ok && now.After(t) {
		delete(m.until, token)
		ok = false
	}
	return ok
}

func (m *members) remember(token string, now time.Time) {
	m.mu.Lock()
	defer m.mu.Unlock()
	// Expired entries go as the map is written, so it holds no more than
	// the sessions seen in the last few seconds.
	for k, t := range m.until {
		if now.After(t) {
			delete(m.until, k)
		}
	}
	m.until[token] = now.Add(viewerFor)
}

// viewer tells the edge who is asking, for the read API's all-ages mask: a
// member is signed in, anyone else a guest. Never a refusal, unlike verify:
// a guest is answered too, only masked.
func (s *Server) viewer(w http.ResponseWriter, r *http.Request) {
	kind := "guest"
	token := auth.TokenFrom(r, s.cfg.SecureCookie)
	now := time.Now()
	switch {
	case token == "":
	case s.members.good(token, now):
		kind = "member"
	default:
		if _, _, err := s.store.Session(r.Context(), token); err == nil {
			s.members.remember(token, now)
			kind = "member"
		}
	}
	w.Header().Set("X-Viewer", kind)
	w.WriteHeader(http.StatusNoContent)
}
