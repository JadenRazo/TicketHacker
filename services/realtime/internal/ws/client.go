package ws

import (
	"context"
	"encoding/json"
	"strings"
	"time"

	"github.com/gorilla/websocket"
	"github.com/rs/zerolog/log"
	"github.com/tickethacker/realtime/internal/redis"
)

const (
	pongWait       = 30 * time.Second
	pingPeriod     = 20 * time.Second
	maxMessageSize = 4096
	sendBufSize    = 256
)

type Client struct {
	Hub      *Hub
	Conn     *websocket.Conn
	Send     chan []byte
	UserID   string
	TenantID string
	Email    string
	Role     string
	Redis    *redis.Client
}

func (c *Client) ReadPump() {
	defer func() {
		c.cleanup()
		c.Hub.unregister <- c
		c.Conn.Close()
	}()

	c.Conn.SetReadLimit(maxMessageSize)
	c.Conn.SetReadDeadline(time.Now().Add(pongWait))
	c.Conn.SetPongHandler(func(string) error {
		c.Conn.SetReadDeadline(time.Now().Add(pongWait))
		return nil
	})

	for {
		_, raw, err := c.Conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseNormalClosure) {
				log.Warn().Err(err).Str("userId", c.UserID).Msg("unexpected close")
			}
			return
		}

		var msg IncomingMessage
		if err := json.Unmarshal(raw, &msg); err != nil {
			log.Warn().Err(err).Str("userId", c.UserID).Msg("invalid message format")
			continue
		}

		c.handleMessage(msg)
	}
}

func (c *Client) WritePump() {
	ticker := time.NewTicker(pingPeriod)
	defer func() {
		ticker.Stop()
		c.Conn.Close()
	}()

	for {
		select {
		case message, ok := <-c.Send:
			if !ok {
				c.Conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}
			if err := c.Conn.WriteMessage(websocket.TextMessage, message); err != nil {
				return
			}

		case <-ticker.C:
			if err := c.Conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}

func (c *Client) handleMessage(msg IncomingMessage) {
	ctx := context.Background()

	switch msg.Event {
	case "ticket:join":
		var data TicketJoinData
		if err := json.Unmarshal(msg.Data, &data); err != nil || data.TicketID == "" {
			return
		}
		c.Hub.joinTicket <- ticketAction{client: c, ticketID: data.TicketID}
		c.Redis.AddViewer(ctx, data.TicketID, c.UserID)
		c.broadcastViewers(ctx, data.TicketID)

	case "ticket:leave":
		var data TicketLeaveData
		if err := json.Unmarshal(msg.Data, &data); err != nil || data.TicketID == "" {
			return
		}
		c.Hub.leaveTicket <- ticketAction{client: c, ticketID: data.TicketID}
		c.Redis.RemoveViewer(ctx, data.TicketID, c.UserID)
		c.broadcastViewers(ctx, data.TicketID)

	case "typing":
		var data TypingData
		if err := json.Unmarshal(msg.Data, &data); err != nil || data.TicketID == "" {
			return
		}
		userName := strings.Split(c.Email, "@")[0]
		broadcast := TypingBroadcast{
			UserID:   c.UserID,
			UserName: userName,
			IsTyping: data.IsTyping,
		}
		payload, _ := json.Marshal(OutgoingMessage{Event: "typing", Data: broadcast})
		c.Hub.broadcast <- BroadcastMessage{
			Target:   TargetTicket,
			TargetID: data.TicketID,
			Payload:  payload,
		}

	case "heartbeat":
		c.Redis.SetPresence(ctx, c.TenantID, c.UserID)

	case "presence:list":
		agentIDs, err := c.Redis.ListPresence(ctx, c.TenantID)
		if err != nil {
			log.Warn().Err(err).Msg("failed to list presence")
			return
		}
		resp := PresenceListResponse{AgentIDs: agentIDs}
		payload, _ := json.Marshal(OutgoingMessage{Event: "presence:list", Data: resp})
		select {
		case c.Send <- payload:
		default:
		}
	}
}

func (c *Client) broadcastViewers(ctx context.Context, ticketID string) {
	viewers, err := c.Redis.GetViewers(ctx, ticketID)
	if err != nil {
		return
	}
	broadcast := ViewersBroadcast{Viewers: viewers}
	payload, _ := json.Marshal(OutgoingMessage{Event: "ticket:viewers", Data: broadcast})
	c.Hub.broadcast <- BroadcastMessage{
		Target:   TargetTicket,
		TargetID: ticketID,
		Payload:  payload,
	}
}

func (c *Client) cleanup() {
	ctx := context.Background()
	c.Redis.RemovePresence(ctx, c.TenantID, c.UserID)

	payload, _ := json.Marshal(OutgoingMessage{
		Event: "agent:offline",
		Data:  AgentPresence{UserID: c.UserID},
	})
	c.Hub.broadcast <- BroadcastMessage{
		Target:   TargetTenant,
		TargetID: c.TenantID,
		Payload:  payload,
	}
}
