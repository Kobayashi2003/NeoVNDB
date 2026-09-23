package api

import (
	"net"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"
)

// Sign-in/sign-up rate limits, refused before any bcrypt work. In memory: the
// service is a single process.

// tries is a sliding window of attempts per key (address or username).
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

// take records an attempt; when refused it returns the wait.
func (t *tries) take(key string) (bool, time.Duration) {
	if t.max <= 0 {
		return true, 0
	}
	t.mu.Lock()
	defer t.mu.Unlock()

	now := time.Now()
	cutoff := now.Add(-t.window)

	// Prune idle keys; anyone can invent new ones.
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

// forget clears a key after a successful sign-in.
func (t *tries) forget(key string) {
	t.mu.Lock()
	defer t.mu.Unlock()
	delete(t.when, key)
}

// caller is the client address. Requests come from the edge on loopback; the
// edge appends the real peer to X-Forwarded-For, so the last entry is trusted,
// and only because nothing but the edge can reach this port.
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

// refuseTooMany answers 429 with Retry-After.
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
