package img

import (
	"context"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/kobayashi/neovndb/internal/config"
)

// newTestServer builds a server whose upstream is a local one, so a test can
// count what it asks for and hold it up on purpose.
func newTestServer(t *testing.T, upstream http.Handler) (*Server, *httptest.Server) {
	t.Helper()
	up := httptest.NewServer(upstream)
	t.Cleanup(up.Close)

	srv := NewServer(&config.Config{
		ImageDir:           t.TempDir(),
		ImageMaxBytes:      32 << 20,
		ImageFetchLimit:    10 * time.Second,
		ImageFetchParallel: 4,
	}, slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{Level: slog.LevelError})))
	srv.source.base = up.URL
	return srv, up
}

// Two readers of one cold image share one fetch; a page showing a cover twice
// must not be two trips to vndb.
func TestOneUpstreamFetchPerImage(t *testing.T) {
	var fetches atomic.Int32
	release := make(chan struct{})
	srv, _ := newTestServer(t, http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		fetches.Add(1)
		<-release
		_, _ = w.Write(jpegOf(t, 800, 600))
	}))

	ref := Ref{"cv", 79412}
	var entered, done sync.WaitGroup
	entered.Add(2)
	done.Add(2)
	for range 2 {
		go func() {
			defer done.Done()
			entered.Done()
			if _, err := srv.original(ref); err != nil {
				t.Errorf("original: %v", err)
			}
		}()
	}
	entered.Wait()
	time.Sleep(50 * time.Millisecond)
	close(release)
	done.Wait()

	if got := fetches.Load(); got != 1 {
		t.Errorf("asked upstream %d times for one image, want once", got)
	}
}

// A reader who navigates away mid-fetch must not take the answer down with
// them: the work is shared, so it cannot belong to whoever happened to start
// it.
func TestFetchSurvivesTheCallerLeaving(t *testing.T) {
	srv, _ := newTestServer(t, http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		time.Sleep(150 * time.Millisecond)
		_, _ = w.Write(jpegOf(t, 800, 600))
	}))

	mux := srv.Routes()
	first := httptest.NewRequest(http.MethodGet, "/img/cv/12/79412.jpg", nil)
	ctx, cancel := context.WithCancel(first.Context())
	first = first.WithContext(ctx)

	var wg sync.WaitGroup
	wg.Add(1)
	go func() {
		defer wg.Done()
		mux.ServeHTTP(httptest.NewRecorder(), first)
	}()

	// Let the first request reach the fetch, then abandon it the way a closed
	// tab does.
	time.Sleep(40 * time.Millisecond)
	second := httptest.NewRecorder()
	var wg2 sync.WaitGroup
	wg2.Add(1)
	go func() {
		defer wg2.Done()
		mux.ServeHTTP(second, httptest.NewRequest(http.MethodGet, "/img/cv/12/79412.jpg", nil))
	}()
	time.Sleep(20 * time.Millisecond)
	cancel()

	wg.Wait()
	wg2.Wait()
	if second.Code != http.StatusOK {
		t.Errorf("the second reader got %d after the first left, want 200", second.Code)
	}
}

// The mirror must not answer a burst by opening a connection per image to
// vndb. Holding a mirror is meant to take load off their CDN, not to move it
// around.
func TestUpstreamFetchesAreBounded(t *testing.T) {
	const parallel = 4

	var inFlight, peak atomic.Int32
	release := make(chan struct{})
	srv, _ := newTestServer(t, http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		now := inFlight.Add(1)
		for {
			was := peak.Load()
			if now <= was || peak.CompareAndSwap(was, now) {
				break
			}
		}
		<-release
		inFlight.Add(-1)
		_, _ = w.Write(jpegOf(t, 64, 64))
	}))
	srv.source.slots = make(chan struct{}, parallel)

	var done sync.WaitGroup
	for i := range 20 {
		done.Add(1)
		go func() {
			defer done.Done()
			// Distinct images, so the flight has nothing to collapse and every
			// one of them is a real trip upstream.
			_, _ = srv.original(Ref{"cv", int32(1000 + i)})
		}()
	}
	time.Sleep(100 * time.Millisecond)
	close(release)
	done.Wait()

	if got := peak.Load(); got > parallel {
		t.Errorf("%d fetches were in the air at once, want at most %d", got, parallel)
	}
	if peak.Load() == 0 {
		t.Error("nothing reached upstream at all")
	}
}

// eventually polls until ok or fails after a few seconds.
func eventually(t *testing.T, what string, ok func() bool) {
	t.Helper()
	deadline := time.Now().Add(5 * time.Second)
	for !ok() {
		if time.Now().After(deadline) {
			t.Fatal(what)
		}
		time.Sleep(10 * time.Millisecond)
	}
}

// Redirecting, a miss sends the reader to vndb uncached and fetches the image
// behind them; once stored it is served from here.
func TestMissRedirectsAndFetchesBehind(t *testing.T) {
	srv, up := newTestServer(t, http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte("cover"))
	}))
	srv.SetRedirect(true)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	srv.Behind(ctx)

	ask := func() *httptest.ResponseRecorder {
		rec := httptest.NewRecorder()
		srv.Routes().ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/img/cv/12/79412.jpg", nil))
		return rec
	}
	rec := ask()
	if rec.Code != http.StatusFound || rec.Header().Get("Location") != up.URL+"/cv/12/79412.jpg" {
		t.Fatalf("got %d to %q", rec.Code, rec.Header().Get("Location"))
	}
	if cc := rec.Header().Get("Cache-Control"); cc != "no-store" {
		t.Errorf("redirect cached as %q", cc)
	}
	eventually(t, "never fetched behind the redirect", func() bool {
		_, err := srv.mirror.Read(Ref{"cv", 79412})
		return err == nil
	})
	if rec := ask(); rec.Code != http.StatusOK || rec.Body.String() != "cover" {
		t.Errorf("once stored: %d %q", rec.Code, rec.Body.String())
	}
}

// An image vndb no longer serves is not redirected to again: a thumbnail vndb
// never made falls back to its original, as when fetching.
func TestMissRedirectStopsForWhatVndbLacks(t *testing.T) {
	srv, _ := newTestServer(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/cv/39/10039.jpg" {
			_, _ = w.Write([]byte("the small original"))
			return
		}
		http.NotFound(w, r)
	}))
	srv.SetRedirect(true)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	srv.Behind(ctx)

	thumb := Ref{"cv.t", 10039}
	rec := httptest.NewRecorder()
	srv.Routes().ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/img/cv.t/39/10039.jpg", nil))
	if rec.Code != http.StatusFound {
		t.Fatalf("first ask: %d, want a redirect", rec.Code)
	}
	eventually(t, "the 404 behind the redirect was not remembered", func() bool {
		return srv.isGone(thumb)
	})
	rec = httptest.NewRecorder()
	srv.Routes().ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/img/cv.t/39/10039.jpg", nil))
	if rec.Code != http.StatusOK || rec.Body.String() != "the small original" {
		t.Errorf("second ask: %d %q", rec.Code, rec.Body.String())
	}
}

// A cover no wider than a thumbnail has no cv.t upstream; asking for one gets
// the original, which is already that small.
func TestMissingThumbnailServesTheOriginal(t *testing.T) {
	srv, _ := newTestServer(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/cv/39/10039.jpg" {
			_, _ = w.Write([]byte("the small original"))
			return
		}
		http.NotFound(w, r)
	}))
	rec := httptest.NewRecorder()
	srv.Routes().ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/img/cv.t/39/10039.jpg", nil))
	if rec.Code != http.StatusOK || rec.Body.String() != "the small original" {
		t.Errorf("got %d %q", rec.Code, rec.Body.String())
	}
	// A missing original is still a 404.
	rec = httptest.NewRecorder()
	srv.Routes().ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/img/cv/40/10040.jpg", nil))
	if rec.Code != http.StatusNotFound {
		t.Errorf("missing original: %d", rec.Code)
	}
}

// What vndb just answered 404 for is not asked for again on every request:
// anyone can name a number vndb never had, as often as they like.
func TestMissingIsNotAskedForAgain(t *testing.T) {
	var asked atomic.Int32
	srv, _ := newTestServer(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		asked.Add(1)
		http.NotFound(w, r)
	}))
	for range 3 {
		rec := httptest.NewRecorder()
		srv.Routes().ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/img/cv/40/10040.jpg", nil))
		if rec.Code != http.StatusNotFound {
			t.Fatalf("missing original: %d", rec.Code)
		}
	}
	if n := asked.Load(); n != 1 {
		t.Errorf("vndb was asked %d times, want 1", n)
	}
}
