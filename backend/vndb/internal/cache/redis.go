package cache

import (
	"context"
	"fmt"
	"time"

	"github.com/redis/go-redis/v9"
)

// Redis is the backend when several API instances should share a cache. A
// failed read or write is not an error the caller sees: a cache that is down
// costs latency, not correctness.
type Redis struct {
	client *redis.Client
	ttl    time.Duration
}

func NewRedis(ctx context.Context, url string, ttl time.Duration) (*Redis, error) {
	opt, err := redis.ParseURL(url)
	if err != nil {
		return nil, fmt.Errorf("parse redis url: %w", err)
	}
	client := redis.NewClient(opt)
	if err := client.Ping(ctx).Err(); err != nil {
		return nil, fmt.Errorf("redis: %w", err)
	}
	return &Redis{client: client, ttl: ttl}, nil
}

func (r *Redis) Get(ctx context.Context, key string) ([]byte, bool) {
	b, err := r.client.Get(ctx, key).Bytes()
	if err != nil {
		return nil, false
	}
	return b, true
}

func (r *Redis) Set(ctx context.Context, key string, value []byte) {
	_ = r.client.Set(ctx, key, value, r.ttl).Err()
}

func (r *Redis) Name() string { return "redis" }
func (r *Redis) Close() error { return r.client.Close() }
