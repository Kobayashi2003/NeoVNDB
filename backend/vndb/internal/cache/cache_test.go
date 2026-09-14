package cache

import (
	"context"
	"strconv"
	"testing"
	"time"
)

func TestMemoryEvictsLeastRecentlyUsed(t *testing.T) {
	ctx := context.Background()
	c := NewMemory(3, time.Hour)

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
	c := NewMemory(4, time.Nanosecond)
	c.Set(ctx, "k", []byte("v"))
	time.Sleep(time.Millisecond)
	if _, ok := c.Get(ctx, "k"); ok {
		t.Error("the entry should have expired")
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
