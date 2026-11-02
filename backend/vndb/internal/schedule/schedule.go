// Package schedule runs a job on a timer inside the service that owns it:
// first after a delay, then at an interval, until the service stops. Runs never
// overlap: the next wait starts when a run ends.
package schedule

import (
	"context"
	"time"
)

// A Plan is when a job runs: First after the schedule starts, then Every after
// each run ends, or Retry after a run that returned an error when Retry is
// above 0 -- a job whose failure passes (an unreachable host) need not wait a
// whole interval. Every of 0 or less turns the job off.
type Plan struct {
	First, Every, Retry time.Duration
}

// Every runs job on plan, which it reads again after each run and whenever
// replan receives: a changed interval counts from the last run, and a job
// turned back on starts over with First. due, when not nil, hears each time
// when the next run is due, or nil while the job is off.
func Every(ctx context.Context, plan func() Plan, replan <-chan struct{}, due func(*time.Time), job func(context.Context) error) {
	if due == nil {
		due = func(*time.Time) {}
	}
	from, ran, failed := time.Now(), false, false
	for {
		p := plan()
		// A nil channel never fires: off waits for a replan or the end.
		var fire <-chan time.Time
		var timer *time.Timer
		if p.Every > 0 {
			wait := p.Every
			switch {
			case !ran:
				wait = p.First
			case failed && p.Retry > 0:
				wait = p.Retry
			}
			at := from.Add(wait)
			due(&at)
			timer = time.NewTimer(max(time.Until(at), 0))
			fire = timer.C
		} else {
			due(nil)
		}

		var fired bool
		select {
		case <-ctx.Done():
		case <-replan:
			if p.Every <= 0 {
				// Turned back on, or still off: either way, as if just started.
				from, ran, failed = time.Now(), false, false
			}
		case <-fire:
			fired = true
		}
		if timer != nil {
			timer.Stop()
		}
		if ctx.Err() != nil {
			return
		}
		if !fired {
			continue
		}
		failed = job(ctx) != nil
		from, ran = time.Now(), true
	}
}
