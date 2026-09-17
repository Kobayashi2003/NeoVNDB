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

// The seven letters vndb gives its types, and the shape of an id: a letter
// then a number. Parsing it here rather than storing it whole keeps this
// service's rows the same shape as the mirror's, where the prefix is implied
// by which column the number sits in.
const kinds = "vrcpsgi"

const (
	maxName = 64
	// What one page of marks holds by default, and the most it will hold when
	// a caller names its own size. The ceiling is the read API's id-list limit:
	// a page of marks is turned back into things by handing those ids to it,
	// so a page it could not resolve in one request would be no use.
	pageSize    = 24
	maxPageSize = 100
	// How much of a list can be handed over at once for the read API to sort
	// or search. The ceiling is its id-list limit, and past it a collection
	// can still be read in the order it was made -- which needs no such trick.
	maxItems = 1000
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

// positive reads a whole number from the query, or leaves it at fallback. A
// max of 0 means there is no ceiling; above one, asking for more is refused
// rather than quietly reduced, so a caller is never told it got what it asked
// for when it did not.
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
	page, ok := positive(w, r, "page", 1, 0)
	if !ok {
		return
	}
	limit, ok := positive(w, r, "limit", pageSize, maxPageSize)
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

// items hands over the whole list, so that the read API can be asked to sort
// or search it. See store.Items for why this service cannot do either itself.
//
// Capped, because it all has to fit in one request to the read API afterwards,
// and that request carries the ids in its address. A caller that gets fewer
// than `count` knows this list is past what the trick supports.
func (s *Server) items(w http.ResponseWriter, r *http.Request, userID int32) {
	id, ok := pathInt(r, "id")
	if !ok {
		fail(w, http.StatusBadRequest, "That is not a list.")
		return
	}
	items, total, err := s.store.Items(r.Context(), userID, id, maxItems)
	if !s.answer(w, "reading a collection", err) {
		return
	}
	send(w, http.StatusOK, map[string]any{"items": items, "count": total})
}

// removeMarks and moveMarks are the page-at-a-time forms of the two singular
// routes above. A reader clearing out a list works in handfuls, and a handful
// of round trips is both slower and less certain than one -- half a move is a
// state nobody asked for.
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

// A page-at-a-time request: the list it is about, the ids, and for a move the
// list they are going to.
type batchOf struct {
	list  int32
	to    int32
	kind  string
	items []int32
}

// batch reads what both routes above read identically. Every id has to be the
// one kind -- they are going onto or off a list that holds one kind -- so the
// kind is taken from the first and the rest are held to it.
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
	case len(body.Items) > maxPageSize:
		fail(w, http.StatusBadRequest, fmt.Sprintf("At most %d at a time.", maxPageSize))
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

// A rating is about the thing rather than about any list it is on, so these
// routes take an id and nothing else. Clearing one is a DELETE rather than a
// rating of zero: "I have no opinion" is not a low score.
//
// They do not go through answer(): its two named cases are both about lists,
// and neither is reachable from here. An unknown id is not an error -- there
// is nothing to look up, only a row that is not there.
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
