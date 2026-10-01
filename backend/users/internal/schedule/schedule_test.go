package schedule

import (
	"context"
	"errors"
	"testing"
	"time"
)

// Lower bounds only, so a slow machine cannot fail it: the first run waits
// first, and each later one waits every after the previous run ended.
func TestEvery(t *testing.T) {
	const first, every = 30 * time.Millisecond, 50 * time.Millisecond
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	start := time.Now()
	var at []time.Duration
	Every(ctx, first, every, 0, func(context.Context) error {
		at = append(at, time.Since(start))
		if len(at) == 3 {
			cancel()
		}
		return nil
	})
	if len(at) != 3 {
		t.Fatalf("ran %d times, want 3 before the cancel", len(at))
	}
	if at[0] < first {
		t.Errorf("first run at %v, before %v", at[0], first)
	}
	for i := 1; i < len(at); i++ {
		if gap := at[i] - at[i-1]; gap < every {
			t.Errorf("run %d came %v after the last, under %v", i+1, gap, every)
		}
	}
}

// A failed run comes back after retry, well before the interval would.
func TestEveryRetry(t *testing.T) {
	const retry, every = 20 * time.Millisecond, time.Hour
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	runs := 0
	done := make(chan struct{})
	go func() {
		Every(ctx, 0, every, retry, func(context.Context) error {
			if runs++; runs == 2 {
				cancel()
			}
			return errors.New("upstream unreachable")
		})
		close(done)
	}()
	select {
	case <-done:
	case <-time.After(5 * time.Second):
		t.Fatal("no second run after a failure")
	}
}

func TestEveryOff(t *testing.T) {
	ran := false
	Every(context.Background(), 0, 0, 0, func(context.Context) error { ran = true; return nil })
	if ran {
		t.Error("an interval of 0 should turn the job off")
	}
}
