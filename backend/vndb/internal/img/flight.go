package img

import (
	"fmt"
	"sync"
)

// A flight collapses concurrent work on the same key into one run, so many
// readers opening the same uncached image cause one fetch from vndb. A
// minimal x/sync/singleflight, to avoid a dependency with one caller.
type flight struct {
	mu    sync.Mutex
	calls map[string]*call
}

type call struct {
	done  chan struct{}
	bytes []byte
	err   error
}

func newFlight() *flight { return &flight{calls: map[string]*call{}} }

// Do runs fn for the first caller on key and makes every other caller that
// arrives while it runs wait for the same answer.
func (f *flight) Do(key string, fn func() ([]byte, error)) (data []byte, err error) {
	f.mu.Lock()
	if c, running := f.calls[key]; running {
		f.mu.Unlock()
		<-c.done
		return c.bytes, c.err
	}
	c := &call{done: make(chan struct{})}
	f.calls[key] = c
	f.mu.Unlock()

	// Always release the waiters and free the key; a panic becomes an error so
	// one bad file can't strand its waiters or poison the key for good.
	defer func() {
		if p := recover(); p != nil {
			c.err = fmt.Errorf("recovered while working on %s: %v", key, p)
		}
		f.mu.Lock()
		delete(f.calls, key)
		f.mu.Unlock()
		close(c.done)
		data, err = c.bytes, c.err
	}()

	c.bytes, c.err = fn()
	return c.bytes, c.err
}
