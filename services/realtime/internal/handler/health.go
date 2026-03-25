package handler

import (
	"context"
	"encoding/json"
	"net/http"
	"time"

	"github.com/tickethacker/realtime/internal/redis"
)

func Health(redisClient *redis.Client) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
		defer cancel()

		w.Header().Set("Content-Type", "application/json")

		if err := redisClient.Ping(ctx); err != nil {
			w.WriteHeader(http.StatusServiceUnavailable)
			json.NewEncoder(w).Encode(map[string]string{
				"status": "error",
				"error":  "redis unavailable",
			})
			return
		}

		json.NewEncoder(w).Encode(map[string]string{
			"status": "ok",
		})
	}
}
