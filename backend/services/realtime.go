package services

import (
	"encoding/json"
	"log"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

type NegotiationEvent struct {
	Type      string      `json:"type"`
	Timestamp time.Time   `json:"timestamp"`
	Payload   interface{} `json:"payload"`
}

type wsClient struct {
	conn     *websocket.Conn
	playerID string
	role     string
	gameID   string
	send     chan []byte
}

type RealtimeHub struct {
	mu      sync.RWMutex
	clients map[*wsClient]struct{}
}

func NewRealtimeHub() *RealtimeHub {
	return &RealtimeHub{
		clients: map[*wsClient]struct{}{},
	}
}

func (h *RealtimeHub) Register(conn *websocket.Conn, playerID, role, gameID string) *wsClient {
	c := &wsClient{
		conn:     conn,
		playerID: playerID,
		role:     role,
		gameID:   gameID,
		send:     make(chan []byte, 32),
	}

	h.mu.Lock()
	h.clients[c] = struct{}{}
	h.mu.Unlock()

	go h.writePump(c)
	go h.readPump(c)
	return c
}

func (h *RealtimeHub) readPump(c *wsClient) {
	defer h.unregister(c)
	for {
		if _, _, err := c.conn.ReadMessage(); err != nil {
			return
		}
	}
}

func (h *RealtimeHub) writePump(c *wsClient) {
	defer h.unregister(c)
	for msg := range c.send {
		if err := c.conn.WriteMessage(websocket.TextMessage, msg); err != nil {
			return
		}
	}
}

func (h *RealtimeHub) unregister(c *wsClient) {
	h.mu.Lock()
	if _, ok := h.clients[c]; ok {
		delete(h.clients, c)
		close(c.send)
		_ = c.conn.Close()
	}
	h.mu.Unlock()
}

// Broadcast delivers an event only to clients registered for the given gameID.
func (h *RealtimeHub) Broadcast(gameID string, eventType string, payload interface{}) {
	event := NegotiationEvent{
		Type:      eventType,
		Timestamp: time.Now().UTC(),
		Payload:   payload,
	}
	b, err := json.Marshal(event)
	if err != nil {
		log.Printf("realtime marshal error: %v", err)
		return
	}

	h.mu.RLock()
	defer h.mu.RUnlock()
	for c := range h.clients {
		if c.gameID != gameID {
			continue
		}
		select {
		case c.send <- b:
		default:
			// Drop if slow consumer.
		}
	}
}
