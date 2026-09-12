package img

import "sync"

// A flight collapses concurrent work on the same key into one run.
//
// A page opening with twenty uncached covers is twenty requests, and a popular
// page opening at once is twenty times however many readers. Without this each
// of them would fetch the same file from vndb -- the one dependency here that
// is neither local nor ours to overload.
//
// This is x/sync/singleflight in the few lines actually needed, kept here
// rather than taken as a dependency: the package has one caller and the
// behaviour is worth being able to read.
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
func (f *flight) Do(key string, fn func() ([]byte, error)) ([]byte, error) {
	f.mu.Lock()
	if c, running := f.calls[key]; running {
		f.mu.Unlock()
		<-c.done
		return c.bytes, c.err
	}
	c := &call{done: make(chan struct{})}
	f.calls[key] = c
	f.mu.Unlock()

	c.bytes, c.err = fn()

	f.mu.Lock()
	delete(f.calls, key)
	f.mu.Unlock()
	close(c.done)

	return c.bytes, c.err
}
