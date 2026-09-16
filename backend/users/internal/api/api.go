// Package api is this service's HTTP surface.
//
// Two audiences. The edge asks one question on every request -- whose session
// is this -- at /auth/verify, and gets a 204 with the answer in headers or a
// 401. Everything else is the reader's own: their account, and the lists they
// keep.
//
// Every route here guards itself, unlike the read API and the image mirror,
// which hold no auth code at all and are gated at the edge instead. This one
// cannot delegate: it is what the edge would be asking.
package api

import (
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"strconv"
	"strings"

	"github.com/kobayashi/neovndb-users/internal/auth"
	"github.com/kobayashi/neovndb-users/internal/config"
	"github.com/kobayashi/neovndb-users/internal/store"
)

type Server struct {
	store *store.Store
	cfg   *config.Config
	log   *slog.Logger
}

func NewServer(s *store.Store, cfg *config.Config, log *slog.Logger) *Server {
	return &Server{store: s, cfg: cfg, log: log}
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

	mux.HandleFunc("GET /collections", s.signedIn(s.listCollections))
	mux.HandleFunc("POST /collections", s.signedIn(s.createCollection))
	mux.HandleFunc("PATCH /collections/{id}", s.signedIn(s.renameCollection))
	mux.HandleFunc("DELETE /collections/{id}", s.signedIn(s.deleteCollection))

	mux.HandleFunc("GET /collections/{id}/marks", s.signedIn(s.listMarks))
	mux.HandleFunc("PUT /collections/{id}/marks/{item}", s.signedIn(s.addMark))
	mux.HandleFunc("DELETE /collections/{id}/marks/{item}", s.signedIn(s.removeMark))

	// The page-at-a-time forms, for a reader tidying a list rather than
	// saving one thing.
	mux.HandleFunc("POST /collections/{id}/marks/remove", s.signedIn(s.removeMarks))
	mux.HandleFunc("POST /collections/{id}/marks/move", s.signedIn(s.moveMarks))

	// "Which of my lists hold this", which is what a detail page asks.
	mux.HandleFunc("GET /holding/{item}", s.signedIn(s.holding))

	return mux
}

/* ─── Plumbing ─────────────────────────────────────────────────────────────── */

type ctxKey struct{}

// signedIn refuses anyone without a live session and hands the rest their own
// id. Wrapping rather than a middleware over the whole mux, because two routes
// here are deliberately open and a default-open list is one edit from leaking.
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

// read decodes a JSON body, refusing anything unreasonably large or shaped
// wrong before a handler has to think about it.
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

/* ─── The edge's probe ─────────────────────────────────────────────────────── */

// verify is the one route the edge calls, before every request it guards --
// including every image on a page. It answers from one indexed lookup and
// nothing else: no body, no work, and the answer in headers the edge copies
// upstream, so the services behind it can know who is asking without holding
// any auth code of their own.
func (s *Server) verify(w http.ResponseWriter, r *http.Request) {
	token := auth.TokenFrom(r, s.cfg.SecureCookie)
	if token == "" {
		fail(w, http.StatusUnauthorized, "Not signed in.")
		return
	}
	userID, isAdmin, err := s.store.Session(r.Context(), token)
	if errors.Is(err, store.ErrNotFound) {
		fail(w, http.StatusUnauthorized, "Not signed in.")
		return
	}
	if err != nil {
		s.oops(w, "verifying session", err)
		return
	}
	w.Header().Set("X-User-Id", strconv.Itoa(int(userID)))
	w.Header().Set("X-Is-Admin", strconv.FormatBool(isAdmin))
	w.WriteHeader(http.StatusNoContent)
}

/* ─── Accounts ─────────────────────────────────────────────────────────────── */

type credentials struct {
	Username string `json:"username"`
	Password string `json:"password"`
	Email    string `json:"email"`
}

func (s *Server) register(w http.ResponseWriter, r *http.Request) {
	body, ok := read[credentials](w, r)
	if !ok {
		return
	}
	body.Username = strings.TrimSpace(body.Username)
	body.Email = strings.TrimSpace(body.Email)

	if err := auth.ValidUsername(body.Username); err != nil {
		fail(w, http.StatusBadRequest, err.Error())
		return
	}
	if err := auth.ValidPassword(body.Password); err != nil {
		fail(w, http.StatusBadRequest, err.Error())
		return
	}
	var email *string
	if body.Email != "" {
		if err := auth.ValidEmail(body.Email); err != nil {
			fail(w, http.StatusBadRequest, err.Error())
			return
		}
		email = &body.Email
	}

	hash, err := auth.Hash(body.Password, s.cfg.BcryptCost)
	if err != nil {
		s.oops(w, "hashing password", err)
		return
	}
	user, err := s.store.CreateUser(r.Context(), body.Username, email, hash)
	if errors.Is(err, store.ErrTaken) {
		fail(w, http.StatusConflict, "That username or email is already taken.")
		return
	}
	if err != nil {
		s.oops(w, "creating user", err)
		return
	}

	if err := s.start(w, r, user.ID); err != nil {
		s.oops(w, "starting session", err)
		return
	}
	send(w, http.StatusCreated, user)
}

func (s *Server) login(w http.ResponseWriter, r *http.Request) {
	body, ok := read[credentials](w, r)
	if !ok {
		return
	}
	// One answer for two different failures, said in both places rather than
	// funnelled through one: telling an unknown name from a wrong password
	// turns the sign-in form into a way to find out who has an account here.
	const refuse = "That username and password do not match."

	user, hash, err := s.store.UserByName(r.Context(), strings.TrimSpace(body.Username))
	if errors.Is(err, store.ErrNotFound) {
		fail(w, http.StatusUnauthorized, refuse)
		return
	}
	if err != nil {
		s.oops(w, "reading user", err)
		return
	}
	ok, stale := auth.Check(hash, body.Password)
	if !ok {
		fail(w, http.StatusUnauthorized, refuse)
		return
	}

	// The password was right and the hash was the old service's. Now is the
	// only moment the plaintext is in hand, so it is the only moment this row
	// can be moved to bcrypt. Failing to is not the reader's problem -- they
	// signed in -- so it is logged and the sign-in goes through.
	if stale {
		if next, err := auth.Hash(body.Password, s.cfg.BcryptCost); err != nil {
			s.log.Error("rehashing a migrated password", "user", user.ID, "err", err)
		} else if err := s.store.SetPassword(r.Context(), user.ID, next); err != nil {
			s.log.Error("saving a rehashed password", "user", user.ID, "err", err)
		}
	}

	if err := s.start(w, r, user.ID); err != nil {
		s.oops(w, "starting session", err)
		return
	}
	send(w, http.StatusOK, user)
}

func (s *Server) start(w http.ResponseWriter, r *http.Request, userID int32) error {
	token, err := auth.NewToken()
	if err != nil {
		return err
	}
	if err := s.store.CreateSession(r.Context(), token, userID, s.cfg.SessionLife); err != nil {
		return err
	}
	auth.SetCookie(w, s.cfg.SecureCookie, token, s.cfg.SessionLife)
	return nil
}

func (s *Server) logout(w http.ResponseWriter, r *http.Request, _ int32) {
	if token := auth.TokenFrom(r, s.cfg.SecureCookie); token != "" {
		if err := s.store.DeleteSession(r.Context(), token); err != nil {
			s.oops(w, "ending session", err)
			return
		}
	}
	auth.ClearCookie(w, s.cfg.SecureCookie)
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) logoutEverywhere(w http.ResponseWriter, r *http.Request, userID int32) {
	if err := s.store.DeleteSessionsOf(r.Context(), userID); err != nil {
		s.oops(w, "ending sessions", err)
		return
	}
	auth.ClearCookie(w, s.cfg.SecureCookie)
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) me(w http.ResponseWriter, r *http.Request, userID int32) {
	user, err := s.store.UserByID(r.Context(), userID)
	if err != nil {
		s.oops(w, "reading user", err)
		return
	}
	send(w, http.StatusOK, user)
}

func (s *Server) changePassword(w http.ResponseWriter, r *http.Request, userID int32) {
	body, ok := read[struct {
		Current string `json:"current"`
		New     string `json:"new"`
	}](w, r)
	if !ok {
		return
	}
	user, err := s.store.UserByID(r.Context(), userID)
	if err != nil {
		s.oops(w, "reading user", err)
		return
	}
	_, hash, err := s.store.UserByName(r.Context(), user.Username)
	if err != nil {
		s.oops(w, "reading user", err)
		return
	}
	// The new password is hashed afresh below whatever the old one was in, so
	// changing it retires a migrated hash as surely as signing in does.
	if ok, _ := auth.Check(hash, body.Current); !ok {
		fail(w, http.StatusForbidden, "That is not your current password.")
		return
	}
	if err := auth.ValidPassword(body.New); err != nil {
		fail(w, http.StatusBadRequest, err.Error())
		return
	}
	next, err := auth.Hash(body.New, s.cfg.BcryptCost)
	if err != nil {
		s.oops(w, "hashing password", err)
		return
	}
	if err := s.store.SetPassword(r.Context(), userID, next); err != nil {
		s.oops(w, "saving password", err)
		return
	}
	// Whoever knew the old password should stop being signed in, which means
	// this browser too -- so a new session is started for the one that asked.
	if err := s.store.DeleteSessionsOf(r.Context(), userID); err != nil {
		s.oops(w, "ending sessions", err)
		return
	}
	if err := s.start(w, r, userID); err != nil {
		s.oops(w, "starting session", err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
