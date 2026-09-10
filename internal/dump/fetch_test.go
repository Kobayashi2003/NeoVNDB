package dump

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
)

// The `latest` link has redirected two different ways over time. Both shapes
// have to resolve to the same archive.
func TestLatestResolvesBothRedirectShapes(t *testing.T) {
	var srv *httptest.Server
	srv = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
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
