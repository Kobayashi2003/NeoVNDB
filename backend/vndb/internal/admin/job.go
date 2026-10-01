// Package admin is what an administrator reaches through the edge's /admin
// routes: the state of the mirror and its scheduled work, buttons for that
// work, and the translation corpus. Nothing here checks who is asking; the
// edge lets only administrators through (see edge/Caddyfile.snippet).
package admin

import (
	"bytes"
	"context"
	"errors"
	"io"
	"os"
	"sync"
	"time"

	"github.com/kobayashi/neovndb/internal/schedule"
)

// ErrRunning means the job is already running; nothing was started.
var ErrRunning = errors.New("already running")

// tailLines is how much of a run's output the admin page sees.
const tailLines = 200

// A Job is long work that runs one at a time, on a schedule or on request,
// and remembers how its last run went.
type Job struct {
	run func(ctx context.Context, out io.Writer) (any, error)

	mu    sync.Mutex
	state JobState
}

// JobState is a job as the admin page shows it.
type JobState struct {
	Running    bool       `json:"running"`
	StartedAt  *time.Time `json:"started_at"`
	FinishedAt *time.Time `json:"finished_at"`
	Error      string     `json:"error,omitempty"`
	// What the last finished run reported, if the job reports anything.
	Result any `json:"result,omitempty"`
	// When the schedule runs it next; nil when it is not scheduled.
	NextAt *time.Time `json:"next_at"`
	// The tail of the current run's output, or the last one's.
	Output []string `json:"output"`
}

// NewJob wraps run, whose output also goes to stdout, as it did before.
func NewJob(run func(ctx context.Context, out io.Writer) (any, error)) *Job {
	return &Job{run: run, state: JobState{Output: []string{}}}
}

// Run runs the job now and waits for it, or returns ErrRunning.
func (j *Job) Run(ctx context.Context) error {
	if !j.begin() {
		return ErrRunning
	}
	result, err := j.run(ctx, io.MultiWriter(os.Stdout, &lines{job: j}))
	j.end(result, err)
	return err
}

// Start runs the job in the background under ctx, which should outlive the
// request asking for it. False means it was already running.
func (j *Job) Start(ctx context.Context) bool {
	if !j.begin() {
		return false
	}
	go func() {
		result, err := j.run(ctx, io.MultiWriter(os.Stdout, &lines{job: j}))
		j.end(result, err)
	}()
	return true
}

func (j *Job) begin() bool {
	j.mu.Lock()
	defer j.mu.Unlock()
	if j.state.Running {
		return false
	}
	now := time.Now()
	j.state.Running, j.state.StartedAt, j.state.FinishedAt = true, &now, nil
	j.state.Error, j.state.Output = "", []string{}
	return true
}

func (j *Job) end(result any, err error) {
	j.mu.Lock()
	defer j.mu.Unlock()
	now := time.Now()
	j.state.Running, j.state.FinishedAt = false, &now
	j.state.Result = result
	if err != nil {
		j.state.Error = err.Error()
	}
}

// Schedule runs the job on schedule.Every's timetable -- first, then every
// interval -- and keeps NextAt in step with it. failed, when given, sees each
// failed run's error (to log it) and says whether it is worth trying again
// after retry rather than a whole interval. A run refused because one is
// already going counts as a failure like any other.
func (j *Job) Schedule(ctx context.Context, first, every, retry time.Duration, failed func(error) bool) {
	if every <= 0 {
		return
	}
	j.setNext(first)
	schedule.Every(ctx, first, every, retry, func(ctx context.Context) error {
		err := j.Run(ctx)
		if err != nil && ctx.Err() == nil && failed != nil && failed(err) && retry > 0 {
			j.setNext(retry)
			return err
		}
		j.setNext(every)
		return nil
	})
}

func (j *Job) setNext(after time.Duration) {
	at := time.Now().Add(after)
	j.mu.Lock()
	defer j.mu.Unlock()
	j.state.NextAt = &at
}

func (j *Job) State() JobState {
	j.mu.Lock()
	defer j.mu.Unlock()
	s := j.state
	s.Output = append([]string{}, j.state.Output...)
	return s
}

// lines keeps the last tailLines complete lines written to it.
type lines struct {
	job     *Job
	partial []byte
}

func (l *lines) Write(p []byte) (int, error) {
	l.partial = append(l.partial, p...)
	l.job.mu.Lock()
	defer l.job.mu.Unlock()
	for {
		i := bytes.IndexByte(l.partial, '\n')
		if i < 0 {
			return len(p), nil
		}
		out := append(l.job.state.Output, string(bytes.TrimRight(l.partial[:i], "\r")))
		if len(out) > tailLines {
			out = out[len(out)-tailLines:]
		}
		l.job.state.Output = out
		l.partial = l.partial[i+1:]
	}
}
