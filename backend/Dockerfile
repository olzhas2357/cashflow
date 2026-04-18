FROM golang:1.23.6-alpine AS builder
WORKDIR /app

RUN apk add --no-cache git

COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 go build -o cashflow-api ./main.go

FROM alpine:3.20
WORKDIR /app

RUN apk add --no-cache ca-certificates

COPY --from=builder /app/cashflow-api ./cashflow-api
COPY --from=builder /app/database ./database

EXPOSE 8080
CMD ["./cashflow-api"]
