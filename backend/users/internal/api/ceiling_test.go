package api

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/kobayashi/neovndb-users/internal/config"
	"github.com/kobayashi/neovndb-users/internal/store"
)

// Development runs with every ceiling lifted, so these are where the ceilings a
// deployment sets are shown to bite: each through the HTTP surface, as a
// reader would meet it. Like the store tests they need NEOVNDB_USERS_TEST_DB_URL
// and skip without it.
func server(t *testing.T, tweak func(*config.Config)) http.Handler {
	t.Helper()
	url := os.Getenv("NEOVNDB_USERS_TEST_DB_URL")
	if url == "" {
		t.Skip("NEOVNDB_USERS_TEST_DB_URL is not set")
	}
	pc, err := pgxpool.ParseConfig(url)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.HasSuffix(pc.ConnConfig.Database, "_test") {
		t.Fatalf("refusing to empty %q: a test database's name ends in _test", pc.ConnConfig.Database)
	}
	hold(t, url)

	ctx := context.Background()
	cfg := &config.Config{
		DatabaseURL: url, MaxConns: 4, ConnectTimeout: 5 * time.Second,
		SessionLife: time.Hour, PageSize: 24, BcryptCost: 4,
		SignInWindow: time.Hour, SignUpWindow: time.Hour,
	}
	tweak(cfg)
	st, err := store.Open(ctx, cfg)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(st.Close)
	pool, err := pgxpool.New(ctx, url)
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()
	if _, err := pool.Exec(ctx, `TRUNCATE users RESTART IDENTITY CASCADE`); err != nil {
		t.Fatal(err)
	}
	return NewServer(st, cfg, slog.New(slog.NewTextHandler(io.Discard, nil))).Routes()
}

// call sends one request from one address, with a session cookie when given.
func call(h http.Handler, method, path, body, session string) *httptest.ResponseRecorder {
	r := httptest.NewRequest(method, path, strings.NewReader(body))
	r.Header.Set("Content-Type", "application/json")
	r.Header.Set("X-Forwarded-For", "203.0.113.9")
	if session != "" {
		r.AddCookie(&http.Cookie{Name: "neovndb_session", Value: session})
	}
	w := httptest.NewRecorder()
	h.ServeHTTP(w, r)
	return w
}

func register(t *testing.T, h http.Handler, name string) string {
	t.Helper()
	w := call(h, "POST", "/register", fmt.Sprintf(`{"username":%q,"password":"a good long password"}`, name), "")
	if w.Code != http.StatusCreated {
		t.Fatalf("register %s: %d %s", name, w.Code, w.Body)
	}
	for _, c := range w.Result().Cookies() {
		if c.Name == "neovndb_session" {
			return c.Value
		}
	}
	t.Fatal("no session cookie")
	return ""
}

func TestSignInCeiling(t *testing.T) {
	h := server(t, func(c *config.Config) { c.SignInTries = 2 })
	register(t, h, "reader")

	wrong := `{"username":"reader","password":"not the password"}`
	for i := range 2 {
		if w := call(h, "POST", "/login", wrong, ""); w.Code != http.StatusUnauthorized {
			t.Fatalf("attempt %d: %d", i+1, w.Code)
		}
	}
	// Past the ceiling even the right password is refused, and told when to retry.
	w := call(h, "POST", "/login", `{"username":"reader","password":"a good long password"}`, "")
	if w.Code != http.StatusTooManyRequests || w.Header().Get("Retry-After") == "" {
		t.Errorf("third attempt: %d, Retry-After %q", w.Code, w.Header().Get("Retry-After"))
	}
}

func TestSignUpCeiling(t *testing.T) {
	h := server(t, func(c *config.Config) { c.SignUpTries = 1 })
	register(t, h, "first")
	w := call(h, "POST", "/register", `{"username":"second","password":"a good long password"}`, "")
	if w.Code != http.StatusTooManyRequests {
		t.Errorf("second sign-up from one address: %d", w.Code)
	}
}

func TestListCeilings(t *testing.T) {
	h := server(t, func(c *config.Config) { c.MaxPageSize = 3; c.MaxItems = 2 })
	session := register(t, h, "reader")

	w := call(h, "GET", "/collections?type=v", "", session)
	var lists struct{ Results []struct{ ID int32 } }
	if err := json.NewDecoder(w.Body).Decode(&lists); err != nil || len(lists.Results) == 0 {
		t.Fatalf("lists: %v %s", err, w.Body)
	}
	marks := fmt.Sprintf("/collections/%d/marks", lists.Results[0].ID)

	// A batch over the page size is refused whole, not cut short.
	if w := call(h, "POST", marks+"/add", `{"items":["v1","v2","v3","v4"]}`, session); w.Code != http.StatusBadRequest {
		t.Errorf("batch of 4 over a page of 3: %d", w.Code)
	}
	if w := call(h, "POST", marks+"/add", `{"items":["v1","v2","v3"]}`, session); w.Code != http.StatusOK {
		t.Fatalf("batch of 3: %d %s", w.Code, w.Body)
	}
	if w := call(h, "GET", marks+"?limit=4", "", session); w.Code != http.StatusBadRequest {
		t.Errorf("page of 4 over 3: %d", w.Code)
	}

	// The whole list stops at MaxItems but still counts everything, so the
	// reader can be told it was too long.
	w = call(h, "GET", fmt.Sprintf("/collections/%d/items", lists.Results[0].ID), "", session)
	var items struct {
		Items []json.RawMessage
		Count int
	}
	if err := json.NewDecoder(w.Body).Decode(&items); err != nil {
		t.Fatal(err)
	}
	if len(items.Items) != 2 || items.Count != 3 {
		t.Errorf("items: %d of %d, want 2 of 3", len(items.Items), items.Count)
	}
}

// testLock serialises tests that empty the test database. The store and api
// packages both do, and go test runs packages at once; the lock is a
// session's, so closing the connection at cleanup releases it.
const testLock = 727

func hold(t *testing.T, url string) {
	t.Helper()
	ctx := context.Background()
	conn, err := pgx.Connect(ctx, url)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = conn.Close(ctx) })
	if _, err := conn.Exec(ctx, `SELECT pg_advisory_lock($1)`, testLock); err != nil {
		t.Fatal(err)
	}
}
