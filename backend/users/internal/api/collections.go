package api

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"strings"

	"github.com/kobayashi/neovndb-users/internal/store"
)

// vndb ids are stored as type letter plus number, as in the mirror.
const kinds = "vrcpsgi"

// validKind reports whether k is exactly one of the type letters.
func validKind(k string) bool { return len(k) == 1 && strings.Contains(kinds, k) }

// What the column holds, so not a setting.
const maxName = 64

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

func (s *Server) listCollections(w http.ResponseWriter, r *http.Request, userID int32) {
	kind := r.URL.Query().Get("type")
	if kind != "" && !validKind(kind) {
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
	if !validKind(body.Type) {
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
	page, ok := positive(w, r, "page", 1, 0)
	if !ok {
		return
	}
	limit, ok := positive(w, r, "limit", s.cfg.PageSize, s.cfg.MaxPageSize)
	if !ok {
		return
	}

	marks, total, err := s.store.Marks(r.Context(), userID, id, limit, (page-1)*limit)
	if !s.answer(w, "reading marks", err) {
		return
	}
	send(w, http.StatusOK, map[string]any{
		"results": marks,
		"count":   total,
		"more":    page*limit < total,
	})
}

func (s *Server) addMark(w http.ResponseWriter, r *http.Request, userID int32) {
	s.mark(w, r, userID, s.store.AddMark)
}

func (s *Server) removeMark(w http.ResponseWriter, r *http.Request, userID int32) {
	s.mark(w, r, userID, s.store.RemoveMark)
}

// mark is shared by addMark and removeMark.
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

// items returns the whole list for the read API to sort or search. Capped
// because the ids travel in one URL; fewer than `count` means too long.
func (s *Server) items(w http.ResponseWriter, r *http.Request, userID int32) {
	id, ok := pathInt(r, "id")
	if !ok {
		fail(w, http.StatusBadRequest, "That is not a list.")
		return
	}
	items, total, err := s.store.Items(r.Context(), userID, id, s.cfg.MaxItems)
	if !s.answer(w, "reading a collection", err) {
		return
	}
	send(w, http.StatusOK, map[string]any{"items": items, "count": total})
}

// removeMarks and moveMarks are the bulk, all-or-nothing forms.
func (s *Server) addMarks(w http.ResponseWriter, r *http.Request, userID int32) {
	b, ok := s.batch(w, r)
	if !ok {
		return
	}
	n, err := s.store.AddMarks(r.Context(), userID, b.list, b.kind, b.items)
	if !s.answer(w, "adding marks", err) {
		return
	}
	send(w, http.StatusOK, map[string]any{"changed": n})
}

func (s *Server) removeMarks(w http.ResponseWriter, r *http.Request, userID int32) {
	b, ok := s.batch(w, r)
	if !ok {
		return
	}
	n, err := s.store.RemoveMarks(r.Context(), userID, b.list, b.kind, b.items)
	if !s.answer(w, "removing marks", err) {
		return
	}
	send(w, http.StatusOK, map[string]any{"changed": n})
}

func (s *Server) moveMarks(w http.ResponseWriter, r *http.Request, userID int32) {
	b, ok := s.batch(w, r)
	if !ok {
		return
	}
	if b.to < 1 {
		fail(w, http.StatusBadRequest, "That is not a list to move to.")
		return
	}
	n, err := s.store.MoveMarks(r.Context(), userID, b.list, b.to, b.kind, b.items)
	if !s.answer(w, "moving marks", err) {
		return
	}
	send(w, http.StatusOK, map[string]any{"changed": n})
}

type batchOf struct {
	list  int32
	to    int32
	kind  string
	items []int32
}

// batch parses a bulk request; every id must share the first one's type.
func (s *Server) batch(w http.ResponseWriter, r *http.Request) (batchOf, bool) {
	var b batchOf

	list, ok := pathInt(r, "id")
	if !ok {
		fail(w, http.StatusBadRequest, "That is not a list.")
		return b, false
	}
	b.list = list

	body, ok := read[struct {
		Items []string `json:"items"`
		To    int32    `json:"to"`
	}](w, r)
	if !ok {
		return b, false
	}
	b.to = body.To

	switch {
	case len(body.Items) == 0:
		fail(w, http.StatusBadRequest, "Name at least one thing to act on.")
		return b, false
	case s.cfg.MaxPageSize > 0 && len(body.Items) > s.cfg.MaxPageSize:
		fail(w, http.StatusBadRequest, fmt.Sprintf("At most %d at a time.", s.cfg.MaxPageSize))
		return b, false
	}

	for _, raw := range body.Items {
		kind, num, valid := parseID(raw)
		if !valid {
			fail(w, http.StatusBadRequest, fmt.Sprintf("%q is not an id.", raw))
			return b, false
		}
		if b.kind == "" {
			b.kind = kind
		} else if kind != b.kind {
			fail(w, http.StatusBadRequest, "Those are not all the same kind of thing.")
			return b, false
		}
		b.items = append(b.items, num)
	}
	return b, true
}

/* --- What a reader thought of something ---------------------------------- */

// Ratings are per item, not per list. Clearing is a DELETE, not a zero.
func (s *Server) rating(w http.ResponseWriter, r *http.Request, userID int32) {
	kind, item, ok := parseID(r.PathValue("item"))
	if !ok {
		fail(w, http.StatusBadRequest, "That is not an id.")
		return
	}
	got, err := s.store.Rating(r.Context(), userID, kind, item)
	if err != nil {
		s.oops(w, "reading a rating", err)
		return
	}
	send(w, http.StatusOK, map[string]any{"rating": got})
}

func (s *Server) setRating(w http.ResponseWriter, r *http.Request, userID int32) {
	kind, item, ok := parseID(r.PathValue("item"))
	if !ok {
		fail(w, http.StatusBadRequest, "That is not an id.")
		return
	}
	body, ok := read[struct {
		Rating int16 `json:"rating"`
	}](w, r)
	if !ok {
		return
	}
	if body.Rating < 1 || body.Rating > 5 {
		fail(w, http.StatusBadRequest, "A rating is between 1 and 5.")
		return
	}
	if err := s.store.SetRating(r.Context(), userID, kind, item, body.Rating); err != nil {
		s.oops(w, "saving a rating", err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) clearRating(w http.ResponseWriter, r *http.Request, userID int32) {
	kind, item, ok := parseID(r.PathValue("item"))
	if !ok {
		fail(w, http.StatusBadRequest, "That is not an id.")
		return
	}
	if err := s.store.ClearRating(r.Context(), userID, kind, item); err != nil {
		s.oops(w, "clearing a rating", err)
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
