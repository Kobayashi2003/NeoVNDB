// Package schedule runs a job on a timer inside the service that owns it:
// first after a delay, then at an interval, until the service stops. Runs never
// overlap: the next wait starts when a run ends.
package schedule

import (
	"context"
	"time"
)

// Every runs job after first, then every interval. After a run that returns
// an error the wait is retry instead, when retry is above 0: a job whose
// failure passes (an unreachable host) need not wait a whole interval. An
// interval of 0 or less turns the job off.
func Every(ctx context.Context, first, every, retry time.Duration, job func(context.Context) error) {
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
		if err := job(ctx); err != nil && retry > 0 {
			wait.Reset(retry)
		} else {
			wait.Reset(every)
		}
	}
}
