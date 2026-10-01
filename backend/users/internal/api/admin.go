package api

import (
	"errors"
	"net/http"
	"time"

	"github.com/kobayashi/neovndb-users/internal/backup"
	"github.com/kobayashi/neovndb-users/internal/store"
)

// verifyAdmin answers the edge in front of the other services' /admin routes;
// only the status matters, and adminOnly has already refused anyone else.
func (s *Server) verifyAdmin(w http.ResponseWriter, _ *http.Request, _ int32) {
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) accounts(w http.ResponseWriter, r *http.Request, _ int32) {
	list, err := s.store.Accounts(r.Context())
	if err != nil {
		s.oops(w, "listing accounts", err)
		return
	}
	send(w, http.StatusOK, map[string]any{"results": list})
}

// target is the account an admin route acts on. An administrator acting on
// their own account is refused: the page is the only way back in, so leaving
// it is done from the command line (`users admin <name> off`) if at all.
func (s *Server) target(w http.ResponseWriter, r *http.Request, self int32) (int32, bool) {
	id, ok := pathInt(r, "id")
	if !ok {
		fail(w, http.StatusBadRequest, "That is not an account id.")
		return 0, false
	}
	if id == self {
		fail(w, http.StatusConflict, "Not on your own account.")
		return 0, false
	}
	return id, true
}

func (s *Server) setAdmin(w http.ResponseWriter, r *http.Request, self int32) {
	id, ok := s.target(w, r, self)
	if !ok {
		return
	}
	body, ok := read[struct {
		IsAdmin bool `json:"is_admin"`
	}](w, r)
	if !ok {
		return
	}
	s.onAccount(w, "setting admin", s.store.SetAdmin(r.Context(), id, body.IsAdmin))
}

func (s *Server) signOutUser(w http.ResponseWriter, r *http.Request, self int32) {
	if id, ok := s.target(w, r, self); ok {
		s.onAccount(w, "signing a user out", s.store.DeleteSessionsOf(r.Context(), id))
	}
}

func (s *Server) removeUser(w http.ResponseWriter, r *http.Request, self int32) {
	if id, ok := s.target(w, r, self); ok {
		s.onAccount(w, "deleting a user", s.store.DeleteUser(r.Context(), id))
	}
}

func (s *Server) onAccount(w http.ResponseWriter, doing string, err error) {
	switch {
	case err == nil:
		w.WriteHeader(http.StatusNoContent)
	case errors.Is(err, store.ErrNotFound):
		fail(w, http.StatusNotFound, "No such account.")
	default:
		s.oops(w, doing, err)
	}
}

func (s *Server) backups(w http.ResponseWriter, r *http.Request, _ int32) {
	copies, err := backup.List(s.cfg.BackupDir)
	if err != nil {
		s.oops(w, "listing backups", err)
		return
	}
	send(w, http.StatusOK, map[string]any{
		"results":     copies,
		"every":       s.cfg.BackupEvery.String(),
		"check_every": s.cfg.BackupCheckEvery.String(),
		"keep":        s.cfg.BackupKeep,
	})
}

// backUp dumps now. The user database is small, so the answer waits for it.
func (s *Server) backUp(w http.ResponseWriter, r *http.Request, _ int32) {
	path, err := backup.Run(r.Context(), backup.OptionsFrom(s.cfg), time.Now())
	if err != nil {
		s.oops(w, "backing up", err)
		return
	}
	s.log.Info("backed up", "file", path, "by", "admin page")
	s.backups(w, r, 0)
}
