package cache

import (
	"context"
	"strconv"
	"testing"
	"time"
)

func TestMemoryEvictsLeastRecentlyUsed(t *testing.T) {
	ctx := context.Background()
	c := NewMemory(3, 0, time.Hour)

	for i := 0; i < 3; i++ {
		c.Set(ctx, strconv.Itoa(i), []byte{byte(i)})
	}
	// Touching 0 makes 1 the oldest, so 1 is what a fourth entry displaces.
	if _, ok := c.Get(ctx, "0"); !ok {
		t.Fatal("0 should still be cached")
	}
	c.Set(ctx, "3", []byte{3})

	if _, ok := c.Get(ctx, "1"); ok {
		t.Error("1 should have been evicted")
	}
	for _, k := range []string{"0", "2", "3"} {
		if _, ok := c.Get(ctx, k); !ok {
			t.Errorf("%s should still be cached", k)
		}
	}
	if c.Len() != 3 {
		t.Errorf("holding %d entries, want 3", c.Len())
	}
}

func TestMemoryExpires(t *testing.T) {
	ctx := context.Background()
	c := NewMemory(4, 0, time.Nanosecond)
	c.Set(ctx, "k", []byte("v"))
	time.Sleep(time.Millisecond)
	if _, ok := c.Get(ctx, "k"); ok {
		t.Error("the entry should have expired")
	}
}

// Few large bodies fill the byte bound long before the count.
func TestMemoryBoundsBytes(t *testing.T) {
	ctx := context.Background()
	c := NewMemory(100, 10, time.Hour)
	c.Set(ctx, "a", make([]byte, 4))
	c.Set(ctx, "b", make([]byte, 4))
	c.Set(ctx, "c", make([]byte, 4)) // 12 bytes: a goes
	if _, ok := c.Get(ctx, "a"); ok {
		t.Error("a should have been evicted for space")
	}
	// Replacing an entry counts its new size, not both.
	c.Set(ctx, "c", make([]byte, 6))
	if _, ok := c.Get(ctx, "b"); !ok || c.Len() != 2 {
		t.Errorf("b and c (10 bytes) should both fit; holding %d", c.Len())
	}
	// A body bigger than the whole bound is not kept, and evicts nothing.
	c.Set(ctx, "huge", make([]byte, 11))
	if _, ok := c.Get(ctx, "huge"); ok || c.Len() != 2 {
		t.Errorf("an 11-byte body was kept, or cost the others; holding %d", c.Len())
	}
	// Nor does an entry it replaces stay behind.
	c.Set(ctx, "b", make([]byte, 11))
	if _, ok := c.Get(ctx, "b"); ok || c.Len() != 1 {
		t.Errorf("b still answers after an oversized replacement; holding %d", c.Len())
	}
}

// The generation is part of the key, so promoting one makes every key of the
// previous generation unreachable without anything being deleted.
func TestKeySeparatesGenerations(t *testing.T) {
	a := Key("20260819", "vn", "x")
	b := Key("20260826", "vn", "x")
	if a == b {
		t.Error("two generations produced the same key")
	}
	if a != Key("20260819", "vn", "x") {
		t.Error("the same request produced two keys")
	}
	if a == Key("20260819", "vn", "y") {
		t.Error("two requests produced the same key")
	}
}
