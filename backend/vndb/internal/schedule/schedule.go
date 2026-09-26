// Package schedule runs a job on a timer inside the service that owns it:
// first after a delay, then at an interval, until the service stops. Runs never
// overlap: the next wait starts when a run ends.
package schedule

import (
	"context"
	"time"
)

// Every runs job after first, then every interval. An interval of 0 or less
// turns the job off.
func Every(ctx context.Context, first, every time.Duration, job func(context.Context)) {
	if every <= 0 {
		return
	}
	wait := time.NewTimer(max(first, 0))
	defer wait.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-wait.C:
		}
		job(ctx)
		wait.Reset(every)
	}
}
