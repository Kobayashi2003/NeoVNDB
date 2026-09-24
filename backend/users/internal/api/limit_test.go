package api

import (
	"net/http/httptest"
	"testing"
	"time"
)

func TestTriesWindow(t *testing.T) {
	tr := newTries(2, time.Hour)
	for i := 0; i < 2; i++ {
		if ok, _ := tr.take("a"); !ok {
			t.Fatalf("attempt %d refused", i+1)
		}
	}
	ok, wait := tr.take("a")
	if ok || wait <= 0 || wait > time.Hour {
		t.Errorf("third attempt: ok %v wait %v", ok, wait)
	}
	if ok, _ := tr.take("b"); !ok {
		t.Error("keys share a count")
	}
	tr.forget("a")
	if ok, _ := tr.take("a"); !ok {
		t.Error("forget did not clear the key")
	}
}

func TestTriesSlides(t *testing.T) {
	tr := newTries(1, 20*time.Millisecond)
	tr.take("a")
	if ok, _ := tr.take("a"); ok {
		t.Fatal("second attempt inside the window was allowed")
	}
	time.Sleep(30 * time.Millisecond)
	if ok, _ := tr.take("a"); !ok {
		t.Error("the window did not slide")
	}
}

func TestTriesOff(t *testing.T) {
	tr := newTries(0, time.Hour)
	for i := 0; i < 100; i++ {
		if ok, _ := tr.take("a"); !ok {
			t.Fatal("a zero limit should mean unlimited")
		}
	}
}

// The edge appends the real peer, so only the last entry can be trusted;
// anything before it is whatever the client sent.
func TestCallerTrustsTheLastForwardedEntry(t *testing.T) {
	r := httptest.NewRequest("POST", "/login", nil)
	r.RemoteAddr = "127.0.0.1:5555"
	if got := caller(r); got != "127.0.0.1" {
		t.Errorf("no header: %q", got)
	}
	r.Header.Set("X-Forwarded-For", "6.6.6.6, 203.0.113.9")
	if got := caller(r); got != "203.0.113.9" {
		t.Errorf("spoofed prefix: %q", got)
	}
}

func TestHumanWait(t *testing.T) {
	for s, want := range map[int]string{1: "1 seconds", 59: "59 seconds", 60: "a minute", 121: "3 minutes"} {
		if got := humanWait(s); got != want {
			t.Errorf("%d: %q, want %q", s, got, want)
		}
	}
}
