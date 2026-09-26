package schedule

import (
	"context"
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
	Every(ctx, first, every, func(context.Context) {
		at = append(at, time.Since(start))
		if len(at) == 3 {
			cancel()
		}
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

func TestEveryOff(t *testing.T) {
	ran := false
	Every(context.Background(), 0, 0, func(context.Context) { ran = true })
	if ran {
		t.Error("an interval of 0 should turn the job off")
	}
}
