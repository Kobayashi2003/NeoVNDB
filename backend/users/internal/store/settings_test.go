package store

import (
	"context"
	"encoding/json"
	"errors"
	"testing"
)

func TestPrefs(t *testing.T) {
	s, ctx := open(t), context.Background()
	u := user(t, s, "reader")

	// Never saved reads as nothing, not as an empty object: the first device
	// to sign in then sends its own.
	if got, err := s.Prefs(ctx, u.ID); err != nil || got != nil {
		t.Fatalf("before any: %s %v", got, err)
	}
	for _, v := range []string{`{"spoiler":1}`, `{"spoiler":2,"original":true}`} {
		if err := s.SetPrefs(ctx, u.ID, json.RawMessage(v)); err != nil {
			t.Fatal(err)
		}
	}
	got, err := s.Prefs(ctx, u.ID)
	if err != nil {
		t.Fatal(err)
	}
	var back map[string]any
	if err := json.Unmarshal(got, &back); err != nil || back["spoiler"] != 2.0 || back["original"] != true {
		t.Errorf("replaced whole: %s %v", got, err)
	}

	// They go with the account.
	if err := s.DeleteUser(ctx, u.ID); err != nil {
		t.Fatal(err)
	}
	if got, _ := s.Prefs(ctx, u.ID); got != nil {
		t.Errorf("after the account went: %s", got)
	}
}

func TestSearches(t *testing.T) {
	s, ctx := open(t), context.Background()
	a, b := user(t, s, "a"), user(t, s, "b")

	mine, err := s.CreateSearch(ctx, a.ID, "v", "English freeware", "lang=en&freeware=true", 0)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := s.CreateSearch(ctx, a.ID, "v", "English freeware", "lang=en", 0); !errors.Is(err, ErrTaken) {
		t.Errorf("same name, same type: %v", err)
	}
	if _, err := s.CreateSearch(ctx, a.ID, "c", "English freeware", "lang=en", 0); err != nil {
		t.Errorf("same name, other type: %v", err)
	}
	// Another reader's search, guessed by id, does not exist for them.
	if err := s.DeleteSearch(ctx, b.ID, mine.ID); !errors.Is(err, ErrNotFound) {
		t.Errorf("delete another's: %v", err)
	}
	if got, _ := s.Searches(ctx, b.ID, ""); len(got) != 0 {
		t.Errorf("another reader sees %d", len(got))
	}

	got, err := s.Searches(ctx, a.ID, "v")
	if err != nil || len(got) != 1 || got[0].Name != "English freeware" || got[0].Query != "lang=en&freeware=true" {
		t.Fatalf("of one type: %+v %v", got, err)
	}

	// The ceiling counts every type together.
	if _, err := s.CreateSearch(ctx, a.ID, "p", "Third", "search=key", 2); !errors.Is(err, ErrFull) {
		t.Errorf("a third over a ceiling of 2: %v", err)
	}
	if err := s.DeleteSearch(ctx, a.ID, mine.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := s.CreateSearch(ctx, a.ID, "p", "Third", "search=key", 2); err != nil {
		t.Errorf("room again after deleting one: %v", err)
	}
}
