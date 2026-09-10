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
	ttl     time.Duration
}

type entry struct {
	key     string
	value   []byte
	expires time.Time
}

func NewMemory(maxEntries int, ttl time.Duration) *Memory {
	if maxEntries <= 0 {
		maxEntries = 1024
	}
	return &Memory{
		entries: make(map[string]*list.Element, maxEntries),
		order:   list.New(),
		max:     maxEntries,
		ttl:     ttl,
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
	if el, ok := m.entries[key]; ok {
		e := el.Value.(*entry)
		e.value, e.expires = value, expires
		m.order.MoveToFront(el)
		return
	}
	m.entries[key] = m.order.PushFront(&entry{key: key, value: value, expires: expires})
	for m.order.Len() > m.max {
		m.drop(m.order.Back())
	}
}

func (m *Memory) drop(el *list.Element) {
	m.order.Remove(el)
	delete(m.entries, el.Value.(*entry).key)
}

func (m *Memory) Name() string { return "memory" }
func (m *Memory) Close() error { return nil }

// Len is the number of live entries, for /health.
func (m *Memory) Len() int {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.order.Len()
}
