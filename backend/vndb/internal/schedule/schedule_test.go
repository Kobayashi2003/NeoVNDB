package schedule

import (
	"context"
	"errors"
	"sync/atomic"
	"testing"
	"time"
)

func fixed(p Plan) func() Plan { return func() Plan { return p } }

// Lower bounds only, so a slow machine cannot fail it: the first run waits
// first, and each later one waits every after the previous run ended.
func TestEvery(t *testing.T) {
	const first, every = 30 * time.Millisecond, 50 * time.Millisecond
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	start := time.Now()
	var at []time.Duration
	Every(ctx, fixed(Plan{First: first, Every: every}), nil, nil, func(context.Context) error {
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
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	runs := 0
	done := make(chan struct{})
	go func() {
		Every(ctx, fixed(Plan{Every: time.Hour, Retry: 20 * time.Millisecond}), nil, nil, func(context.Context) error {
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

// Off waits rather than returning, says nothing is due, and runs once turned
// on, after First.
func TestEveryOffThenOn(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	var every atomic.Int64
	replan := make(chan struct{})
	dues := make(chan *time.Time, 10)
	ran := make(chan struct{})
	go Every(ctx, func() Plan { return Plan{First: 10 * time.Millisecond, Every: time.Duration(every.Load())} },
		replan, func(at *time.Time) { dues <- at }, func(context.Context) error {
			close(ran)
			cancel()
			return nil
		})

	if at := <-dues; at != nil {
		t.Fatalf("off, yet due at %v", at)
	}
	select {
	case <-ran:
		t.Fatal("ran while off")
	case <-time.After(50 * time.Millisecond):
	}
	every.Store(int64(time.Hour))
	replan <- struct{}{}
	if at := <-dues; at == nil || time.Until(*at) > time.Second {
		t.Fatalf("turned on, due at %v; want First from now", at)
	}
	select {
	case <-ran:
	case <-time.After(5 * time.Second):
		t.Fatal("never ran once turned on")
	}
}

// A shorter interval set after a run counts from that run, not from the
// change.
func TestEveryReplanShortens(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	var every atomic.Int64
	every.Store(int64(time.Hour))
	replan := make(chan struct{})
	runs := make(chan struct{}, 2)
	go Every(ctx, func() Plan { return Plan{Every: time.Duration(every.Load())} },
		replan, nil, func(context.Context) error {
			runs <- struct{}{}
			return nil
		})

	<-runs
	every.Store(int64(20 * time.Millisecond))
	replan <- struct{}{}
	select {
	case <-runs:
	case <-time.After(5 * time.Second):
		t.Fatal("the shorter interval did not take effect")
	}
}
