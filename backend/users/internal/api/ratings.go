// What a reader thought of something: one rating per item, not per list.

package api

import "net/http"

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
