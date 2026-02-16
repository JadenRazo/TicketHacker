package redis

import (
	"context"
	"strings"
	"time"
)

func (c *Client) SetPresence(ctx context.Context, tenantID, userID string) error {
	key := "presence:" + tenantID + ":" + userID
	return c.RDB.Set(ctx, key, time.Now().UnixMilli(), 30*time.Second).Err()
}

func (c *Client) RemovePresence(ctx context.Context, tenantID, userID string) error {
	key := "presence:" + tenantID + ":" + userID
	return c.RDB.Del(ctx, key).Err()
}

func (c *Client) ListPresence(ctx context.Context, tenantID string) ([]string, error) {
	pattern := "presence:" + tenantID + ":*"
	var agentIDs []string
	var cursor uint64

	for {
		keys, next, err := c.RDB.Scan(ctx, cursor, pattern, 100).Result()
		if err != nil {
			return nil, err
		}
		for _, key := range keys {
			parts := strings.SplitN(key, ":", 3)
			if len(parts) == 3 {
				agentIDs = append(agentIDs, parts[2])
			}
		}
		cursor = next
		if cursor == 0 {
			break
		}
	}

	return agentIDs, nil
}
