package settings

import (
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func base() Images {
	return Images{Miss: "redirect", CrawlEvery: Duration(time.Hour), CrawlPerRun: 200, CrawlDelay: Duration(2 * time.Second)}
}

// The file holds only what differs from .env, survives a restart, and goes
// away once everything is back to .env.
func TestLiveKeepsOnlyChanges(t *testing.T) {
	path := filepath.Join(t.TempDir(), "images.json")
	live, err := Open(path, base(), Images.check)
	if err != nil {
		t.Fatal(err)
	}
	var told []Images
	live.Watch(func(s Images) { told = append(told, s) })

	if _, err := live.Set([]byte(`{"miss":"fetch","crawl_every":"30m"}`)); err != nil {
		t.Fatal(err)
	}
	saved, _ := os.ReadFile(path)
	if !strings.Contains(string(saved), `"miss": "fetch"`) || strings.Contains(string(saved), "crawl_per_run") {
		t.Errorf("file holds %s", saved)
	}
	if got := live.Changed(); len(got) != 2 || got[0] != "crawl_every" || got[1] != "miss" {
		t.Errorf("changed: %v", got)
	}
	if len(told) != 1 || told[0].Miss != "fetch" {
		t.Errorf("watchers heard %v", told)
	}

	again, err := Open(path, base(), Images.check)
	if err != nil {
		t.Fatal(err)
	}
	if s := again.Get(); s.Miss != "fetch" || time.Duration(s.CrawlEvery) != 30*time.Minute || s.CrawlPerRun != 200 {
		t.Errorf("after a restart: %+v", s)
	}

	if _, err := again.Set([]byte(`{"miss":"redirect","crawl_every":"1h"}`)); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(path); !os.IsNotExist(err) {
		t.Errorf("back to .env, yet the file is still there: %v", err)
	}
}

// One bad field refuses the whole change.
func TestLiveRefusesBadValues(t *testing.T) {
	live, err := Open(filepath.Join(t.TempDir(), "images.json"), base(), Images.check)
	if err != nil {
		t.Fatal(err)
	}
	for _, patch := range []string{
		`{"miss":"proxy"}`,
		`{"crawl_every":"10s"}`,
		`{"crawl_per_run":-1}`,
		`{"crawl_per_run":"many"}`,
		`{"crawl_delay":"soon"}`,
		`{"nonsense":1}`,
		`[1]`,
		`{"crawl_per_run":5,"miss":"proxy"}`,
		// Would read as 0, which turns the crawl off.
		`{"crawl_every":null}`,
		`{"crawl_per_run":null}`,
	} {
		if _, err := live.Set([]byte(patch)); !errors.Is(err, ErrInvalid) {
			t.Errorf("%s: %v, want ErrInvalid", patch, err)
		}
	}
	if live.Get() != base() {
		t.Errorf("a refused change left %+v", live.Get())
	}
	// A value that does not read names its field.
	if _, err := live.Set([]byte(`{"crawl_delay":"1 hour"}`)); err == nil || !strings.Contains(err.Error(), "crawl_delay") {
		t.Errorf("got %v", err)
	}
}

// A change that cannot be written is not taken, and is not the asker's fault.
func TestLiveRefusesWhatItCannotKeep(t *testing.T) {
	blocker := filepath.Join(t.TempDir(), "not-a-directory")
	if err := os.WriteFile(blocker, nil, 0o644); err != nil {
		t.Fatal(err)
	}
	live, err := Open(filepath.Join(blocker, "images.json"), base(), Images.check)
	if err != nil {
		t.Fatal(err)
	}
	told := false
	live.Watch(func(Images) { told = true })
	_, err = live.Set([]byte(`{"miss":"fetch"}`))
	if err == nil || errors.Is(err, ErrInvalid) {
		t.Errorf("got %v, want a failure to keep it", err)
	}
	if live.Get().Miss != "redirect" || told {
		t.Errorf("an unkept change took effect: %+v, told %v", live.Get(), told)
	}
}

// A file that no longer passes stops the service, naming the file.
func TestOpenRefusesABadFile(t *testing.T) {
	path := filepath.Join(t.TempDir(), "images.json")
	if err := os.WriteFile(path, []byte(`{"miss":"proxy"}`), 0o644); err != nil {
		t.Fatal(err)
	}
	if _, err := Open(path, base(), Images.check); err == nil || !strings.Contains(err.Error(), path) {
		t.Errorf("got %v", err)
	}
}
