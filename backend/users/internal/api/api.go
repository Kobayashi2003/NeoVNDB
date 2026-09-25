// Package api is the user service's HTTP surface: /auth/verify for the edge,
// and the reader's account and lists. Unlike the other services every route
// guards itself, since this is what the edge would ask.
package api

import (
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"strconv"

	"github.com/kobayashi/neovndb-users/internal/auth"
	"github.com/kobayashi/neovndb-users/internal/config"
	"github.com/kobayashi/neovndb-users/internal/store"
)

type Server struct {
	store *store.Store
	cfg   *config.Config
	log   *slog.Logger
	// Per address and per username, so spreading over either still hits a limit.
	signInFrom *tries
	signInFor  *tries
	signUpFrom *tries
	// A hash at the configured cost, checked when the username is unknown so
	// that answer takes as long as a wrong password.
	decoy string
}

func NewServer(s *store.Store, cfg *config.Config, log *slog.Logger) *Server {
	decoy, err := auth.Hash("not anyone's password", cfg.BcryptCost)
	if err != nil {
		log.Error("making the sign-in decoy hash; unknown usernames will answer faster", "err", err)
	}
	return &Server{
		store: s, cfg: cfg, log: log,
		signInFrom: newTries(cfg.SignInTries, cfg.SignInWindow),
		signInFor:  newTries(cfg.SignInTries, cfg.SignInWindow),
		signUpFrom: newTries(cfg.SignUpTries, cfg.SignUpWindow),
		decoy:      decoy,
	}
}

func (s *Server) Routes() http.Handler {
	mux := http.NewServeMux()

	mux.HandleFunc("GET /health", s.health)

	// The edge's probe.
	mux.HandleFunc("GET /auth/verify", s.verify)

	mux.HandleFunc("POST /register", s.register)
	mux.HandleFunc("POST /login", s.login)
	mux.HandleFunc("POST /logout", s.signedIn(s.logout))
	mux.HandleFunc("POST /logout-everywhere", s.signedIn(s.logoutEverywhere))
	mux.HandleFunc("GET /me", s.signedIn(s.me))
	mux.HandleFunc("POST /me/password", s.signedIn(s.changePassword))
	mux.HandleFunc("POST /me/delete", s.signedIn(s.deleteAccount))

	mux.HandleFunc("GET /collections", s.signedIn(s.listCollections))
	mux.HandleFunc("POST /collections", s.signedIn(s.createCollection))
	mux.HandleFunc("PATCH /collections/{id}", s.signedIn(s.renameCollection))
	mux.HandleFunc("DELETE /collections/{id}", s.signedIn(s.deleteCollection))

	mux.HandleFunc("GET /collections/{id}/marks", s.signedIn(s.listMarks))
	mux.HandleFunc("GET /collections/{id}/items", s.signedIn(s.items))
	mux.HandleFunc("PUT /collections/{id}/marks/{item}", s.signedIn(s.addMark))
	mux.HandleFunc("DELETE /collections/{id}/marks/{item}", s.signedIn(s.removeMark))

	mux.HandleFunc("POST /collections/{id}/marks/add", s.signedIn(s.addMarks))
	mux.HandleFunc("POST /collections/{id}/marks/remove", s.signedIn(s.removeMarks))
	mux.HandleFunc("POST /collections/{id}/marks/move", s.signedIn(s.moveMarks))

	mux.HandleFunc("GET /holding/{item}", s.signedIn(s.holding))

	mux.HandleFunc("GET /ratings/{item}", s.signedIn(s.rating))
	mux.HandleFunc("PUT /ratings/{item}", s.signedIn(s.setRating))
	mux.HandleFunc("DELETE /ratings/{item}", s.signedIn(s.clearRating))

	return mux
}

type ctxKey struct{}

// signedIn wraps each private route rather than the whole mux, so a new route
// is closed unless opened on purpose.
func (s *Server) signedIn(next func(http.ResponseWriter, *http.Request, int32)) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		token := auth.TokenFrom(r, s.cfg.SecureCookie)
		if token == "" {
			fail(w, http.StatusUnauthorized, "Not signed in.")
			return
		}
		userID, _, err := s.store.Session(r.Context(), token)
		if errors.Is(err, store.ErrNotFound) {
			fail(w, http.StatusUnauthorized, "Not signed in.")
			return
		}
		if err != nil {
			s.oops(w, "reading session", err)
			return
		}
		next(w, r, userID)
	}
}

func send(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if body != nil {
		_ = json.NewEncoder(w).Encode(body)
	}
}

// fail says what a caller can act on and nothing else.
func fail(w http.ResponseWriter, status int, message string) {
	send(w, status, map[string]string{"error": message})
}

// oops is for what the caller cannot act on: logged here, generic there.
func (s *Server) oops(w http.ResponseWriter, doing string, err error) {
	s.log.Error(doing, "err", err)
	fail(w, http.StatusInternalServerError, "Something went wrong.")
}

// read decodes a size-limited JSON body.
func read[T any](w http.ResponseWriter, r *http.Request) (T, bool) {
	var body T
	dec := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<16))
	dec.DisallowUnknownFields()
	if err := dec.Decode(&body); err != nil {
		fail(w, http.StatusBadRequest, "That request body could not be read.")
		return body, false
	}
	return body, true
}

func (s *Server) health(w http.ResponseWriter, r *http.Request) {
	if err := s.store.Ping(r.Context()); err != nil {
		fail(w, http.StatusServiceUnavailable, "No database.")
		return
	}
	send(w, http.StatusOK, map[string]string{"status": "ok"})
}

// vndb ids are stored as type letter plus number, as in the mirror.
const kinds = "vrcpsgi"

func parseID(raw string) (kind string, num int32, ok bool) {
	// The number starts with 1-9: ParseInt alone would take "+17" and "017".
	if len(raw) < 2 || !validKind(raw[:1]) || raw[1] < '1' || raw[1] > '9' {
		return "", 0, false
	}
	n, err := strconv.ParseInt(raw[1:], 10, 32)
	if err != nil || n <= 0 {
		return "", 0, false
	}
	return raw[:1], int32(n), true
}

func pathInt(r *http.Request, name string) (int32, bool) {
	n, err := strconv.ParseInt(r.PathValue(name), 10, 32)
	if err != nil || n <= 0 {
		return 0, false
	}
	return int32(n), true
}

// positive reads a query number, or fallback. Over max (0: none) is refused,
// not clamped.
func positive(w http.ResponseWriter, r *http.Request, name string, fallback, max int) (int, bool) {
	raw := r.URL.Query().Get(name)
	if raw == "" {
		return fallback, true
	}
	n, err := strconv.Atoi(raw)
	if err != nil || n < 1 {
		fail(w, http.StatusBadRequest, name+" must be a positive number.")
		return 0, false
	}
	if max > 0 && n > max {
		fail(w, http.StatusBadRequest, fmt.Sprintf("%s may be at most %d.", name, max))
		return 0, false
	}
	return n, true
}

// answer maps store errors to replies.
func (s *Server) answer(w http.ResponseWriter, doing string, err error) bool {
	switch {
	case err == nil:
		return true
	case errors.Is(err, store.ErrNotFound):
		fail(w, http.StatusNotFound, "No such list.")
	case errors.Is(err, store.ErrTaken):
		fail(w, http.StatusConflict, "You already have a list with that name.")
	default:
		s.oops(w, doing, err)
	}
	return false
}
