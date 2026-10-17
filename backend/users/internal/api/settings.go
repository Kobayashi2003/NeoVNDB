// What follows the reader between devices: preferences and named searches.

package api

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"

	"github.com/kobayashi/neovndb-users/internal/store"
)

const (
	// The site's preferences are a dozen short fields, about 150 bytes; this
	// is room to grow, not a setting.
	maxPrefs = 2048
	// A listing's query: filters, the condition expression, sort and search.
	// Longer than any address a person builds by clicking.
	maxQuery = 2048
)

func (s *Server) prefs(w http.ResponseWriter, r *http.Request, userID int32) {
	got, err := s.store.Prefs(r.Context(), userID)
	if err != nil {
		s.oops(w, "reading preferences", err)
		return
	}
	// null until the reader's first device has sent its own.
	send(w, http.StatusOK, map[string]any{"prefs": got})
}

// setPrefs keeps whatever object the site sends. The site checks each field
// when it reads them back, and falls back to its default for one it does not
// know, so a new field or an older device needs nothing here.
func (s *Server) setPrefs(w http.ResponseWriter, r *http.Request, userID int32) {
	body, err := io.ReadAll(http.MaxBytesReader(w, r.Body, maxPrefs))
	if err != nil {
		fail(w, http.StatusBadRequest, fmt.Sprintf("Preferences are at most %d bytes.", maxPrefs))
		return
	}
	var fields map[string]json.RawMessage
	if json.Unmarshal(body, &fields) != nil || fields == nil {
		fail(w, http.StatusBadRequest, "Preferences are a JSON object.")
		return
	}
	if err := s.store.SetPrefs(r.Context(), userID, bytes.TrimSpace(body)); err != nil {
		s.oops(w, "saving preferences", err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// validQuery checks a listing's query as the site would build it: no leading
// ?, and something url.ParseQuery reads. What the filters mean is the read
// API's business; a stale one there only narrows nothing.
func validQuery(q string) error {
	switch {
	case q == "":
		return errors.New("a search needs something to search for")
	case len(q) > maxQuery:
		return fmt.Errorf("a search is at most %d characters", maxQuery)
	case strings.HasPrefix(q, "?"):
		return errors.New("a search is the query without its ?")
	}
	if _, err := url.ParseQuery(q); err != nil {
		return errors.New("that is not a query")
	}
	return nil
}

// settled maps the store's answers for a named search to replies.
func (s *Server) settled(w http.ResponseWriter, doing string, err error) bool {
	switch {
	case err == nil:
		return true
	case errors.Is(err, store.ErrNotFound):
		fail(w, http.StatusNotFound, "No such search.")
	case errors.Is(err, store.ErrTaken):
		fail(w, http.StatusConflict, "You already have a search with that name.")
	case errors.Is(err, store.ErrFull):
		fail(w, http.StatusConflict, fmt.Sprintf("You can keep at most %d searches.", s.cfg.MaxSearches))
	default:
		s.oops(w, doing, err)
	}
	return false
}

func (s *Server) searches(w http.ResponseWriter, r *http.Request, userID int32) {
	kind := r.URL.Query().Get("type")
	if kind != "" && !validKind(kind) {
		fail(w, http.StatusBadRequest, "That is not a type.")
		return
	}
	out, err := s.store.Searches(r.Context(), userID, kind)
	if !s.settled(w, "reading searches", err) {
		return
	}
	send(w, http.StatusOK, map[string]any{"results": out})
}

func (s *Server) createSearch(w http.ResponseWriter, r *http.Request, userID int32) {
	body, ok := read[struct {
		Type  string `json:"type"`
		Name  string `json:"name"`
		Query string `json:"query"`
	}](w, r)
	if !ok {
		return
	}
	if !validKind(body.Type) {
		fail(w, http.StatusBadRequest, "That is not a type.")
		return
	}
	if err := validSearchName(body.Name); err != nil {
		fail(w, http.StatusBadRequest, err.Error())
		return
	}
	if err := validQuery(body.Query); err != nil {
		fail(w, http.StatusBadRequest, err.Error())
		return
	}
	made, err := s.store.CreateSearch(r.Context(), userID, body.Type,
		strings.TrimSpace(body.Name), body.Query, s.cfg.MaxSearches)
	if !s.settled(w, "saving a search", err) {
		return
	}
	send(w, http.StatusCreated, made)
}

func (s *Server) deleteSearch(w http.ResponseWriter, r *http.Request, userID int32) {
	id, ok := pathInt(r, "id")
	if !ok {
		fail(w, http.StatusBadRequest, "That is not a search.")
		return
	}
	if !s.settled(w, "deleting a search", s.store.DeleteSearch(r.Context(), userID, id)) {
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// validSearchName is a list's rule with a search's words.
func validSearchName(name string) error {
	name = strings.TrimSpace(name)
	if name == "" {
		return errors.New("a search needs a name")
	}
	if len(name) > maxName {
		return errors.New("that name is too long")
	}
	return nil
}
