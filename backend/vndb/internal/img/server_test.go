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
		ImageDerivedDir:    t.TempDir(),
		ImageWidths:        []int{128, 256, 512},
		ImageMaxPixels:     40_000_000,
		ImageMaxBytes:      32 << 20,
		ImageFetchLimit:    10 * time.Second,
		ImageFetchParallel: 4,
	}, slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{Level: slog.LevelError})))
	srv.source.base = up.URL
	return srv, up
}

// Two widths of one image share the original. Asking for a cover at two sizes
// is one page doing what a page does; it must not be two trips to vndb.
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
	for _, width := range []int{256, 512} {
		go func() {
			defer done.Done()
			entered.Done()
			if _, err := srv.serve(ref, width); err != nil {
				t.Errorf("serve at %d: %v", width, err)
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
	first := httptest.NewRequest(http.MethodGet, "/img/256/cv/12/79412.jpg", nil)
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
		mux.ServeHTTP(second, httptest.NewRequest(http.MethodGet, "/img/256/cv/12/79412.jpg", nil))
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
			_, _ = srv.serve(Ref{"cv", int32(1000 + i)}, 0)
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
