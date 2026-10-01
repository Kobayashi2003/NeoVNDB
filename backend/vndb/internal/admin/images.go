package admin

import (
	"context"
	"net/http"

	"github.com/kobayashi/neovndb/internal/config"
)

// Images is the image mirror's admin surface: the crawl that fills the disk
// ahead of readers, whose last report says how much of vndb is held.
type Images struct {
	crawl *Job
	cfg   *config.Config
	base  context.Context
}

func NewImages(base context.Context, cfg *config.Config, crawl *Job) *Images {
	return &Images{crawl: crawl, cfg: cfg, base: base}
}

func (i *Images) Routes() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /admin/status", i.status)
	mux.HandleFunc("POST /admin/crawl", i.startCrawl)
	return mux
}

func (i *Images) status(w http.ResponseWriter, r *http.Request) {
	send(w, http.StatusOK, map[string]any{
		"crawl": i.crawl.State(),
		"schedule": map[string]any{
			"every":   i.cfg.ImageCrawlEvery.String(),
			"per_run": i.cfg.ImageCrawlPerRun,
			"delay":   i.cfg.ImageCrawlDelay.String(),
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
