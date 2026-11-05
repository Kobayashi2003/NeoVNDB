package img

import (
	"context"
	"net/http"
	"net/http/httptest"
	"os"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

// The crawler fetches only what is missing, thumbnails included, newest first;
// a 404 is remembered rather than asked again.
func TestCrawlFetchesWhatIsMissing(t *testing.T) {
	var mu sync.Mutex
	var asked []string
	srv, _ := newTestServer(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		mu.Lock()
		asked = append(asked, r.URL.Path)
		mu.Unlock()
		if r.URL.Path == "/sf/05/105.jpg" {
			http.NotFound(w, r)
			return
		}
		w.Write([]byte("jpeg bytes"))
	}))
	// Already held: fetched before, so never asked for.
	if err := srv.mirror.Write(Ref{"cv", 17}, []byte("old")); err != nil {
		t.Fatal(err)
	}

	c := srv.Crawler(0, 0)
	c.Known = func(context.Context) ([]Known, error) {
		return []Known{
			{Ref{"cv", 17}, 315}, // wide enough to have a cv.t
			{Ref{"cv", 16}, 256}, // not: its cv.t is never asked for
			{Ref{"ch", 3}, 256},
			{Ref{"sf", 105}, 800},
		}, nil
	}

	report, err := c.Run(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	// cv/16, cv.t/17, ch/3, st/105 stored; sf/105 is gone upstream, so not
	// left to fetch either.
	if report.Fetched != 4 || report.Left != 0 || report.Held != report.Known-5 {
		t.Errorf("report %+v; asked %v", report, asked)
	}
	want := []string{"/sf/05/105.jpg", "/st/05/105.jpg", "/cv.t/17/17.jpg", "/cv/16/16.jpg", "/ch/03/3.jpg"}
	if len(asked) != len(want) {
		t.Fatalf("asked %v, want %v", asked, want)
	}
	for i := range want {
		if asked[i] != want[i] {
			t.Errorf("fetch %d was %s, want %s (newest first)", i, asked[i], want[i])
		}
	}
	if _, err := os.Stat(srv.mirror.Path(Ref{"cv.t", 17})); err != nil {
		t.Errorf("thumbnail not stored: %v", err)
	}

	// Second run: nothing left worth asking for.
	asked = nil
	if report, _ := c.Run(context.Background()); report.Fetched != 0 || len(asked) != 0 {
		t.Errorf("second run fetched %d, asked %v", report.Fetched, asked)
	}
}

// While vndb fails, a run stops at its ceiling of tries, not of successes:
// counting only those, it would go through the whole missing list.
func TestCrawlCountsTriesAgainstTheCeiling(t *testing.T) {
	var asked atomic.Int32
	srv, _ := newTestServer(t, http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		asked.Add(1)
		w.WriteHeader(http.StatusBadGateway)
	}))
	c := srv.Crawler(2, 0)
	c.Known = func(context.Context) ([]Known, error) {
		return []Known{{Ref{"ch", 1}, 0}, {Ref{"ch", 2}, 0}, {Ref{"ch", 3}, 0}, {Ref{"ch", 4}, 0}, {Ref{"ch", 5}, 0}}, nil
	}
	report, err := c.Run(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if n := asked.Load(); n != 2 || report.Fetched != 0 || report.Left != 5 {
		t.Errorf("asked vndb %d times, report %+v; want 2 tries and all 5 left", n, report)
	}
}

// The crawler and a reader after the same image share one fetch, as two
// readers do: two would each write the file, and on Windows the second
// replacing it can fail and give the reader a 502.
func TestCrawlSharesAFetchWithAReader(t *testing.T) {
	var asked atomic.Int32
	release := make(chan struct{})
	srv, _ := newTestServer(t, http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		asked.Add(1)
		<-release
		_, _ = w.Write([]byte("jpeg bytes"))
	}))
	c := srv.Crawler(0, 0)
	c.Known = func(context.Context) ([]Known, error) { return []Known{{Ref{"ch", 3}, 0}}, nil }

	crawled := make(chan error, 1)
	go func() {
		_, err := c.Run(context.Background())
		crawled <- err
	}()
	eventually(t, "the crawler did not ask", func() bool { return asked.Load() == 1 })
	read := make(chan int, 1)
	go func() {
		rec := httptest.NewRecorder()
		srv.Routes().ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/img/ch/03/3.jpg", nil))
		read <- rec.Code
	}()
	// Give the reader time to join the crawler's fetch, or to start its own.
	time.Sleep(100 * time.Millisecond)
	close(release)
	if err := <-crawled; err != nil {
		t.Fatal(err)
	}
	if code := <-read; code != http.StatusOK {
		t.Errorf("the reader got %d", code)
	}
	if n := asked.Load(); n != 1 {
		t.Errorf("vndb was asked %d times, want 1", n)
	}
}
