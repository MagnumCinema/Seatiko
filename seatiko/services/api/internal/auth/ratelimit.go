package auth

import (
	"net/http"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
)

type rateBucket struct {
	count   int
	resetAt time.Time
}

// RateLimitMiddleware limits requests per client IP.
func RateLimitMiddleware(limit int, window time.Duration) gin.HandlerFunc {
	return rateLimit(limit, window, func(c *gin.Context) string { return c.ClientIP() })
}

// RateLimitPerUser limits requests per signed-in user (after Middleware), else per IP.
func RateLimitPerUser(limit int, window time.Duration) gin.HandlerFunc {
	return rateLimit(limit, window, func(c *gin.Context) string {
		if id := c.GetString("userID"); id != "" {
			return "user:" + id
		}
		return c.ClientIP()
	})
}

func rateLimit(limit int, window time.Duration, keyOf func(*gin.Context) string) gin.HandlerFunc {
	var mu sync.Mutex
	buckets := map[string]*rateBucket{}
	return func(c *gin.Context) {
		ip := keyOf(c)
		now := time.Now()
		mu.Lock()
		bucket, ok := buckets[ip]
		if !ok || now.After(bucket.resetAt) {
			bucket = &rateBucket{count: 0, resetAt: now.Add(window)}
			buckets[ip] = bucket
		}
		bucket.count++
		count := bucket.count
		mu.Unlock()
		if count > limit {
			c.AbortWithStatusJSON(http.StatusTooManyRequests, gin.H{"error": "rate_limited"})
			return
		}
		c.Next()
	}
}
