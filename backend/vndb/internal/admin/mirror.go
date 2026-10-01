package admin

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/kobayashi/neovndb/internal/config"
	"github.com/kobayashi/neovndb/internal/db"
	"github.com/kobayashi/neovndb/internal/dump"
)

// transPage is how many tags or traits the translation table shows at once.
const transPage = 50

// Mirror is the read API's admin surface: its generations, the update that
// replaces them, and the translations served with them.
type Mirror struct {
	store  *db.Store
	cfg    *config.Config
	log    *slog.Logger
	update *Job
	// What a run started from the page runs under: the process, not the
	// request, which ends long before an import does.
	base context.Context
}

func NewMirror(base context.Context, store *db.Store, cfg *config.Config, log *slog.Logger, update *Job) *Mirror {
	return &Mirror{store: store, cfg: cfg, log: log, update: update, base: base}
}

func (m *Mirror) Routes() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /admin/status", m.status)
	mux.HandleFunc("POST /admin/update", m.startUpdate)
	mux.HandleFunc("POST /admin/rollback", m.rollback)
	mux.HandleFunc("GET /admin/trans", m.translatable)
	mux.HandleFunc("PUT /admin/trans", m.translate)
	mux.HandleFunc("GET /admin/trans/export", m.export)
	return mux
}

type generation struct {
	Schema      string     `json:"schema"`
	Code        string     `json:"code"`
	PublishedAt *time.Time `json:"published_at"`
	StartedAt   time.Time  `json:"started_at"`
	FinishedAt  *time.Time `json:"finished_at"`
}

func (m *Mirror) status(w http.ResponseWriter, r *http.Request) {
	st, err := m.store.Status(r.Context())
	if err != nil {
		m.oops(w, "reading status", err)
		return
	}
	archives, err := dump.Archives(m.cfg.DumpDir)
	if err != nil {
		m.oops(w, "listing archives", err)
		return
	}
	counts, err := m.store.TranslationCounts(r.Context())
	if err != nil {
		m.oops(w, "counting translations", err)
		return
	}

	gens := make([]generation, 0, len(st.Generations))
	for _, g := range st.Generations {
		gens = append(gens, generation{Schema: g.Schema, Code: g.Code,
			PublishedAt: g.PublishedAt, StartedAt: g.StartedAt, FinishedAt: g.FinishedAt})
	}
	send(w, http.StatusOK, map[string]any{
		"database":    map[string]any{"server": st.Server, "bytes": st.SizeBytes},
		"generations": gens,
		"ddl_stale":   st.DDLStale,
		"archives":    archives,
		"dump_keep":   m.cfg.DumpKeep,
		"update":      m.update.State(),
		"schedule": map[string]string{
			"every":       m.cfg.UpdateEvery.String(),
			"retry_after": m.cfg.UpdateRetryAfter.String(),
		},
		"translations": map[string]any{
			"lang": m.store.TransLang(), "terms": counts.Terms, "passages": counts.Passages,
		},
	})
}

func (m *Mirror) startUpdate(w http.ResponseWriter, r *http.Request) {
	if !m.update.Start(m.base) {
		fail(w, http.StatusConflict, "An update is already running.")
		return
	}
	send(w, http.StatusAccepted, m.update.State())
}

// rollback holds the import lock, so it cannot land in the middle of an
// import's own swap.
func (m *Mirror) rollback(w http.ResponseWriter, r *http.Request) {
	err := m.store.Exclusive(r.Context(), db.ImportLock, func() error {
		return m.store.Rollback(r.Context())
	})
	switch {
	case errors.Is(err, db.ErrBusy):
		fail(w, http.StatusConflict, "An import is running; roll back once it is done.")
		return
	case err != nil:
		// No previous generation is the likely reason, and it says so.
		fail(w, http.StatusConflict, err.Error())
		return
	}
	live, err := m.store.Describe(r.Context(), db.SchemaLive)
	if err != nil || live == nil {
		m.oops(w, "reading the live generation", err)
		return
	}
	m.log.Info("rolled back", "live", live.Code)
	send(w, http.StatusOK, map[string]string{"live": live.Code})
}

// translatable is one page of tags or traits for the translation table:
// ?category=tag|trait, ?missing=true for those with something untranslated,
// ?q= to narrow by name, group or translation.
func (m *Mirror) translatable(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	all, err := m.store.Translatable(r.Context(), q.Get("category"))
	if err != nil {
		fail(w, http.StatusBadRequest, err.Error())
		return
	}

	var missingNames, missingTexts int
	for _, t := range all {
		if t.NameTo == "" {
			missingNames++
		}
		if t.Description != "" && t.DescriptionTo == "" {
			missingTexts++
		}
	}

	onlyMissing := q.Get("missing") == "true"
	needle := strings.ToLower(strings.TrimSpace(q.Get("q")))
	shown := make([]db.Translatable, 0, len(all))
	for _, t := range all {
		if onlyMissing && t.NameTo != "" && (t.Description == "" || t.DescriptionTo != "") {
			continue
		}
		if needle != "" && !strings.Contains(strings.ToLower(t.Name+"\n"+t.Group+"\n"+t.NameTo), needle) {
			continue
		}
		shown = append(shown, t)
	}

	page, _ := strconv.Atoi(q.Get("page"))
	page = max(page, 1)
	from := min((page-1)*transPage, len(shown))
	to := min(from+transPage, len(shown))
	send(w, http.StatusOK, map[string]any{
		"results":              shown[from:to],
		"count":                len(shown),
		"page_size":            transPage,
		"total":                len(all),
		"missing_names":        missingNames,
		"missing_descriptions": missingTexts,
	})
}

type translation struct {
	Category string `json:"category"`
	ID       int32  `json:"id"`
	// "name" or "description".
	Field  string `json:"field"`
	Target string `json:"target"`
}

// translate stores one translation of one tag or trait; an empty target
// removes it. The English is read here rather than sent, so what is stored is
// keyed by exactly the text the API serves.
func (m *Mirror) translate(w http.ResponseWriter, r *http.Request) {
	var body translation
	dec := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<20))
	dec.DisallowUnknownFields()
	if err := dec.Decode(&body); err != nil {
		fail(w, http.StatusBadRequest, "That request body could not be read.")
		return
	}
	if body.Field != "name" && body.Field != "description" {
		fail(w, http.StatusBadRequest, `field is "name" or "description"`)
		return
	}

	all, err := m.store.Translatable(r.Context(), body.Category)
	if err != nil {
		fail(w, http.StatusBadRequest, err.Error())
		return
	}
	var source *db.Translatable
	for i := range all {
		if all[i].ID == body.ID {
			source = &all[i]
		}
	}
	if source == nil {
		fail(w, http.StatusNotFound, "No such "+body.Category+".")
		return
	}

	long := body.Field == "description"
	english := source.Name
	if long {
		english = source.Description
	}
	if err := m.store.SetTranslation(r.Context(), body.Category, english, strings.TrimSpace(body.Target), long); err != nil {
		// Lost markup is the reason a translator can act on.
		fail(w, http.StatusBadRequest, err.Error())
		return
	}
	send(w, http.StatusNoContent, nil)
}

// export hands over the corpus as a file, to be committed as
// internal/trans/init.json (`neovndb trans export` writes it there directly).
func (m *Mirror) export(w http.ResponseWriter, r *http.Request) {
	corpus, err := m.store.Corpus(r.Context())
	if err != nil {
		m.oops(w, "exporting translations", err)
		return
	}
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Content-Disposition", `attachment; filename="init.json"`)
	if err := corpus.Encode(w); err != nil {
		m.log.Error("writing the export", "err", err)
	}
}

func (m *Mirror) oops(w http.ResponseWriter, doing string, err error) {
	m.log.Error(doing, "err", err)
	fail(w, http.StatusInternalServerError, "Something went wrong.")
}

func send(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if body != nil {
		_ = json.NewEncoder(w).Encode(body)
	}
}

func fail(w http.ResponseWriter, status int, message string) {
	send(w, status, map[string]string{"error": message})
}
