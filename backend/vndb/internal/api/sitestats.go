package api

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/kobayashi/neovndb/internal/api/query"
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
	// The replies, encoded, by the generations key each was counted under:
	// the live generation's, and its masked one's.
	bodies map[string][]byte
}

// keepSiteStats counts each new generation as soon as it is live, both ways,
// so the statistics page never waits on a count.
func (s *Server) keepSiteStats(ctx context.Context) {
	tick := time.NewTicker(siteStatsCheck)
	defer tick.Stop()
	for {
		ways := []context.Context{ctx}
		if s.mask.readyFor(ctx, s.gen.current(ctx)) {
			ways = append(ways, query.WithMask(ctx, s.mask))
		}
		for _, way := range ways {
			if _, err := s.siteStatsBody(way); err != nil && ctx.Err() == nil {
				s.log.Warn("counting the site statistics", "err", err)
			}
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
	masked := query.MaskOf(ctx) != nil
	st := s.site
	st.mu.Lock()
	defer st.mu.Unlock()
	if body, ok := st.bodies[key]; ok {
		return body, nil
	}
	// The server's context, not the request's: a reader leaving mid-count
	// should not waste it for the next.
	count, cancel := context.WithTimeout(s.base, siteStatsTimeout)
	defer cancel()
	stats, err := s.store.SiteStats(count, masked)
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
	// Only this generation's are worth keeping.
	live := strings.TrimSuffix(key, "+m")
	for k := range st.bodies {
		if strings.TrimSuffix(k, "+m") != live {
			delete(st.bodies, k)
		}
	}
	st.bodies[key] = body
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
