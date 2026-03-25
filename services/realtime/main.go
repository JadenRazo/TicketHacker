package main

import (
	"context"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/joho/godotenv"
	"github.com/rs/zerolog"
	"github.com/rs/zerolog/log"

	"github.com/tickethacker/realtime/internal/config"
	"github.com/tickethacker/realtime/internal/handler"
	"github.com/tickethacker/realtime/internal/redis"
	"github.com/tickethacker/realtime/internal/ws"
)

func main() {
	zerolog.TimeFieldFormat = zerolog.TimeFormatUnix
	log.Logger = log.Output(zerolog.ConsoleWriter{Out: os.Stderr})

	// Load .env from project root (two levels up) and current directory
	godotenv.Load("../../.env")
	godotenv.Load(".env")

	cfg, err := config.Load()
	if err != nil {
		log.Fatal().Err(err).Msg("failed to load config")
	}

	redisClient, err := redis.NewClient(cfg.RedisAddr)
	if err != nil {
		log.Fatal().Err(err).Msg("failed to connect to Redis")
	}
	defer redisClient.Close()

	hub := ws.NewHub()
	go hub.Run()

	// Redis pub/sub subscriber
	subCtx, subCancel := context.WithCancel(context.Background())
	defer subCancel()

	subscriber := redis.NewSubscriber(redisClient.RDB, func(target int, targetID string, payload []byte) {
		hub.Broadcast(ws.BroadcastMessage{
			Target:   ws.BroadcastTarget(target),
			TargetID: targetID,
			Payload:  payload,
		})
	})
	go subscriber.Listen(subCtx)

	mux := http.NewServeMux()
	mux.HandleFunc("GET /health", handler.Health(redisClient))
	mux.HandleFunc("GET /ws", handler.WebSocket(hub, redisClient, cfg.JWTSecret))

	srv := &http.Server{
		Addr:         ":" + cfg.Port,
		Handler:      mux,
		ReadTimeout:  10 * time.Second,
		WriteTimeout: 10 * time.Second,
	}

	go func() {
		log.Info().Str("port", cfg.Port).Msg("realtime service started")
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatal().Err(err).Msg("server error")
		}
	}()

	// Graceful shutdown
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	log.Info().Msg("shutting down...")

	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer shutdownCancel()

	srv.Shutdown(shutdownCtx)
	subCancel()
	hub.Shutdown()

	log.Info().Msg("shutdown complete")
}
