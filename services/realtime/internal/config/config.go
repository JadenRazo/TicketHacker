package config

import (
	"fmt"
	"os"
)

type Config struct {
	Port      string
	RedisAddr string
	JWTSecret string
}

func Load() (*Config, error) {
	jwtSecret := os.Getenv("JWT_SECRET")
	if jwtSecret == "" {
		return nil, fmt.Errorf("JWT_SECRET environment variable is required")
	}

	port := os.Getenv("REALTIME_PORT")
	if port == "" {
		port = "3002"
	}

	redisHost := os.Getenv("REDIS_HOST")
	if redisHost == "" {
		redisHost = "localhost"
	}

	redisPort := os.Getenv("REDIS_PORT")
	if redisPort == "" {
		redisPort = "6381"
	}

	return &Config{
		Port:      port,
		RedisAddr: redisHost + ":" + redisPort,
		JWTSecret: jwtSecret,
	}, nil
}
