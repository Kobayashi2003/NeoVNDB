package img

import (
	"context"
	"net/http"
	"os"
	"sync"
	"testing"
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

	c := NewCrawler(srv.mirror, srv.source, srv.log)
	c.Known = func(context.Context) ([]Known, error) {
		return []Known{
			{Ref{"cv", 17}, 315}, // wide enough to have a cv.t
			{Ref{"cv", 16}, 256}, // not: its cv.t is never asked for
			{Ref{"ch", 3}, 256},
			{Ref{"sf", 105}, 800},
		}, nil
	}

	fetched, left, err := c.Run(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	// cv/16, cv.t/17, ch/3, st/105 stored; sf/105 is gone upstream.
	if fetched != 4 || left != 1 {
		t.Errorf("fetched %d, left %d; asked %v", fetched, left, asked)
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
	if fetched, _, _ := c.Run(context.Background()); fetched != 0 || len(asked) != 0 {
		t.Errorf("second run fetched %d, asked %v", fetched, asked)
	}
}
