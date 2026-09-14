package api

import (
	"context"
	"errors"
	"net/http"
	"strconv"
	"strings"

	"github.com/kobayashi/neovndb-users/internal/store"
)

// The seven letters vndb gives its types, and the shape of an id: a letter
// then a number. Parsing it here rather than storing it whole keeps this
// service's rows the same shape as the mirror's, where the prefix is implied
// by which column the number sits in.
const kinds = "vrcpsgi"

const (
	maxName  = 64
	pageSize = 100
)

func parseID(raw string) (kind string, num int32, ok bool) {
	if len(raw) < 2 || !strings.ContainsAny(raw[:1], kinds) {
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

func validName(name string) error {
	name = strings.TrimSpace(name)
	if name == "" {
		return errors.New("a list needs a name")
	}
	if len(name) > maxName {
		return errors.New("that name is too long")
	}
	return nil
}

// answer turns a store error into the right reply. Not found and taken are
// things a caller can act on; anything else is ours.
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

func (s *Server) listCollections(w http.ResponseWriter, r *http.Request, userID int32) {
	kind := r.URL.Query().Get("type")
	if kind != "" && !strings.ContainsAny(kind, kinds) {
		fail(w, http.StatusBadRequest, "That is not a type.")
		return
	}
	out, err := s.store.Collections(r.Context(), userID, kind)
	if !s.answer(w, "reading collections", err) {
		return
	}
	send(w, http.StatusOK, map[string]any{"results": out})
}

func (s *Server) createCollection(w http.ResponseWriter, r *http.Request, userID int32) {
	body, ok := read[struct {
		Type string `json:"type"`
		Name string `json:"name"`
	}](w, r)
	if !ok {
		return
	}
	if len(body.Type) != 1 || !strings.ContainsAny(body.Type, kinds) {
		fail(w, http.StatusBadRequest, "That is not a type.")
		return
	}
	if err := validName(body.Name); err != nil {
		fail(w, http.StatusBadRequest, err.Error())
		return
	}
	c, err := s.store.CreateCollection(r.Context(), userID, body.Type, strings.TrimSpace(body.Name))
	if !s.answer(w, "creating collection", err) {
		return
	}
	send(w, http.StatusCreated, c)
}

func (s *Server) renameCollection(w http.ResponseWriter, r *http.Request, userID int32) {
	id, ok := pathInt(r, "id")
	if !ok {
		fail(w, http.StatusBadRequest, "That is not a list.")
		return
	}
	body, ok := read[struct {
		Name string `json:"name"`
	}](w, r)
	if !ok {
		return
	}
	if err := validName(body.Name); err != nil {
		fail(w, http.StatusBadRequest, err.Error())
		return
	}
	if !s.answer(w, "renaming collection",
		s.store.RenameCollection(r.Context(), userID, id, strings.TrimSpace(body.Name))) {
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) deleteCollection(w http.ResponseWriter, r *http.Request, userID int32) {
	id, ok := pathInt(r, "id")
	if !ok {
		fail(w, http.StatusBadRequest, "That is not a list.")
		return
	}
	if !s.answer(w, "deleting collection", s.store.DeleteCollection(r.Context(), userID, id)) {
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) listMarks(w http.ResponseWriter, r *http.Request, userID int32) {
	id, ok := pathInt(r, "id")
	if !ok {
		fail(w, http.StatusBadRequest, "That is not a list.")
		return
	}
	page := 1
	if raw := r.URL.Query().Get("page"); raw != "" {
		n, err := strconv.Atoi(raw)
		if err != nil || n < 1 {
			fail(w, http.StatusBadRequest, "page must be a positive number.")
			return
		}
		page = n
	}

	marks, total, err := s.store.Marks(r.Context(), userID, id, pageSize, (page-1)*pageSize)
	if !s.answer(w, "reading marks", err) {
		return
	}
	send(w, http.StatusOK, map[string]any{
		"results": marks,
		"count":   total,
		"more":    page*pageSize < total,
	})
}

func (s *Server) addMark(w http.ResponseWriter, r *http.Request, userID int32) {
	s.mark(w, r, userID, s.store.AddMark)
}

func (s *Server) removeMark(w http.ResponseWriter, r *http.Request, userID int32) {
	s.mark(w, r, userID, s.store.RemoveMark)
}

// mark is the half the two share: the same parsing, the same checks inside the
// store, the same reply.
func (s *Server) mark(
	w http.ResponseWriter, r *http.Request, userID int32,
	do func(ctx context.Context, userID, id int32, kind string, item int32) error,
) {
	id, ok := pathInt(r, "id")
	if !ok {
		fail(w, http.StatusBadRequest, "That is not a list.")
		return
	}
	kind, item, ok := parseID(r.PathValue("item"))
	if !ok {
		fail(w, http.StatusBadRequest, "That is not an id.")
		return
	}
	if !s.answer(w, "changing marks", do(r.Context(), userID, id, kind, item)) {
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) holding(w http.ResponseWriter, r *http.Request, userID int32) {
	kind, item, ok := parseID(r.PathValue("item"))
	if !ok {
		fail(w, http.StatusBadRequest, "That is not an id.")
		return
	}
	ids, err := s.store.Holding(r.Context(), userID, kind, item)
	if !s.answer(w, "reading collections", err) {
		return
	}
	send(w, http.StatusOK, map[string]any{"collections": ids})
}
