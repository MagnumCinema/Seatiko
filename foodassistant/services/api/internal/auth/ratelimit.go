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
	var mu sync.Mutex
	buckets := map[string]*rateBucket{}
	return func(c *gin.Context) {
		ip := c.ClientIP()
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
