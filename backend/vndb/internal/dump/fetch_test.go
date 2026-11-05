package dump

import (
	"context"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
	"time"
)

// A download that stops sending without closing is given up rather than
// waited on for good, and leaves no temporary file.
func TestDownloadGivesUpOnAStall(t *testing.T) {
	defer func(was time.Duration) { downloadStall = was }(downloadStall)
	downloadStall = 200 * time.Millisecond
	release := make(chan struct{})
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte("the first bytes"))
		w.(http.Flusher).Flush()
		select {
		case <-release:
		case <-r.Context().Done():
		}
	}))
	defer srv.Close()
	defer close(release)

	dir := t.TempDir()
	done := make(chan error, 1)
	go func() {
		_, _, err := Download(context.Background(), &Release{URL: srv.URL + "/vndb-db-2026-09-09.tar.zst"}, dir)
		done <- err
	}()
	select {
	case err := <-done:
		if err == nil {
			t.Fatal("a stalled download succeeded")
		}
	case <-time.After(10 * time.Second):
		t.Fatal("a stalled download was waited on")
	}
	if left, _ := filepath.Glob(filepath.Join(dir, "*")); len(left) != 0 {
		t.Errorf("left behind: %v", left)
	}
}

// What a killed download left is cleared by the next one.
func TestDownloadClearsWhatAKilledOneLeft(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte("an archive"))
	}))
	defer srv.Close()
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, ".download-123"), []byte("half"), 0o644); err != nil {
		t.Fatal(err)
	}
	path, _, err := Download(context.Background(), &Release{URL: srv.URL + "/vndb-db-2026-09-09.tar.zst"}, dir)
	if err != nil {
		t.Fatal(err)
	}
	left, _ := filepath.Glob(filepath.Join(dir, "*"))
	if len(left) != 1 || left[0] != path {
		t.Errorf("left %v, want only %s", left, path)
	}
}

// The `latest` link has redirected two different ways over time. Both shapes
// have to resolve to the same archive.
func TestLatestResolvesBothRedirectShapes(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/dump/at-file.tar.zst":
			http.Redirect(w, r, "/dump/vndb-db-2026-09-09.tar.zst", http.StatusTemporaryRedirect)
		case "/dump/at-dir.tar.zst":
			http.Redirect(w, r, "/dump/", http.StatusTemporaryRedirect)
		case "/dump/":
			// Out of order, and with a newer archive named only as text --
			// which is how the index reads while a dump is being published,
			// and that one is not fetchable.
			_, _ = w.Write([]byte(`
				<tr><td><a href="vndb-db-latest.tar.zst">latest</a></td>
				    <td>vndb-db-2026-09-11.tar.zst</td></tr>
				<a href="vndb-db-2026-08-19.tar.zst">z</a>
				<a href="vndb-db-2026-09-09.tar.zst">x</a>
				<a href="vndb-db-2026-09-07.tar.zst">y</a>`))
		case "/dump/vndb-db-2026-09-09.tar.zst":
			w.Header().Set("Last-Modified", "Wed, 09 Sep 2026 08:03:00 GMT")
			w.Header().Set("Content-Length", "1234")
		default:
			w.WriteHeader(http.StatusNotFound)
		}
	}))
	defer srv.Close()

	for _, entry := range []string{"/dump/at-file.tar.zst", "/dump/at-dir.tar.zst"} {
		rel, err := Latest(context.Background(), srv.URL+entry)
		if err != nil {
			t.Fatalf("%s: %v", entry, err)
		}
		if rel.Code != "20260909" {
			t.Errorf("%s: code = %q, want 20260909", entry, rel.Code)
		}
		if rel.URL != srv.URL+"/dump/vndb-db-2026-09-09.tar.zst" {
			t.Errorf("%s: url = %q", entry, rel.URL)
		}
		if rel.PublishedAt.IsZero() {
			t.Errorf("%s: no publication date", entry)
		}
	}
}

func TestLatestReportsAnEmptyListing(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/dump/latest.tar.zst" {
			http.Redirect(w, r, "/dump/", http.StatusTemporaryRedirect)
			return
		}
		_, _ = w.Write([]byte("<html>nothing here</html>"))
	}))
	defer srv.Close()

	if _, err := Latest(context.Background(), srv.URL+"/dump/latest.tar.zst"); err == nil {
		t.Error("expected an error for a listing with no dump on it")
	}
}

// An archive the index advertises but does not serve must fail loudly rather
// than come back as a zero-byte release dated year one.
func TestLatestRejectsAnUnpublishedArchive(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/dump/latest.tar.zst":
			http.Redirect(w, r, "/dump/", http.StatusTemporaryRedirect)
		case "/dump/":
			_, _ = w.Write([]byte(`<a href="vndb-db-2026-09-09.tar.zst">x</a>`))
		default:
			w.WriteHeader(http.StatusNotFound)
		}
	}))
	defer srv.Close()

	if _, err := Latest(context.Background(), srv.URL+"/dump/latest.tar.zst"); err == nil {
		t.Error("expected an error for an archive that 404s")
	}
}
