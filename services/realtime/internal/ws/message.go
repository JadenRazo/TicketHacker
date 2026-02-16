package ws

import "encoding/json"

type IncomingMessage struct {
	Event string          `json:"event"`
	Data  json.RawMessage `json:"data"`
}

type OutgoingMessage struct {
	Event string      `json:"event"`
	Data  interface{} `json:"data"`
}

type TicketJoinData struct {
	TicketID string `json:"ticketId"`
}

type TicketLeaveData struct {
	TicketID string `json:"ticketId"`
}

type TypingData struct {
	TicketID string `json:"ticketId"`
	IsTyping bool   `json:"isTyping"`
}

type TypingBroadcast struct {
	UserID   string `json:"userId"`
	UserName string `json:"userName"`
	IsTyping bool   `json:"isTyping"`
}

type ViewersBroadcast struct {
	Viewers []string `json:"viewers"`
}

type AgentPresence struct {
	UserID string `json:"userId"`
}

type PresenceListResponse struct {
	AgentIDs []string `json:"agentIds"`
}

// BroadcastTarget determines who receives a broadcast message.
type BroadcastTarget int

const (
	TargetTenant BroadcastTarget = iota
	TargetTicket
)

type BroadcastMessage struct {
	Target   BroadcastTarget
	TargetID string
	Payload  []byte
}
