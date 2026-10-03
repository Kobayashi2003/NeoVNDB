// What a reader thought of something: one rating per item, not per list.

package api

import (
	"net/http"
	"strings"
)

// Clearing is a DELETE, not a zero.
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

// ratingsOf reads ?type=, the one kind a ratings request is about.
func ratingsOf(w http.ResponseWriter, r *http.Request) (string, bool) {
	kind := r.URL.Query().Get("type")
	if !validKind(kind) {
		fail(w, http.StatusBadRequest, "type is one of "+strings.Join(strings.Split(kinds, ""), ", ")+".")
		return "", false
	}
	return kind, true
}

// ratings is one page of the reader's ratings of a kind, for the ratings page.
func (s *Server) ratings(w http.ResponseWriter, r *http.Request, userID int32) {
	kind, ok := ratingsOf(w, r)
	if !ok {
		return
	}
	sorted, ok := order(w, r, "rating", "rated")
	if !ok {
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
	got, total, err := s.store.Ratings(r.Context(), userID, kind, sorted, limit, (page-1)*limit)
	if err != nil {
		s.oops(w, "reading ratings", err)
		return
	}
	send(w, http.StatusOK, map[string]any{"results": got, "count": total, "more": page*limit < total})
}

// ratedItems is every rating of a kind, as items is for a list.
func (s *Server) ratedItems(w http.ResponseWriter, r *http.Request, userID int32) {
	kind, ok := ratingsOf(w, r)
	if !ok {
		return
	}
	sorted, ok := order(w, r, "rating", "rated")
	if !ok {
		return
	}
	got, total, err := s.store.Ratings(r.Context(), userID, kind, sorted, s.cfg.MaxItems, 0)
	if err != nil {
		s.oops(w, "reading ratings", err)
		return
	}
	send(w, http.StatusOK, map[string]any{"items": got, "count": total})
}

func (s *Server) ratingCounts(w http.ResponseWriter, r *http.Request, userID int32) {
	counts, err := s.store.RatingCounts(r.Context(), userID)
	if err != nil {
		s.oops(w, "counting ratings", err)
		return
	}
	send(w, http.StatusOK, map[string]any{"counts": counts})
}

// setRatings gives every item the same rating; clearRatings takes them back.
func (s *Server) setRatings(w http.ResponseWriter, r *http.Request, userID int32) {
	body, ok := read[struct {
		Items  []string `json:"items"`
		Rating int16    `json:"rating"`
	}](w, r)
	if !ok {
		return
	}
	if body.Rating < 1 || body.Rating > 5 {
		fail(w, http.StatusBadRequest, "A rating is between 1 and 5.")
		return
	}
	kind, items, ok := s.ids(w, body.Items)
	if !ok {
		return
	}
	n, err := s.store.SetRatings(r.Context(), userID, kind, items, body.Rating)
	if err != nil {
		s.oops(w, "saving ratings", err)
		return
	}
	send(w, http.StatusOK, map[string]any{"changed": n})
}

func (s *Server) clearRatings(w http.ResponseWriter, r *http.Request, userID int32) {
	body, ok := read[struct {
		Items []string `json:"items"`
	}](w, r)
	if !ok {
		return
	}
	kind, items, ok := s.ids(w, body.Items)
	if !ok {
		return
	}
	n, err := s.store.ClearRatings(r.Context(), userID, kind, items)
	if err != nil {
		s.oops(w, "clearing ratings", err)
		return
	}
	send(w, http.StatusOK, map[string]any{"changed": n})
}
