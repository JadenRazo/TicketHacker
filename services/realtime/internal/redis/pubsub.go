package redis

import (
	"context"
	"encoding/json"

	goredis "github.com/redis/go-redis/v9"
	"github.com/rs/zerolog/log"
)

const EventChannel = "tickethacker:events"

type RedisEvent struct {
	Event    string          `json:"event"`
	TenantID string         `json:"tenant_id"`
	Ticket   json.RawMessage `json:"ticket,omitempty"`
	TicketID string          `json:"ticket_id,omitempty"`
	Message  json.RawMessage `json:"message,omitempty"`
	SourceID string          `json:"source_id,omitempty"`
	TargetID string          `json:"target_id,omitempty"`
}

type BroadcastFunc func(target int, targetID string, payload []byte)

type Subscriber struct {
	rdb       *goredis.Client
	broadcast BroadcastFunc
}

func NewSubscriber(rdb *goredis.Client, broadcast BroadcastFunc) *Subscriber {
	return &Subscriber{rdb: rdb, broadcast: broadcast}
}

func (s *Subscriber) Listen(ctx context.Context) {
	pubsub := s.rdb.Subscribe(ctx, EventChannel)
	defer pubsub.Close()

	log.Info().Str("channel", EventChannel).Msg("subscribed to Redis channel")

	ch := pubsub.Channel()
	for {
		select {
		case <-ctx.Done():
			log.Info().Msg("pub/sub listener stopped")
			return
		case msg, ok := <-ch:
			if !ok {
				return
			}
			s.handleMessage(msg.Payload)
		}
	}
}

func (s *Subscriber) handleMessage(payload string) {
	var event RedisEvent
	if err := json.Unmarshal([]byte(payload), &event); err != nil {
		log.Warn().Err(err).Msg("failed to parse Redis event")
		return
	}

	log.Debug().Str("event", event.Event).Str("tenantId", event.TenantID).Msg("received Redis event")

	switch event.Event {
	case "ticket.created":
		out, _ := json.Marshal(map[string]interface{}{
			"event": "ticket:created",
			"data":  json.RawMessage(event.Ticket),
		})
		s.broadcast(0, event.TenantID, out) // TargetTenant = 0

	case "ticket.updated":
		out, _ := json.Marshal(map[string]interface{}{
			"event": "ticket:updated",
			"data":  json.RawMessage(event.Ticket),
		})
		s.broadcast(0, event.TenantID, out) // TargetTenant
		// also broadcast to the ticket room
		var ticket struct {
			ID string `json:"id"`
		}
		if json.Unmarshal(event.Ticket, &ticket) == nil && ticket.ID != "" {
			s.broadcast(1, ticket.ID, out) // TargetTicket = 1
		}

	case "ticket.merged":
		out, _ := json.Marshal(map[string]interface{}{
			"event": "ticket:merged",
			"data": map[string]string{
				"sourceId": event.SourceID,
				"targetId": event.TargetID,
			},
		})
		s.broadcast(0, event.TenantID, out) // TargetTenant

	case "message.created":
		out, _ := json.Marshal(map[string]interface{}{
			"event": "message:created",
			"data":  json.RawMessage(event.Message),
		})
		s.broadcast(1, event.TicketID, out) // TargetTicket
	}
}
