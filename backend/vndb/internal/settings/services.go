package settings

import (
	"errors"
	"fmt"
	"path/filepath"
	"time"

	"github.com/kobayashi/neovndb/internal/config"
)

// A scheduled job may be turned off (0) but not run more often than this:
// both reach out to vndb.
const minEvery = time.Minute

// Serve is what the read API's service lets an administrator change: the
// scheduled update and what it does on the way to going live.
type Serve struct {
	UpdateEvery      Duration `json:"update_every"`
	UpdateRetryAfter Duration `json:"update_retry_after"`
	DumpKeep         int      `json:"dump_keep"`
	GuardMaxLoss     float64  `json:"guard_max_loss"`
}

func ServeOf(cfg *config.Config) Serve {
	return Serve{
		UpdateEvery:      Duration(cfg.UpdateEvery),
		UpdateRetryAfter: Duration(cfg.UpdateRetryAfter),
		DumpKeep:         cfg.DumpKeep,
		GuardMaxLoss:     cfg.GuardMaxLoss,
	}
}

// Apply is a copy of cfg with these settings in it, for one run of work that
// reads them from the config.
func (s Serve) Apply(cfg *config.Config) *config.Config {
	c := *cfg
	c.UpdateEvery = time.Duration(s.UpdateEvery)
	c.UpdateRetryAfter = time.Duration(s.UpdateRetryAfter)
	c.DumpKeep = s.DumpKeep
	c.GuardMaxLoss = s.GuardMaxLoss
	return &c
}

func (s Serve) check() error {
	return errors.Join(
		every("update_every", s.UpdateEvery),
		atLeast("update_retry_after", s.UpdateRetryAfter, 0),
		count("dump_keep", s.DumpKeep),
		fraction("guard_max_loss", s.GuardMaxLoss),
	)
}

// OpenServe is the read API's settings, which its CLI commands share.
func OpenServe(cfg *config.Config) (*Live[Serve], error) {
	return Open(filepath.Join(cfg.SettingsDir, "serve.json"), ServeOf(cfg), Serve.check)
}

// Images is what the image mirror lets an administrator change.
type Images struct {
	// "redirect" or "fetch"; see config.Config.ImageMiss.
	Miss        string   `json:"miss"`
	CrawlEvery  Duration `json:"crawl_every"`
	CrawlPerRun int      `json:"crawl_per_run"`
	CrawlDelay  Duration `json:"crawl_delay"`
}

func ImagesOf(cfg *config.Config) Images {
	return Images{
		Miss:        cfg.ImageMiss,
		CrawlEvery:  Duration(cfg.ImageCrawlEvery),
		CrawlPerRun: cfg.ImageCrawlPerRun,
		CrawlDelay:  Duration(cfg.ImageCrawlDelay),
	}
}

// Apply is a copy of cfg with these settings in it.
func (s Images) Apply(cfg *config.Config) *config.Config {
	c := *cfg
	c.ImageMiss = s.Miss
	c.ImageCrawlEvery = time.Duration(s.CrawlEvery)
	c.ImageCrawlPerRun = s.CrawlPerRun
	c.ImageCrawlDelay = time.Duration(s.CrawlDelay)
	return &c
}

func (s Images) check() error {
	var miss error
	if s.Miss != "redirect" && s.Miss != "fetch" {
		miss = fmt.Errorf(`miss is "redirect" or "fetch", not %q`, s.Miss)
	}
	return errors.Join(
		miss,
		every("crawl_every", s.CrawlEvery),
		count("crawl_per_run", s.CrawlPerRun),
		atLeast("crawl_delay", s.CrawlDelay, 0),
	)
}

func OpenImages(cfg *config.Config) (*Live[Images], error) {
	return Open(filepath.Join(cfg.SettingsDir, "images.json"), ImagesOf(cfg), Images.check)
}

func every(name string, d Duration) error {
	if d != 0 && time.Duration(d) < minEvery {
		return fmt.Errorf("%s is 0 (off) or at least %s", name, minEvery)
	}
	return nil
}

func atLeast(name string, d, least Duration) error {
	if d < least {
		return fmt.Errorf("%s is at least %s", name, time.Duration(least))
	}
	return nil
}

func count(name string, n int) error {
	if n < 0 {
		return fmt.Errorf("%s is 0 or more", name)
	}
	return nil
}

func fraction(name string, f float64) error {
	if f < 0 || f > 1 {
		return fmt.Errorf("%s is a fraction from 0 to 1", name)
	}
	return nil
}
