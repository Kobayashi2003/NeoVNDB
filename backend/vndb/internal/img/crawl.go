package img

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"time"
)

// Known is an image vndb records, with the width that decides its thumbnail.
type Known struct {
	Ref   Ref
	Width int
}

// A Crawler fetches ahead of readers: every image the database knows of, and
// its upstream thumbnail, that the store does not hold yet. t.vndb.org has no
// listing, but the dump's images table is one, so there is nothing to probe.
type Crawler struct {
	store  *Store
	source *Source
	// Known lists what vndb has, from the database; the crawler itself stays
	// free of it.
	Known  func(ctx context.Context) ([]Known, error)
	PerRun int           // fetches per run; 0 means no ceiling
	Delay  time.Duration // between fetches, out of politeness to vndb
	log    *slog.Logger
	// Images vndb answered 404 for, not asked again while this process runs.
	gone map[Ref]bool
}

func NewCrawler(store *Store, source *Source, log *slog.Logger) *Crawler {
	return &Crawler{store: store, source: source, log: log, gone: map[Ref]bool{}}
}

// Report is what one crawl found and did.
type Report struct {
	// Images vndb has, thumbnails included, and how many of those were
	// already on disk when the run began.
	Known int `json:"known"`
	Held  int `json:"held"`
	// Stored this run, and still missing after it.
	Fetched int `json:"fetched"`
	Left    int `json:"left"`
}

// Run fetches up to PerRun missing images, newest first.
func (c *Crawler) Run(ctx context.Context) (Report, error) {
	known, err := c.Known(ctx)
	if err != nil {
		return Report{}, err
	}
	var want []Ref
	for _, k := range known {
		want = append(want, k.Ref)
		if t, ok := Thumbnail(k.Ref, k.Width); ok {
			want = append(want, t)
		}
	}

	held := map[string]map[int32]bool{}
	var missing []Ref
	for _, r := range want {
		if held[r.Kind] == nil {
			if held[r.Kind], err = c.store.held(r.Kind); err != nil {
				return Report{}, err
			}
		}
		if !held[r.Kind][r.Num] && !c.gone[r] {
			missing = append(missing, r)
		}
	}
	report := Report{Known: len(want), Held: len(want) - len(missing)}
	// The newest are the likeliest to be asked for next.
	sort.SliceStable(missing, func(i, j int) bool { return missing[i].Num > missing[j].Num })

	for _, r := range missing {
		if c.PerRun > 0 && report.Fetched >= c.PerRun {
			break
		}
		if ctx.Err() != nil {
			report.Left = len(missing) - report.Fetched
			return report, ctx.Err()
		}
		switch _, err := c.source.Fetch(c.store, r); {
		case errors.Is(err, ErrMissing):
			c.gone[r] = true
		case err != nil:
			c.log.Warn("crawling", "image", r.String(), "err", err)
		default:
			report.Fetched++
		}
		select {
		case <-ctx.Done():
		case <-time.After(c.Delay):
		}
	}
	report.Left = len(missing) - report.Fetched
	return report, nil
}

// held lists the numbers of one kind on disk: one directory read per shard,
// far cheaper than a stat per image.
func (s *Store) held(kind string) (map[int32]bool, error) {
	out := map[int32]bool{}
	for shard := 0; shard < 100; shard++ {
		entries, err := os.ReadDir(filepath.Join(s.root, kind, fmt.Sprintf("%02d", shard)))
		if os.IsNotExist(err) {
			continue
		}
		if err != nil {
			return nil, err
		}
		for _, e := range entries {
			name, ok := strings.CutSuffix(e.Name(), ".jpg")
			if !ok {
				continue
			}
			if n, err := strconv.ParseInt(name, 10, 32); err == nil {
				out[int32(n)] = true
			}
		}
	}
	return out, nil
}
