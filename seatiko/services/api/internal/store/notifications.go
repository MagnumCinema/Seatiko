package store

import (
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/seatiko/api/internal/models"
)

// In-app notifications (APP_LOGIC §13): stored per recipient, listed by
// GET /me/notifications and pushed live to open SSE streams.

const maxNotificationsPerUser = 200

// notificationHub fans new notifications out to open streams. It has its own lock
// so publishing never waits on s.mu.
type notificationHub struct {
	mu   sync.Mutex
	subs map[string]map[chan models.Notification]struct{}
}

func (h *notificationHub) subscribe(userID string) chan models.Notification {
	h.mu.Lock()
	defer h.mu.Unlock()
	if h.subs == nil {
		h.subs = map[string]map[chan models.Notification]struct{}{}
	}
	ch := make(chan models.Notification, 16)
	if h.subs[userID] == nil {
		h.subs[userID] = map[chan models.Notification]struct{}{}
	}
	h.subs[userID][ch] = struct{}{}
	return ch
}

func (h *notificationHub) unsubscribe(userID string, ch chan models.Notification) {
	h.mu.Lock()
	defer h.mu.Unlock()
	delete(h.subs[userID], ch)
	if len(h.subs[userID]) == 0 {
		delete(h.subs, userID)
	}
}

func (h *notificationHub) publish(n models.Notification) {
	h.mu.Lock()
	defer h.mu.Unlock()
	for ch := range h.subs[n.UserID] {
		select {
		case ch <- n:
		default: // slow client: it will catch up from the list
		}
	}
}

// SubscribeNotifications opens a live feed for the user; call the returned func to close it.
func (s *MemoryStore) SubscribeNotifications(userID string) (<-chan models.Notification, func()) {
	ch := s.hub.subscribe(userID)
	return ch, func() { s.hub.unsubscribe(userID, ch) }
}

// notifyLocked stores a notification for each recipient and queues it for live
// delivery once s.mu is released. Callers must hold s.mu (write).
func (s *MemoryStore) notifyLocked(kind string, recipients []string, venueID, reservationID, orderID string, at *time.Time) {
	now := time.Now().UTC()
	seen := map[string]bool{}
	for _, userID := range recipients {
		if userID == "" || seen[userID] {
			continue
		}
		seen[userID] = true
		n := models.Notification{
			ID: uuid.NewString(), UserID: userID, Kind: kind, VenueID: venueID,
			ReservationID: reservationID, OrderID: orderID, At: at, CreatedAt: now,
		}
		if v, ok := s.venues[venueID]; ok {
			n.VenueName = v.Name
		}
		s.notifications = append(s.notifications, n)
		s.pendingPush = append(s.pendingPush, n)
	}
	s.trimNotificationsLocked()
}

// flushPushLocked hands queued notifications to the hub. Callers hold s.mu; the hub
// has its own lock and never blocks.
func (s *MemoryStore) flushPushLocked() {
	for _, n := range s.pendingPush {
		s.hub.publish(n)
	}
	s.pendingPush = nil
}

func (s *MemoryStore) trimNotificationsLocked() {
	count := map[string]int{}
	for _, n := range s.notifications {
		count[n.UserID]++
	}
	over := false
	for _, c := range count {
		over = over || c > maxNotificationsPerUser
	}
	if !over {
		return
	}
	kept := make([]models.Notification, 0, len(s.notifications))
	// Keep the newest maxNotificationsPerUser per user (slice is in creation order).
	for i := len(s.notifications) - 1; i >= 0; i-- {
		n := s.notifications[i]
		if count[n.UserID] > maxNotificationsPerUser {
			count[n.UserID]--
			continue
		}
		kept = append(kept, n)
	}
	for i, j := 0, len(kept)-1; i < j; i, j = i+1, j-1 {
		kept[i], kept[j] = kept[j], kept[i]
	}
	s.notifications = kept
}

// venueStaffRecipientsLocked: owners and active staff of the venue. Callers must hold s.mu.
func (s *MemoryStore) venueStaffRecipientsLocked(venueID string) []string {
	out := []string{}
	for _, app := range s.applications {
		if app.VenueID != nil && *app.VenueID == venueID && app.Status == models.AppPublished {
			out = append(out, app.OwnerUserID)
		}
	}
	for _, m := range s.staffMembers {
		if m.VenueID != venueID || m.Status != models.StaffStatusActive {
			continue
		}
		if m.UserID != "" {
			out = append(out, m.UserID)
			continue
		}
		for _, u := range s.users {
			if strings.EqualFold(u.Email, m.Email) {
				out = append(out, u.ID)
			}
		}
	}
	return out
}

// ListNotifications returns the user's notifications, newest first, and the unread count.
func (s *MemoryStore) ListNotifications(userID string, unreadOnly bool, limit int) ([]models.Notification, int) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	if limit <= 0 || limit > maxNotificationsPerUser {
		limit = 50
	}
	out := make([]models.Notification, 0)
	unread := 0
	// Newest first: walk the creation-ordered slice backwards (stable for equal timestamps).
	for i := len(s.notifications) - 1; i >= 0; i-- {
		n := s.notifications[i]
		if n.UserID != userID {
			continue
		}
		if n.ReadAt == nil {
			unread++
		}
		if unreadOnly && n.ReadAt != nil {
			continue
		}
		out = append(out, n)
	}
	sort.SliceStable(out, func(i, j int) bool { return out[i].CreatedAt.After(out[j].CreatedAt) })
	if len(out) > limit {
		out = out[:limit]
	}
	return out, unread
}

// MarkNotificationsRead marks the given notifications (or all when ids is empty) as read.
func (s *MemoryStore) MarkNotificationsRead(userID string, ids []string) int {
	s.mu.Lock()
	defer s.mu.Unlock()
	want := map[string]bool{}
	for _, id := range ids {
		want[id] = true
	}
	now := time.Now().UTC()
	changed := 0
	for i, n := range s.notifications {
		if n.UserID != userID || n.ReadAt != nil || (len(want) > 0 && !want[n.ID]) {
			continue
		}
		s.notifications[i].ReadAt = &now
		changed++
	}
	if changed > 0 {
		s.persistBestEffortLocked()
	}
	return changed
}

// StartPreorderKitchen moves submitted preorders whose kitchen time has come to
// PREPARING and tells the kitchen and the guest (APP_LOGIC §7). Run it periodically.
func (s *MemoryStore) StartPreorderKitchen(now time.Time) int {
	s.mu.Lock()
	defer s.mu.Unlock()
	started := 0
	for id, o := range s.orders {
		if !o.Preorder || o.Status != models.OrderSubmitted || o.KitchenAt == nil || now.Before(*o.KitchenAt) {
			continue
		}
		if r, ok := s.reservations[o.ReservationID]; !ok || (r.Status != models.ReservationConfirmed && r.Status != models.ReservationCheckedIn) {
			continue
		}
		o.Status = models.OrderPreparing
		o.UpdatedAt = now.UTC()
		s.orders[id] = o
		at := s.reservations[o.ReservationID].ReservedFor
		recipients := append(s.venueStaffRecipientsLocked(o.VenueID), o.UserID)
		s.notifyLocked(models.NotifyPreorderPreparing, recipients, o.VenueID, o.ReservationID, o.ID, &at)
		started++
	}
	if started > 0 {
		s.persistBestEffortLocked()
		s.flushPushLocked()
	}
	return started
}
