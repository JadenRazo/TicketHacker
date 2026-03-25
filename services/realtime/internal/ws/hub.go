package ws

import (
	"github.com/rs/zerolog/log"
)

type Hub struct {
	clients  map[*Client]bool
	tenants  map[string]map[*Client]bool
	tickets  map[string]map[*Client]bool

	register   chan *Client
	unregister chan *Client
	joinTicket  chan ticketAction
	leaveTicket chan ticketAction
	broadcast   chan BroadcastMessage
	shutdown    chan struct{}
}

type ticketAction struct {
	client   *Client
	ticketID string
}

func NewHub() *Hub {
	return &Hub{
		clients:     make(map[*Client]bool),
		tenants:     make(map[string]map[*Client]bool),
		tickets:     make(map[string]map[*Client]bool),
		register:    make(chan *Client, 256),
		unregister:  make(chan *Client, 256),
		joinTicket:  make(chan ticketAction, 256),
		leaveTicket: make(chan ticketAction, 256),
		broadcast:   make(chan BroadcastMessage, 4096),
		shutdown:    make(chan struct{}),
	}
}

func (h *Hub) Run() {
	for {
		select {
		case client := <-h.register:
			h.clients[client] = true
			tid := client.TenantID
			if h.tenants[tid] == nil {
				h.tenants[tid] = make(map[*Client]bool)
			}
			h.tenants[tid][client] = true
			log.Debug().Str("userId", client.UserID).Str("tenantId", tid).Msg("client registered")

		case client := <-h.unregister:
			if _, ok := h.clients[client]; !ok {
				continue
			}
			delete(h.clients, client)
			tid := client.TenantID
			if h.tenants[tid] != nil {
				delete(h.tenants[tid], client)
				if len(h.tenants[tid]) == 0 {
					delete(h.tenants, tid)
				}
			}
			for ticketID, members := range h.tickets {
				delete(members, client)
				if len(members) == 0 {
					delete(h.tickets, ticketID)
				}
			}
			close(client.Send)
			log.Debug().Str("userId", client.UserID).Msg("client unregistered")

		case action := <-h.joinTicket:
			tid := action.ticketID
			if h.tickets[tid] == nil {
				h.tickets[tid] = make(map[*Client]bool)
			}
			h.tickets[tid][action.client] = true
			log.Debug().Str("userId", action.client.UserID).Str("ticketId", tid).Msg("joined ticket room")

		case action := <-h.leaveTicket:
			tid := action.ticketID
			if h.tickets[tid] != nil {
				delete(h.tickets[tid], action.client)
				if len(h.tickets[tid]) == 0 {
					delete(h.tickets, tid)
				}
			}
			log.Debug().Str("userId", action.client.UserID).Str("ticketId", tid).Msg("left ticket room")

		case msg := <-h.broadcast:
			var targets map[*Client]bool
			switch msg.Target {
			case TargetTenant:
				targets = h.tenants[msg.TargetID]
			case TargetTicket:
				targets = h.tickets[msg.TargetID]
			}
			for client := range targets {
				select {
				case client.Send <- msg.Payload:
				default:
					// slow client, drop and disconnect
					delete(h.clients, client)
					if h.tenants[client.TenantID] != nil {
						delete(h.tenants[client.TenantID], client)
					}
					close(client.Send)
				}
			}

		case <-h.shutdown:
			for client := range h.clients {
				close(client.Send)
			}
			return
		}
	}
}

func (h *Hub) Register(client *Client) {
	h.register <- client
}

func (h *Hub) Unregister(client *Client) {
	h.unregister <- client
}

func (h *Hub) Broadcast(msg BroadcastMessage) {
	h.broadcast <- msg
}

func (h *Hub) Shutdown() {
	close(h.shutdown)
}
