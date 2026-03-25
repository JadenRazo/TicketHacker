package auth

import (
	"fmt"

	"github.com/golang-jwt/jwt/v5"
)

type Claims struct {
	Sub      string `json:"sub"`
	TenantID string `json:"tenantId"`
	Email    string `json:"email"`
	Role     string `json:"role"`
	jwt.RegisteredClaims
}

func ValidateToken(tokenString, secret string) (*Claims, error) {
	token, err := jwt.ParseWithClaims(tokenString, &Claims{}, func(token *jwt.Token) (interface{}, error) {
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
		}
		return []byte(secret), nil
	})
	if err != nil {
		return nil, fmt.Errorf("invalid token: %w", err)
	}

	claims, ok := token.Claims.(*Claims)
	if !ok || !token.Valid {
		return nil, fmt.Errorf("invalid token claims")
	}

	if claims.Sub == "" || claims.TenantID == "" {
		return nil, fmt.Errorf("token missing required fields (sub, tenantId)")
	}

	return claims, nil
}
