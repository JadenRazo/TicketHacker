package redis

import "context"

func (c *Client) AddViewer(ctx context.Context, ticketID, userID string) error {
	return c.RDB.SAdd(ctx, "viewing:"+ticketID, userID).Err()
}

func (c *Client) RemoveViewer(ctx context.Context, ticketID, userID string) error {
	return c.RDB.SRem(ctx, "viewing:"+ticketID, userID).Err()
}

func (c *Client) GetViewers(ctx context.Context, ticketID string) ([]string, error) {
	return c.RDB.SMembers(ctx, "viewing:"+ticketID).Result()
}
