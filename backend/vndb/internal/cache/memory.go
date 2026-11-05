package cache

import (
	"container/list"
	"context"
	"sync"
	"time"
)

// Memory is a bounded LRU in the API process. It needs no other service, so it
// is the default: a single instance gets most of the benefit, and Redis is
// only worth its dependency once several instances share a cache.
type Memory struct {
	mu      sync.Mutex
	entries map[string]*list.Element
	order   *list.List // front is most recently used
	max     int
	// Bodies vary from bytes to a megabyte, so a count alone bounds nothing.
	maxBytes int
	bytes    int
	ttl      time.Duration
}

type entry struct {
	key     string
	value   []byte
	expires time.Time
}

// NewMemory holds at most maxEntries responses and maxBytes of them; 0 leaves
// the bytes unbounded.
func NewMemory(maxEntries, maxBytes int, ttl time.Duration) *Memory {
	if maxEntries <= 0 {
		maxEntries = 1024
	}
	return &Memory{
		entries:  make(map[string]*list.Element, maxEntries),
		order:    list.New(),
		max:      maxEntries,
		maxBytes: maxBytes,
		ttl:      ttl,
	}
}

func (m *Memory) Get(_ context.Context, key string) ([]byte, bool) {
	m.mu.Lock()
	defer m.mu.Unlock()

	el, ok := m.entries[key]
	if !ok {
		return nil, false
	}
	e := el.Value.(*entry)
	if !e.expires.IsZero() && time.Now().After(e.expires) {
		m.drop(el)
		return nil, false
	}
	m.order.MoveToFront(el)
	return e.value, true
}

func (m *Memory) Set(_ context.Context, key string, value []byte) {
	m.mu.Lock()
	defer m.mu.Unlock()

	var expires time.Time
	if m.ttl > 0 {
		expires = time.Now().Add(m.ttl)
	}
	el, ok := m.entries[key]
	if m.maxBytes > 0 && len(value) > m.maxBytes {
		// Not kept, and not left answering with what it replaced.
		if ok {
			m.drop(el)
		}
		return
	}
	if ok {
		e := el.Value.(*entry)
		m.bytes += len(value) - len(e.value)
		e.value, e.expires = value, expires
		m.order.MoveToFront(el)
	} else {
		m.entries[key] = m.order.PushFront(&entry{key: key, value: value, expires: expires})
		m.bytes += len(value)
	}
	for m.order.Len() > m.max || (m.maxBytes > 0 && m.bytes > m.maxBytes) {
		m.drop(m.order.Back())
	}
}

func (m *Memory) drop(el *list.Element) {
	e := el.Value.(*entry)
	m.order.Remove(el)
	delete(m.entries, e.key)
	m.bytes -= len(e.value)
}

func (m *Memory) Name() string { return "memory" }
func (m *Memory) Close() error { return nil }

// Len is the number of live entries, for /health.
func (m *Memory) Len() int {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.order.Len()
}
