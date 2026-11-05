package api

import (
	"context"
	"net/http"
	"strings"
	"sync"

	"github.com/kobayashi/neovndb/internal/api/query"
	"github.com/kobayashi/neovndb/internal/db"
)

// viewerHeader is the edge's word on who is asking: "member" for a reader
// signed in, anything else, or nothing, for a guest. The edge asks the user
// service and sets it on every request, overwriting one a client sent; a
// request reaching this process some other way is a guest's.
const viewerHeader = "X-Viewer"

// masking decides, per request, whether the all-ages mask applies: to every
// guest, and to everyone while the site is set to all ages. It also answers
// the query layer's question of which entities are withheld.
type masking struct {
	store   *db.Store
	allAges func() bool

	mu sync.Mutex
	// The generations, by code, known to hold the withheld table. One
	// imported before all-ages mode existed does not until the table is
	// built into it from the admin page, so only a yes is remembered.
	ready map[string]bool
}

// Withheld implements query.Withholder.
func (m *masking) Withheld(ctx context.Context, letter string, ids []int32) (map[int32]bool, error) {
	rows, err := m.store.Pool().Query(ctx,
		`SELECT id FROM withheld WHERE entity_type = $1 AND id = ANY($2)`, letter, ids)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[int32]bool{}
	for rows.Next() {
		var id int32
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		out[id] = true
	}
	return out, rows.Err()
}

// readyFor says whether the live generation, by its key, can be masked. An
// error is not a no: a guest answered unmasked because the catalog was slow
// would see what the mask is for.
func (m *masking) readyFor(ctx context.Context, key string) (bool, error) {
	m.mu.Lock()
	known := m.ready[key]
	m.mu.Unlock()
	if known {
		return true, nil
	}
	// A catalog lookup, asked again until the answer is yes.
	ready, err := m.store.HasWithheld(ctx)
	if err != nil || !ready {
		return false, err
	}
	m.mu.Lock()
	// One entry per generation seen; a long-running server sees few.
	m.ready[key] = true
	m.mu.Unlock()
	return true, nil
}

// viewer is how a request is answered: masked or not, and why.
type viewer struct {
	Masked bool `json:"masked"`
	// "guest" or "site" while masked, else null.
	Reason *string `json:"reason"`
	// False while the live generation predates all-ages mode: nothing can be
	// masked until a re-import.
	Ready bool `json:"ready"`
}

func (s *Server) viewerOf(r *http.Request) (viewer, error) {
	var reason string
	switch {
	case s.mask.allAges():
		reason = "site"
	case r.Header.Get(viewerHeader) != "member":
		reason = "guest"
	default:
		return viewer{Ready: true}, nil
	}
	ready, err := s.mask.readyFor(r.Context(), s.gen.current(r.Context()))
	if err != nil || !ready {
		return viewer{}, err
	}
	return viewer{Masked: true, Reason: &reason, Ready: true}, nil
}

// masked puts the mask in every request's context that it applies to. The
// admin routes are the administrator's own business and are left as they are.
func (s *Server) masked(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !strings.HasPrefix(r.URL.Path, "/admin/") {
			v, ok := s.viewerOrFail(w, r)
			if !ok {
				return
			}
			if v.Masked {
				r = r.WithContext(query.WithMask(r.Context(), s.mask))
			}
		}
		next.ServeHTTP(w, r)
	})
}

// viewerOrFail answers 503 when it cannot tell whether the mask applies.
func (s *Server) viewerOrFail(w http.ResponseWriter, r *http.Request) (viewer, bool) {
	v, err := s.viewerOf(r)
	if err != nil {
		s.log.Error("checking for the withheld table", "err", err)
		fail(w, http.StatusServiceUnavailable, "cannot tell what to withhold")
		return viewer{}, false
	}
	return v, true
}

// viewerHandler tells the site how it is being answered, so it can say why
// something is not there rather than act as if it never was.
func (s *Server) viewerHandler(w http.ResponseWriter, r *http.Request) {
	if v, ok := s.viewerOrFail(w, r); ok {
		respond(w, http.StatusOK, v)
	}
}
