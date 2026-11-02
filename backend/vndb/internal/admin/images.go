package admin

import (
	"context"
	"net/http"

	"github.com/kobayashi/neovndb/internal/settings"
)

// Images is the image mirror's admin surface: the crawl that fills the disk
// ahead of readers, whose last report says how much of vndb is held, and the
// settings behind it.
type Images struct {
	crawl *Job
	live  *settings.Live[settings.Images]
	base  context.Context
}

func NewImages(base context.Context, live *settings.Live[settings.Images], crawl *Job) *Images {
	return &Images{crawl: crawl, live: live, base: base}
}

func (i *Images) Routes() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /admin/status", i.status)
	mux.HandleFunc("POST /admin/crawl", i.startCrawl)
	handleSettings(mux, i.live)
	return mux
}

func (i *Images) status(w http.ResponseWriter, r *http.Request) {
	s := i.live.Get()
	send(w, http.StatusOK, map[string]any{
		"crawl": i.crawl.State(),
		"miss":  s.Miss,
		"schedule": map[string]any{
			"every":   s.CrawlEvery,
			"per_run": s.CrawlPerRun,
			"delay":   s.CrawlDelay,
		},
	})
}

func (i *Images) startCrawl(w http.ResponseWriter, r *http.Request) {
	if !i.crawl.Start(i.base) {
		fail(w, http.StatusConflict, "A crawl is already running.")
		return
	}
	send(w, http.StatusAccepted, i.crawl.State())
}
