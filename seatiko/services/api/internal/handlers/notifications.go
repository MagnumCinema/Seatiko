package handlers

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
)

// ListNotifications: GET /me/notifications?unread=1&limit=50.
func (a *API) ListNotifications(c *gin.Context) {
	limit, _ := strconv.Atoi(c.Query("limit"))
	items, unread := a.Store.ListNotifications(a.userID(c), c.Query("unread") == "1", limit)
	c.JSON(http.StatusOK, gin.H{"notifications": items, "unread": unread})
}

type markReadReq struct {
	IDs []string `json:"ids"`
}

// MarkNotificationsRead: POST /me/notifications/read with ids, or no body for all.
func (a *API) MarkNotificationsRead(c *gin.Context) {
	var req markReadReq
	if c.Request.ContentLength > 0 {
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid_body"})
			return
		}
	}
	changed := a.Store.MarkNotificationsRead(a.userID(c), req.IDs)
	_, unread := a.Store.ListNotifications(a.userID(c), true, 1)
	c.JSON(http.StatusOK, gin.H{"marked": changed, "unread": unread})
}

// notificationHeartbeat keeps proxies from closing an idle stream.
const notificationHeartbeat = 25 * time.Second

// StreamNotifications: GET /me/notifications/stream, Server-Sent Events.
// Sends `ready` with the unread count, then one `notification` event per new message.
func (a *API) StreamNotifications(c *gin.Context) {
	userID := a.userID(c)
	feed, closeFeed := a.Store.SubscribeNotifications(userID)
	defer closeFeed()

	w := c.Writer
	h := w.Header()
	h.Set("Content-Type", "text/event-stream")
	h.Set("Cache-Control", "no-cache, no-transform")
	h.Set("Connection", "keep-alive")
	h.Set("X-Accel-Buffering", "no") // nginx: do not buffer the stream
	w.WriteHeader(http.StatusOK)

	_, unread := a.Store.ListNotifications(userID, true, 1)
	fmt.Fprintf(w, "event: ready\ndata: {\"unread\":%d}\n\n", unread)
	w.Flush()

	beat := time.NewTicker(notificationHeartbeat)
	defer beat.Stop()
	for {
		select {
		case <-c.Request.Context().Done():
			return
		case <-beat.C:
			fmt.Fprint(w, ": ping\n\n")
			w.Flush()
		case n := <-feed:
			data, err := json.Marshal(n)
			if err != nil {
				continue
			}
			fmt.Fprintf(w, "id: %s\nevent: notification\ndata: %s\n\n", n.ID, data)
			w.Flush()
		}
	}
}
