package middleware

import (
	"net/http"
	"sync"
	"time"

	"cashflow/typ"

	"github.com/gin-gonic/gin"
)

// IPRateLimiter is a simple in-memory fixed-window limiter keyed by client IP.
// Stage-1 test scope only (design/Task-Testing.md: "10 requests/hour per IP on
// /register and /rooms") — not distributed, resets on server restart, which is
// fine for local/single-instance testing.
type IPRateLimiter struct {
	mu       sync.Mutex
	window   time.Duration
	limit    int
	counters map[string]*ipWindow
}

type ipWindow struct {
	count     int
	windowEnd time.Time
}

func NewIPRateLimiter(limit int, window time.Duration) *IPRateLimiter {
	return &IPRateLimiter{
		window:   window,
		limit:    limit,
		counters: make(map[string]*ipWindow),
	}
}

func (l *IPRateLimiter) Allow(ip string) bool {
	l.mu.Lock()
	defer l.mu.Unlock()

	now := time.Now()
	w, ok := l.counters[ip]
	if !ok || now.After(w.windowEnd) {
		l.counters[ip] = &ipWindow{count: 1, windowEnd: now.Add(l.window)}
		return true
	}
	if w.count >= l.limit {
		return false
	}
	w.count++
	return true
}

// Middleware returns a gin.HandlerFunc that 429s once the per-IP limit is hit.
func (l *IPRateLimiter) Middleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		if !l.Allow(c.ClientIP()) {
			c.AbortWithStatusJSON(http.StatusTooManyRequests, typ.ErrorResponse{Error: "rate_limited"})
			return
		}
		c.Next()
	}
}
