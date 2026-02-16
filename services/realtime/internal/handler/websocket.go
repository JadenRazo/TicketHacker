package handler

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"

	"github.com/gorilla/websocket"
	"github.com/rs/zerolog/log"
	"github.com/tickethacker/realtime/internal/auth"
	"github.com/tickethacker/realtime/internal/redis"
	"github.com/tickethacker/realtime/internal/ws"
)

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin:     func(r *http.Request) bool { return true },
}

func WebSocket(hub *ws.Hub, redisClient *redis.Client, jwtSecret string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		token := r.URL.Query().Get("token")
		if token == "" {
			http.Error(w, "missing token", http.StatusUnauthorized)
			return
		}

		claims, err := auth.ValidateToken(token, jwtSecret)
		if err != nil {
			log.Warn().Err(err).Msg("WebSocket auth failed")
			http.Error(w, "invalid token", http.StatusUnauthorized)
			return
		}

		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			log.Error().Err(err).Msg("WebSocket upgrade failed")
			return
		}

		client := &ws.Client{
			Hub:      hub,
			Conn:     conn,
			Send:     make(chan []byte, 256),
			UserID:   claims.Sub,
			TenantID: claims.TenantID,
			Email:    claims.Email,
			Role:     claims.Role,
			Redis:    redisClient,
		}

		hub.Register(client)

		ctx := context.Background()
		redisClient.SetPresence(ctx, claims.TenantID, claims.Sub)

		userName := strings.Split(claims.Email, "@")[0]
		payload, _ := json.Marshal(ws.OutgoingMessage{
			Event: "agent:online",
			Data:  ws.AgentPresence{UserID: claims.Sub},
		})
		hub.Broadcast(ws.BroadcastMessage{
			Target:   ws.TargetTenant,
			TargetID: claims.TenantID,
			Payload:  payload,
		})

		log.Info().
			Str("userId", claims.Sub).
			Str("tenantId", claims.TenantID).
			Str("userName", userName).
			Msg("WebSocket client connected")

		go client.WritePump()
		go client.ReadPump()
	}
}
