FROM golang:1.23-alpine AS builder

WORKDIR /build
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o realtime .

FROM alpine:3.20

RUN apk add --no-cache ca-certificates wget
COPY --from=builder /build/realtime /usr/local/bin/realtime

EXPOSE 3002
CMD ["realtime"]
