package api

import (
	"context"
	"encoding/json"
	"net/http"
	"sync"
	"time"
)

const (
	// siteStatsTimeout bounds one count of the whole mirror: seconds normally.
	siteStatsTimeout = 2 * time.Minute
	// siteStatsCheck is how often the server looks for a new generation to
	// count before anyone asks.
	siteStatsCheck = time.Minute
)

// siteStats holds the mirror counted once per generation and translation
// revision, outside the response cache: counting takes seconds, longer than
// a request may run, and the answer only changes with an import.
type siteStats struct {
	mu sync.Mutex
	// The generations key it was counted under, and the reply, encoded.
	key  string
	body []byte
}

// keepSiteStats counts each new generation as soon as it is live, so the
// statistics page never waits on a count.
func (s *Server) keepSiteStats(ctx context.Context) {
	tick := time.NewTicker(siteStatsCheck)
	defer tick.Stop()
	for {
		if _, err := s.siteStatsBody(ctx); err != nil && ctx.Err() == nil {
			s.log.Warn("counting the site statistics", "err", err)
		}
		select {
		case <-ctx.Done():
			return
		case <-tick.C:
		}
	}
}

// siteStatsBody is the reply for the live generation, counted now if it has
// not been. One count at a time: a request arriving mid-count waits for it.
func (s *Server) siteStatsBody(ctx context.Context) ([]byte, error) {
	key := s.gen.current(ctx)
	st := s.site
	st.mu.Lock()
	defer st.mu.Unlock()
	if st.key == key && st.body != nil {
		return st.body, nil
	}
	// The server's context, not the request's: a reader leaving mid-count
	// should not waste it for the next.
	count, cancel := context.WithTimeout(s.base, siteStatsTimeout)
	defer cancel()
	stats, err := s.store.SiteStats(count)
	if err != nil {
		return nil, err
	}
	found, err := s.store.Translations(count, stats.TagNames(), nil)
	if err != nil {
		return nil, err
	}
	stats.Translate(found.Name)
	body, err := json.Marshal(map[string]any{
		"generation": key,
		"counted_at": time.Now().UTC(),
		"stats":      stats,
	})
	if err != nil {
		return nil, err
	}
	st.key, st.body = key, body
	return body, nil
}

// siteStatsHandler is the whole mirror counted: totals, when entries came in,
// how their fields spread, and the leaders of each kind.
func (s *Server) siteStatsHandler(w http.ResponseWriter, r *http.Request) {
	body, err := s.siteStatsBody(r.Context())
	if err != nil {
		s.log.Error("site statistics", "err", err)
		fail(w, http.StatusInternalServerError, "query failed")
		return
	}
	writeJSON(w, http.StatusOK, body)
}
