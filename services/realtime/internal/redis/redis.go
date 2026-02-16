package redis

import (
	"context"

	"github.com/redis/go-redis/v9"
	"github.com/rs/zerolog/log"
)

type Client struct {
	RDB *redis.Client
}

func NewClient(addr string) (*Client, error) {
	rdb := redis.NewClient(&redis.Options{
		Addr:         addr,
		PoolSize:     50,
		MinIdleConns: 10,
	})

	if err := rdb.Ping(context.Background()).Err(); err != nil {
		return nil, err
	}

	log.Info().Str("addr", addr).Msg("connected to Redis")
	return &Client{RDB: rdb}, nil
}

func (c *Client) Close() error {
	return c.RDB.Close()
}

func (c *Client) Ping(ctx context.Context) error {
	return c.RDB.Ping(ctx).Err()
}
