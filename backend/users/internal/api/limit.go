package api

import (
	"net"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"
)

// How often one caller may try to sign in or sign up.
//
// bcrypt makes a single guess expensive for whoever is guessing, but it does
// nothing about a hundred thousand of them, and it costs this service the same
// tenth of a second every time. So attempts are counted, and past a point the
// answer is no before a password is ever hashed.
//
// Counted in memory. This service is one process, and a limit that resets when
// it restarts is still a limit -- where a shared one would matter, so would a
// second instance, and that is a different design than the one here.

// tries is a sliding window of attempts, keyed by whatever the caller is being
// counted by: an address, a username.
type tries struct {
	mu     sync.Mutex
	when   map[string][]time.Time
	max    int
	window time.Duration
	swept  time.Time
}

func newTries(max int, window time.Duration) *tries {
	return &tries{when: map[string][]time.Time{}, max: max, window: window, swept: time.Now()}
}

// take records an attempt and says whether it is allowed, and if not, how long
// until the oldest one in the window falls out of it.
func (t *tries) take(key string) (bool, time.Duration) {
	if t.max <= 0 {
		return true, 0
	}
	t.mu.Lock()
	defer t.mu.Unlock()

	now := time.Now()
	cutoff := now.Add(-t.window)

	// Keys nobody has touched in a window would otherwise pile up for as long
	// as the process runs; a name or address is a key anyone can invent.
	if now.Sub(t.swept) > t.window {
		for k, at := range t.when {
			if len(at) == 0 || at[len(at)-1].Before(cutoff) {
				delete(t.when, k)
			}
		}
		t.swept = now
	}

	kept := t.when[key][:0]
	for _, at := range t.when[key] {
		if at.After(cutoff) {
			kept = append(kept, at)
		}
	}
	if len(kept) >= t.max {
		t.when[key] = kept
		return false, time.Until(kept[0].Add(t.window))
	}
	t.when[key] = append(kept, now)
	return true, 0
}

// forget drops one key's attempts, called when a sign-in succeeds: the count
// is there to slow down guessing, and somebody who knows their own password
// has not been guessing.
func (t *tries) forget(key string) {
	t.mu.Lock()
	defer t.mu.Unlock()
	delete(t.when, key)
}

// caller is who to count this request against.
//
// Every request arrives from the edge on loopback, so the address on the
// connection is the edge's. What the edge appends to X-Forwarded-For is the
// address it accepted the request from, and it appends rather than replaces:
// a client that sends the header itself cannot displace that, only add before
// it. So the last entry is the one to trust, and it is trustworthy only
// because nothing but the edge can reach this port.
func caller(r *http.Request) string {
	if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
		parts := strings.Split(xff, ",")
		if addr := strings.TrimSpace(parts[len(parts)-1]); addr != "" {
			return addr
		}
	}
	if host, _, err := net.SplitHostPort(r.RemoteAddr); err == nil {
		return host
	}
	return r.RemoteAddr
}

// refuseTooMany answers a caller that has tried too often, and says when to come back
// rather than leaving them to guess that too.
func refuseTooMany(w http.ResponseWriter, wait time.Duration) {
	seconds := int(wait.Seconds())
	if seconds < 1 {
		seconds = 1
	}
	w.Header().Set("Retry-After", strconv.Itoa(seconds))
	fail(w, http.StatusTooManyRequests, "Too many attempts. Try again in "+humanWait(seconds)+".")
}

func humanWait(seconds int) string {
	switch {
	case seconds < 60:
		return strconv.Itoa(seconds) + " seconds"
	case seconds < 120:
		return "a minute"
	default:
		return strconv.Itoa((seconds+59)/60) + " minutes"
	}
}
