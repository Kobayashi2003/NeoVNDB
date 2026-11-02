package admin

import (
	"errors"
	"io"
	"net/http"
	"strings"

	"github.com/kobayashi/neovndb/internal/settings"
)

// settingsView is a service's settings as the admin page shows them.
type settingsView[T any] struct {
	Values T `json:"values"`
	// What .env says, which a value set back to drops out of the file.
	Env     T        `json:"env"`
	Changed []string `json:"changed"`
}

// handleSettings serves a service's settings at /admin/settings: GET reads
// them, PATCH changes the fields its body names.
func handleSettings[T any](mux *http.ServeMux, live *settings.Live[T]) {
	view := func() settingsView[T] {
		return settingsView[T]{Values: live.Get(), Env: live.Base(), Changed: live.Changed()}
	}
	mux.HandleFunc("GET /admin/settings", func(w http.ResponseWriter, r *http.Request) {
		send(w, http.StatusOK, view())
	})
	mux.HandleFunc("PATCH /admin/settings", func(w http.ResponseWriter, r *http.Request) {
		body, err := io.ReadAll(http.MaxBytesReader(w, r.Body, 1<<16))
		if err != nil {
			fail(w, http.StatusBadRequest, "That request body could not be read.")
			return
		}
		switch _, err := live.Set(body); {
		case errors.Is(err, settings.ErrInvalid):
			// Which value and why, for the person who typed it.
			fail(w, http.StatusBadRequest, strings.TrimPrefix(err.Error(), settings.ErrInvalid.Error()+": "))
			return
		case err != nil:
			// Nothing changed; the file says why.
			fail(w, http.StatusInternalServerError, err.Error())
			return
		}
		send(w, http.StatusOK, view())
	})
}
