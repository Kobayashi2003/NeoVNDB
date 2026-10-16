package store

import (
	"context"
	"errors"
	"fmt"
	"os"
	"reflect"
	"slices"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/kobayashi/neovndb-users/internal/config"
)

// These run against a real Postgres database named in
// NEOVNDB_USERS_TEST_DB_URL, and skip without one. Every test empties it
// first, so a name that does not end in _test is refused rather than trusted.
func open(t *testing.T) *Store {
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
	s, err := Open(ctx, &config.Config{DatabaseURL: url, MaxConns: 4, ConnectTimeout: 5 * time.Second})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(s.Close)
	if _, err := s.pool.Exec(ctx, `TRUNCATE users RESTART IDENTITY CASCADE`); err != nil {
		t.Fatal(err)
	}
	return s
}

func user(t *testing.T, s *Store, name string) *User {
	t.Helper()
	u, err := s.CreateUser(context.Background(), name, nil, "hash")
	if err != nil {
		t.Fatal(err)
	}
	return u
}

// list is the reader's starting list of a type.
func list(t *testing.T, s *Store, u *User, kind string) int32 {
	t.Helper()
	lists, err := s.Collections(context.Background(), u.ID, kind)
	if err != nil || len(lists) == 0 {
		t.Fatalf("no %s list: %v", kind, err)
	}
	return lists[0].ID
}

func ids(t *testing.T, s *Store, u *User, id int32) []string {
	t.Helper()
	items, _, err := s.Marks(context.Background(), u.ID, id, Order{By: "added"}, 0, 0)
	if err != nil {
		t.Fatal(err)
	}
	out := make([]string, len(items))
	for i, m := range items {
		out[i] = m.ID
	}
	return out
}

var added = Order{By: "added"}

func TestAccounts(t *testing.T) {
	s, ctx := open(t), context.Background()
	u := user(t, s, "Reader")

	// Usernames are unique regardless of case, and looked up the same way.
	if _, err := s.CreateUser(ctx, "reader", nil, "hash"); !errors.Is(err, ErrTaken) {
		t.Errorf("same name in another case: %v", err)
	}
	if got, hash, err := s.UserByName(ctx, "READER"); err != nil || got.ID != u.ID || hash != "hash" {
		t.Errorf("lookup: %v %v %q", got, err, hash)
	}
	if _, _, err := s.UserByName(ctx, "nobody"); !errors.Is(err, ErrNotFound) {
		t.Errorf("unknown name: %v", err)
	}
	if hash, err := s.PasswordHash(ctx, u.ID); err != nil || hash != "hash" {
		t.Errorf("hash by id: %q %v", hash, err)
	}

	// One starting list per type, empty.
	lists, err := s.Collections(ctx, u.ID, "")
	if err != nil || len(lists) != len(kinds) {
		t.Fatalf("starting lists: %v %v", lists, err)
	}
}

// What the admin page lists, and who may open it.
func TestAdministration(t *testing.T) {
	s, ctx := open(t), context.Background()
	a, b := user(t, s, "a"), user(t, s, "b")
	if err := s.CreateSession(ctx, "tok", b.ID, time.Hour); err != nil {
		t.Fatal(err)
	}
	if err := s.AddMark(ctx, b.ID, list(t, s, b, "v"), "v", 17); err != nil {
		t.Fatal(err)
	}

	if err := s.SetAdmin(ctx, a.ID, true); err != nil {
		t.Fatal(err)
	}
	if err := s.SetAdmin(ctx, 9999, true); !errors.Is(err, ErrNotFound) {
		t.Errorf("no such user: %v", err)
	}

	got, err := s.Accounts(ctx)
	if err != nil || len(got) != 2 {
		t.Fatalf("accounts: %v %v", got, err)
	}
	if !got[0].IsAdmin || got[1].IsAdmin {
		t.Errorf("admin flags: %v %v", got[0].IsAdmin, got[1].IsAdmin)
	}
	if got[1].Lists != len(kinds) || got[1].Items != 1 || got[1].Sessions != 1 || got[1].LastSeen == nil {
		t.Errorf("b's counts: %+v", got[1])
	}
	if _, isAdmin, _ := s.Session(ctx, "tok"); isAdmin {
		t.Error("b's session claims administration")
	}
}

func TestSessions(t *testing.T) {
	s, ctx := open(t), context.Background()
	u := user(t, s, "reader")

	if err := s.CreateSession(ctx, "live", u.ID, time.Hour); err != nil {
		t.Fatal(err)
	}
	if err := s.CreateSession(ctx, "old", u.ID, -time.Minute); err != nil {
		t.Fatal(err)
	}
	if id, _, err := s.Session(ctx, "live"); err != nil || id != u.ID {
		t.Errorf("live session: %d %v", id, err)
	}
	// Expired is refused at once, not only after the sweep.
	if _, _, err := s.Session(ctx, "old"); !errors.Is(err, ErrNotFound) {
		t.Errorf("expired session: %v", err)
	}
	if n, err := s.SweepSessions(ctx); err != nil || n != 1 {
		t.Errorf("sweep: %d %v", n, err)
	}
	if err := s.DeleteSessionsOf(ctx, u.ID); err != nil {
		t.Fatal(err)
	}
	if _, _, err := s.Session(ctx, "live"); !errors.Is(err, ErrNotFound) {
		t.Errorf("after sign-out everywhere: %v", err)
	}
}

func TestListsAreTheirOwners(t *testing.T) {
	s, ctx := open(t), context.Background()
	a, b := user(t, s, "a"), user(t, s, "b")
	mine := list(t, s, a, "v")

	// Another reader's list, guessed by id, does not exist for them.
	if err := s.AddMark(ctx, b.ID, mine, "v", 17); !errors.Is(err, ErrNotFound) {
		t.Errorf("add to another's list: %v", err)
	}
	if err := s.RenameCollection(ctx, b.ID, mine, "x"); !errors.Is(err, ErrNotFound) {
		t.Errorf("rename another's list: %v", err)
	}
	if err := s.DeleteCollection(ctx, b.ID, mine); !errors.Is(err, ErrNotFound) {
		t.Errorf("delete another's list: %v", err)
	}
	if _, _, err := s.Marks(ctx, b.ID, mine, added, 10, 0); !errors.Is(err, ErrNotFound) {
		t.Errorf("read another's list: %v", err)
	}
	// A character on a VN list reads as no such list.
	if err := s.AddMark(ctx, a.ID, mine, "c", 17); !errors.Is(err, ErrNotFound) {
		t.Errorf("wrong type: %v", err)
	}
	// Names are unique per reader and type only.
	if _, err := s.CreateCollection(ctx, a.ID, "v", defaultCollection); !errors.Is(err, ErrTaken) {
		t.Errorf("duplicate name: %v", err)
	}
	if _, err := s.CreateCollection(ctx, a.ID, "c", "Later"); err != nil {
		t.Errorf("same name, other type: %v", err)
	}
}

func TestMarks(t *testing.T) {
	s, ctx := open(t), context.Background()
	u := user(t, s, "reader")
	from := list(t, s, u, "v")
	to, err := s.CreateCollection(ctx, u.ID, "v", "Later")
	if err != nil {
		t.Fatal(err)
	}

	// Duplicates within the request and marks already there count once.
	if n, err := s.AddMarks(ctx, u.ID, from, "v", []int32{17, 4, 17}); err != nil || n != 2 {
		t.Fatalf("add: %d %v", n, err)
	}
	if err := s.AddMark(ctx, u.ID, from, "v", 4); err != nil {
		t.Errorf("adding again is not an error: %v", err)
	}
	if n, _ := s.AddMarks(ctx, u.ID, from, "v", []int32{4, 11}); n != 1 {
		t.Errorf("add with one already there: %d", n)
	}
	if got := ids(t, s, u, from); !reflect.DeepEqual(slices.Sorted(slices.Values(got)), []string{"v11", "v17", "v4"}) {
		t.Errorf("items: %v", got)
	}

	marks, _, err := s.Marks(ctx, u.ID, from, added, 10, 0)
	if err != nil {
		t.Fatal(err)
	}
	when := map[string]time.Time{}
	for _, m := range marks {
		when[m.ID] = m.MarkedAt
	}

	// Moving keeps when it was saved; an item not on the list is skipped.
	if n, err := s.MoveMarks(ctx, u.ID, from, to.ID, "v", []int32{17, 999}); err != nil || n != 1 {
		t.Fatalf("move: %d %v", n, err)
	}
	moved, _, _ := s.Marks(ctx, u.ID, to.ID, added, 10, 0)
	if len(moved) != 1 || moved[0].ID != "v17" || !moved[0].MarkedAt.Equal(when["v17"]) {
		t.Errorf("moved: %+v, saved at %v", moved, when["v17"])
	}
	if held, _ := s.Holding(ctx, u.ID, "v", 17); !reflect.DeepEqual(held, []int32{to.ID}) {
		t.Errorf("holding v17: %v", held)
	}

	if n, _ := s.RemoveMarks(ctx, u.ID, from, "v", []int32{4, 17}); n != 1 {
		t.Errorf("remove with one gone: %d", n)
	}
	if got := ids(t, s, u, from); !reflect.DeepEqual(got, []string{"v11"}) {
		t.Errorf("left: %v", got)
	}

	// The true count comes back even when capped.
	s.AddMarks(ctx, u.ID, from, "v", []int32{1, 2, 3})
	if items, total, _ := s.Marks(ctx, u.ID, from, added, 2, 0); len(items) != 2 || total != 4 {
		t.Errorf("capped items: %v of %d", items, total)
	}
}

func TestRatings(t *testing.T) {
	s, ctx := open(t), context.Background()
	u := user(t, s, "reader")

	if r, err := s.Rating(ctx, u.ID, "v", 17); err != nil || r != nil {
		t.Errorf("unrated: %v %v", r, err)
	}
	s.SetRating(ctx, u.ID, "v", 17, 3)
	s.SetRating(ctx, u.ID, "v", 17, 5) // changing one's mind replaces
	if r, _ := s.Rating(ctx, u.ID, "v", 17); r == nil || *r != 5 {
		t.Errorf("rating: %v", r)
	}
	// The same number on another type is another item.
	if r, _ := s.Rating(ctx, u.ID, "c", 17); r != nil {
		t.Errorf("c17 took v17's rating: %v", *r)
	}
	if err := s.SetRating(ctx, u.ID, "v", 18, 6); err == nil {
		t.Error("a rating of 6 was stored")
	}
	s.ClearRating(ctx, u.ID, "v", 17)
	if err := s.ClearRating(ctx, u.ID, "v", 17); err != nil {
		t.Errorf("clearing twice: %v", err)
	}
	if r, _ := s.Rating(ctx, u.ID, "v", 17); r != nil {
		t.Errorf("cleared: %v", *r)
	}
}

// A list sorts by what the reader thought of its items, unrated last either
// way; the ratings page pages, counts and changes ratings in bulk.
func TestRatingOrders(t *testing.T) {
	s, ctx := open(t), context.Background()
	u := user(t, s, "reader")
	l := list(t, s, u, "v")
	s.AddMarks(ctx, u.ID, l, "v", []int32{1, 2, 3, 4})
	s.SetRating(ctx, u.ID, "v", 2, 5)
	s.SetRating(ctx, u.ID, "v", 3, 1)
	s.SetRating(ctx, u.ID, "v", 9, 4) // rated, not on the list
	s.SetRating(ctx, u.ID, "c", 1, 2)

	order := func(o Order) []string {
		marks, _, err := s.Marks(ctx, u.ID, l, o, 10, 0)
		if err != nil {
			t.Fatal(err)
		}
		var got []string
		for _, m := range marks {
			r := 0
			if m.Rating != nil {
				r = int(*m.Rating)
			}
			got = append(got, fmt.Sprintf("%s:%d", m.ID, r))
		}
		return got
	}
	if got := order(Order{By: "rating"}); !reflect.DeepEqual(got[:2], []string{"v2:5", "v3:1"}) {
		t.Errorf("by rating: %v", got)
	}
	if got := order(Order{By: "rating", Reverse: true}); !reflect.DeepEqual(got[:2], []string{"v3:1", "v2:5"}) || !strings.HasSuffix(got[3], ":0") {
		t.Errorf("by rating, reversed: %v", got)
	}

	rated, total, err := s.Ratings(ctx, u.ID, "v", Order{By: "rating"}, 2, 0)
	if err != nil || total != 3 || len(rated) != 2 || rated[0].ID != "v2" || rated[1].ID != "v9" {
		t.Errorf("ratings page: %+v of %d, %v", rated, total, err)
	}
	if counts, _ := s.RatingCounts(ctx, u.ID); counts["v"] != 3 || counts["c"] != 1 {
		t.Errorf("counts: %v", counts)
	}

	if n, err := s.SetRatings(ctx, u.ID, "v", []int32{3, 4}, 4); err != nil || n != 2 {
		t.Errorf("set: %d %v", n, err)
	}
	if n, _ := s.ClearRatings(ctx, u.ID, "v", []int32{2, 4, 77}); n != 2 {
		t.Errorf("clear: %d", n)
	}
	all, _, _ := s.Ratings(ctx, u.ID, "v", Order{By: "rating"}, 0, 0)
	if len(all) != 2 || all[0].Rating != 4 || all[1].Rating != 4 {
		t.Errorf("left: %+v", all)
	}
}

// Deleting an account takes everything of theirs and nothing of anyone else's.
func TestDeleteUser(t *testing.T) {
	s, ctx := open(t), context.Background()
	gone, kept := user(t, s, "gone"), user(t, s, "kept")
	for _, u := range []*User{gone, kept} {
		s.CreateSession(ctx, "token-"+u.Username, u.ID, time.Hour)
		s.AddMarks(ctx, u.ID, list(t, s, u, "v"), "v", []int32{17})
		s.SetRating(ctx, u.ID, "v", 17, 4)
	}

	if err := s.DeleteUser(ctx, gone.ID); err != nil {
		t.Fatal(err)
	}
	for table, want := range map[string]int{"users": 1, "sessions": 1, "collections": len(kinds), "marks": 1, "ratings": 1} {
		var n int
		s.pool.QueryRow(ctx, `SELECT count(*) FROM `+table).Scan(&n)
		if n != want {
			t.Errorf("%s: %d rows left, want %d", table, n, want)
		}
	}
	if _, _, err := s.Session(ctx, "token-kept"); err != nil {
		t.Errorf("the other reader was signed out: %v", err)
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
