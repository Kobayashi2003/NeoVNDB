package admin

import (
	"context"
	"errors"
	"fmt"
	"io"
	"sync/atomic"
	"testing"
	"time"
)

func TestJobRunsOneAtATime(t *testing.T) {
	release := make(chan struct{})
	started := make(chan struct{})
	j := NewJob(func(ctx context.Context, out io.Writer) (any, error) {
		fmt.Fprintln(out, "first line")
		fmt.Fprint(out, "second ")
		fmt.Fprintln(out, "line")
		close(started)
		<-release
		return 3, errors.New("upstream gone")
	})

	if !j.Start(context.Background()) {
		t.Fatal("did not start")
	}
	<-started
	if j.Start(context.Background()) {
		t.Error("a second run started while the first was going")
	}
	if err := j.Run(context.Background()); !errors.Is(err, ErrRunning) {
		t.Errorf("Run during a run: %v, want ErrRunning", err)
	}
	if s := j.State(); !s.Running || len(s.Output) != 2 || s.Output[1] != "second line" {
		t.Errorf("while running: %+v", s)
	}

	close(release)
	for j.State().Running {
		time.Sleep(time.Millisecond)
	}
	s := j.State()
	if s.Error != "upstream gone" || s.Result != 3 || s.FinishedAt == nil {
		t.Errorf("after the run: %+v", s)
	}
}

func TestJobKeepsTheTail(t *testing.T) {
	j := NewJob(func(ctx context.Context, out io.Writer) (any, error) {
		for i := range tailLines + 5 {
			fmt.Fprintf(out, "line %d\n", i)
		}
		return nil, nil
	})
	if err := j.Run(context.Background()); err != nil {
		t.Fatal(err)
	}
	out := j.State().Output
	if len(out) != tailLines || out[0] != "line 5" {
		t.Errorf("%d lines from %q", len(out), out[0])
	}
}

// A failure the caller calls passing comes back after retry; a success waits
// the interval, and NextAt says so.
func TestJobSchedule(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	var runs atomic.Int32
	j := NewJob(func(ctx context.Context, out io.Writer) (any, error) {
		if runs.Add(1) == 1 {
			return nil, errors.New("unreachable")
		}
		return nil, nil
	})
	done := make(chan struct{})
	go func() {
		j.Schedule(ctx, 0, time.Hour, 20*time.Millisecond, func(error) bool { return true })
		close(done)
	}()

	deadline := time.After(5 * time.Second)
	for {
		s := j.State()
		if runs.Load() == 2 && !s.Running && s.NextAt != nil && time.Until(*s.NextAt) > 30*time.Minute {
			break
		}
		select {
		case <-deadline:
			t.Fatalf("after %d runs: %+v", runs.Load(), s)
		case <-time.After(5 * time.Millisecond):
		}
	}
	cancel()
	<-done
}
