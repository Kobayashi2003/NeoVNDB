// Accounts and sessions: signing up, in and out, the password, deleting the
// account, and the probe the edge asks before every guarded request.

package api

import (
	"errors"
	"net/http"
	"strconv"
	"strings"

	"github.com/kobayashi/neovndb-users/internal/auth"
	"github.com/kobayashi/neovndb-users/internal/store"
)

type credentials struct {
	Username string `json:"username"`
	Password string `json:"password"`
	Email    string `json:"email"`
}

// verify is called by the edge before every guarded request, images included,
// so it is one indexed lookup answering in headers.
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

	// Only real sign-up attempts count, not validation failures above.
	if ok, wait := s.signUpFrom.take(caller(r)); !ok {
		refuseTooMany(w, wait)
		return
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
	// One message for unknown name and wrong password, so accounts can't be probed.
	const refuse = "That username and password do not match."

	// Counted before any lookup, so refusals are cheap.
	name := strings.TrimSpace(body.Username)
	from := caller(r)
	if ok, wait := s.signInFrom.take(from); !ok {
		refuseTooMany(w, wait)
		return
	}
	if ok, wait := s.signInFor.take(strings.ToLower(name)); !ok {
		refuseTooMany(w, wait)
		return
	}

	user, hash, err := s.store.UserByName(r.Context(), name)
	if errors.Is(err, store.ErrNotFound) {
		auth.Check(s.decoy, body.Password)
		fail(w, http.StatusUnauthorized, refuse)
		return
	}
	if err != nil {
		s.oops(w, "reading user", err)
		return
	}
	if !auth.Check(hash, body.Password) {
		fail(w, http.StatusUnauthorized, refuse)
		return
	}
	// A correct password clears earlier failed attempts.
	s.signInFrom.forget(from)
	s.signInFor.forget(strings.ToLower(name))

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
	if !s.confirm(w, r, userID, body.Current) {
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
	// End every session, this one included, then start a fresh one here.
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

// deleteAccount removes the reader and, by cascade, their sessions, lists,
// marks and ratings. The password is asked again: a session alone, left open
// on a shared machine, should not be enough.
func (s *Server) deleteAccount(w http.ResponseWriter, r *http.Request, userID int32) {
	body, ok := read[struct {
		Password string `json:"password"`
	}](w, r)
	if !ok || !s.confirm(w, r, userID, body.Password) {
		return
	}
	if err := s.store.DeleteUser(r.Context(), userID); err != nil {
		s.oops(w, "deleting account", err)
		return
	}
	auth.ClearCookie(w, s.cfg.SecureCookie)
	w.WriteHeader(http.StatusNoContent)
}

// confirm checks the signed-in reader's password, answering 403 if wrong.
// Counted like sign-in attempts, so a borrowed session cannot be used to
// guess the password without limit.
func (s *Server) confirm(w http.ResponseWriter, r *http.Request, userID int32, password string) bool {
	key := "#" + strconv.Itoa(int(userID))
	if ok, wait := s.signInFor.take(key); !ok {
		refuseTooMany(w, wait)
		return false
	}
	hash, err := s.store.PasswordHash(r.Context(), userID)
	if err != nil {
		s.oops(w, "reading user", err)
		return false
	}
	if !auth.Check(hash, password) {
		fail(w, http.StatusForbidden, "That is not your current password.")
		return false
	}
	s.signInFor.forget(key)
	return true
}
