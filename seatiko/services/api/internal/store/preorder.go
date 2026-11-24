package store

import (
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/seatiko/api/internal/models"
)

// Preorder: dishes a guest orders ahead for their reservation (APP_LOGIC §5.3, §7).
// It is an Order with Preorder=true and ReservationID set, so staff see it in the
// venue order list. Prices are fixed when the guest saves it. The guest can change
// or cancel it until KitchenAt (reserved_for − preorder_lead_min).

const (
	DefaultPreorderLeadMin = 30
	maxPreorderLines       = 30
	maxPreorderQty         = 20
)

var preorderLeadLimit = ruleLimit{0, 180}

var (
	ErrPreorderDisabled = errors.New("preorder_disabled")
	// ErrPreorderClosed: the reservation is not upcoming, or the kitchen already started.
	ErrPreorderClosed = errors.New("preorder_closed")
	// ErrAgeVerificationRequired: an 18+ item without adult_preorder_allowed.
	ErrAgeVerificationRequired = errors.New("age_verification_required")
	ErrItemUnavailable         = errors.New("item_unavailable")
	// ErrAgeCheckPending: an 18+ item of a preorder cannot be served before the in-person ID check.
	ErrAgeCheckPending = errors.New("age_check_pending")
)

func preorderLeadMinutes(v models.Venue) int {
	if v.PreorderLeadMin > 0 {
		return v.PreorderLeadMin
	}
	return DefaultPreorderLeadMin
}

func preorderKitchenAt(r models.Reservation, v models.Venue) time.Time {
	return r.ReservedFor.Add(-time.Duration(preorderLeadMinutes(v)) * time.Minute)
}

// activePreorderLocked returns the reservation's preorder that is not cancelled. Callers must hold s.mu.
func (s *MemoryStore) activePreorderLocked(reservationID string) (models.Order, bool) {
	for _, o := range s.orders {
		if o.Preorder && o.ReservationID == reservationID && o.Status != models.OrderCancelled {
			return o, true
		}
	}
	return models.Order{}, false
}

// decorateOrderLocked fills computed fields for reading. Callers must hold s.mu.
func (s *MemoryStore) decorateOrderLocked(o models.Order, now time.Time) models.Order {
	items := make([]models.OrderItem, len(o.Items))
	for i, it := range o.Items {
		mi, ok := s.menuItems[it.MenuItemID]
		it.Unavailable = !ok || mi.Stopped
		items[i] = it
	}
	o.Items = items
	if o.Preorder && o.Status == models.OrderSubmitted && o.KitchenAt != nil && !now.Before(*o.KitchenAt) {
		o.KitchenDue = true
	}
	if venue, ok := s.venues[o.VenueID]; ok {
		o.VenueName = venue.Name
	}
	return o
}

// preorderEditableLocked checks that the guest may still create, change or cancel
// the preorder of this reservation. Callers must hold s.mu.
func (s *MemoryStore) preorderEditableLocked(userID, reservationID string, now time.Time) (models.Reservation, models.Venue, error) {
	r, ok := s.reservations[reservationID]
	if !ok {
		return models.Reservation{}, models.Venue{}, ErrNotFound
	}
	if r.UserID != userID {
		return models.Reservation{}, models.Venue{}, ErrForbidden
	}
	venue := s.venues[r.VenueID]
	if r.Status != models.ReservationConfirmed || !now.Before(preorderKitchenAt(r, venue)) {
		return models.Reservation{}, models.Venue{}, ErrPreorderClosed
	}
	return r, venue, nil
}

// SavePreorder creates or replaces the guest's preorder for their reservation.
func (s *MemoryStore) SavePreorder(userID, reservationID string, items []OrderItemInput) (models.Order, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	now := time.Now().UTC()
	r, venue, err := s.preorderEditableLocked(userID, reservationID, now)
	if err != nil {
		return models.Order{}, err
	}
	if !venue.AllowPreorder {
		return models.Order{}, ErrPreorderDisabled
	}
	user := s.users[userID]

	// Merge repeated dishes, keep the guest's order of lines.
	qty := map[string]int{}
	order := make([]string, 0, len(items))
	for _, in := range items {
		if in.Qty < 1 || in.Qty > maxPreorderQty {
			return models.Order{}, ErrBadRequest
		}
		if _, seen := qty[in.MenuItemID]; !seen {
			order = append(order, in.MenuItemID)
		}
		qty[in.MenuItemID] += in.Qty
	}
	if len(order) == 0 || len(order) > maxPreorderLines {
		return models.Order{}, ErrBadRequest
	}

	lines := make([]models.OrderItem, 0, len(order))
	total := 0
	for _, id := range order {
		mi, ok := s.menuItems[id]
		if !ok || mi.VenueID != r.VenueID {
			return models.Order{}, ErrNotFound
		}
		if mi.Stopped {
			return models.Order{}, ErrItemUnavailable
		}
		adult := requiresAge18(mi)
		if adult && !user.AdultPreorderAllowed {
			return models.Order{}, ErrAgeVerificationRequired
		}
		if mi.ContainsAlcohol && !venue.AlcoholLicense {
			return models.Order{}, ErrItemUnavailable
		}
		n := min(qty[id], maxPreorderQty)
		line := models.OrderItem{
			MenuItemID: mi.ID, Name: mi.Name, Qty: n, Price: mi.Price,
			RequiresAge18: adult, ContainsAlcohol: mi.ContainsAlcohol,
		}
		if adult {
			line.AgeCheck = models.AgeCheckPending
		}
		lines = append(lines, line)
		total += mi.Price * n
	}

	kitchenAt := preorderKitchenAt(r, venue)
	o, exists := s.activePreorderLocked(reservationID)
	if !exists {
		o = models.Order{
			ID:            uuid.NewString(),
			UserID:        userID,
			VenueID:       r.VenueID,
			Preorder:      true,
			ReservationID: r.ID,
			Status:        models.OrderSubmitted,
			CheckNumber:   fmt.Sprintf("FA-%s-%04d", now.Format("20060102"), len(s.orders)+1),
			CreatedAt:     now,
		}
	}
	o.Items = lines
	o.Total = total
	o.KitchenAt = &kitchenAt
	o.AdultItemsRemovedAt = nil
	o.UpdatedAt = now
	s.orders[o.ID] = o
	kind := models.NotifyPreorderUpdated
	if !exists {
		kind = models.NotifyPreorderCreated
	}
	s.notifyLocked(kind, s.venueStaffRecipientsLocked(r.VenueID), r.VenueID, r.ID, o.ID, &r.ReservedFor)
	s.persistBestEffortLocked()
	s.flushPushLocked()
	return s.decorateOrderLocked(o, now), nil
}

// CancelPreorder cancels the guest's preorder before the kitchen starts it.
func (s *MemoryStore) CancelPreorder(userID, reservationID string) (models.Order, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	now := time.Now().UTC()
	if _, _, err := s.preorderEditableLocked(userID, reservationID, now); err != nil {
		return models.Order{}, err
	}
	o, ok := s.activePreorderLocked(reservationID)
	if !ok {
		return models.Order{}, ErrNotFound
	}
	o.Status = models.OrderCancelled
	o.UpdatedAt = now
	s.orders[o.ID] = o
	r := s.reservations[reservationID]
	s.notifyLocked(models.NotifyPreorderCancelled, s.venueStaffRecipientsLocked(o.VenueID), o.VenueID, reservationID, o.ID, &r.ReservedFor)
	s.persistBestEffortLocked()
	s.flushPushLocked()
	return s.decorateOrderLocked(o, now), nil
}

// GetPreorder returns the reservation's active preorder for its guest, or for staff,
// the owner of the venue or an admin.
func (s *MemoryStore) GetPreorder(userID, reservationID string) (models.Order, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	r, ok := s.reservations[reservationID]
	if !ok {
		return models.Order{}, ErrNotFound
	}
	if r.UserID != userID {
		if _, _, err := s.staffActorLocked(userID, r.VenueID); err != nil {
			return models.Order{}, ErrForbidden
		}
	}
	o, ok := s.activePreorderLocked(reservationID)
	if !ok {
		return models.Order{}, ErrNotFound
	}
	return s.decorateOrderLocked(o, time.Now().UTC()), nil
}

// cancelPreorderForReservationLocked cancels a preorder whose reservation was cancelled.
// Callers must hold s.mu.
func (s *MemoryStore) cancelPreorderForReservationLocked(reservationID string, now time.Time) {
	o, ok := s.activePreorderLocked(reservationID)
	if !ok || (o.Status != models.OrderSubmitted && o.Status != models.OrderDraft) {
		return
	}
	o.Status = models.OrderCancelled
	o.UpdatedAt = now
	s.orders[o.ID] = o
	r := s.reservations[reservationID]
	s.notifyLocked(models.NotifyPreorderCancelled, s.venueStaffRecipientsLocked(o.VenueID), o.VenueID, reservationID, o.ID, &r.ReservedFor)
}

// linkPreorderToSessionLocked attaches the reservation's preorder to the table session
// opened at check-in, so it shows up with the guest's other orders. Callers must hold s.mu.
func (s *MemoryStore) linkPreorderToSessionLocked(reservationID, sessionID string) {
	if o, ok := s.activePreorderLocked(reservationID); ok && o.SessionID == "" {
		o.SessionID = sessionID
		s.orders[o.ID] = o
	}
}

// dropAdultPreorderItemsLocked removes 18+ items from the guest's preorders that the
// kitchen has not started, after their 18+ permission was revoked. Callers must hold s.mu.
func (s *MemoryStore) dropAdultPreorderItemsLocked(userID string, now time.Time) {
	for id, o := range s.orders {
		if !o.Preorder || o.UserID != userID || o.Status != models.OrderSubmitted {
			continue
		}
		kept := make([]models.OrderItem, 0, len(o.Items))
		total := 0
		for _, it := range o.Items {
			if it.RequiresAge18 {
				continue
			}
			kept = append(kept, it)
			total += it.Price * it.Qty
		}
		if len(kept) == len(o.Items) {
			continue
		}
		o.Items, o.Total = kept, total
		o.AdultItemsRemovedAt = &now
		if len(kept) == 0 {
			o.Status = models.OrderCancelled
		}
		o.UpdatedAt = now
		s.orders[id] = o
		s.notifyLocked(models.NotifyPreorderAdultRemoved, []string{o.UserID}, o.VenueID, o.ReservationID, o.ID, nil)
		s.notifyLocked(models.NotifyPreorderUpdated, s.venueStaffRecipientsLocked(o.VenueID), o.VenueID, o.ReservationID, o.ID, nil)
	}
}

// StaffConfirmPreorderAgeCheck records the in-person ID check when serving 18+ items of a
// preorder. approved=false removes those items (they are not prepared or served).
func (s *MemoryStore) StaffConfirmPreorderAgeCheck(staffUserID, orderID string, idDocumentChecked, approved bool) (models.Order, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	o, ok := s.orders[orderID]
	if !ok || !o.Preorder {
		return models.Order{}, ErrNotFound
	}
	if _, _, err := s.staffActorLocked(staffUserID, o.VenueID); err != nil {
		return models.Order{}, err
	}
	if approved && !idDocumentChecked {
		return models.Order{}, ErrIDDocumentRequired
	}
	if o.Status == models.OrderCancelled || o.Status == models.OrderPaid {
		return models.Order{}, ErrConflict
	}
	now := time.Now().UTC()
	kept := make([]models.OrderItem, 0, len(o.Items))
	total := 0
	for _, it := range o.Items {
		if it.AgeCheck == models.AgeCheckPending {
			if !approved {
				continue
			}
			it.AgeCheck = models.AgeCheckConfirmed
		}
		kept = append(kept, it)
		total += it.Price * it.Qty
	}
	refused := len(kept) < len(o.Items)
	o.Items, o.Total = kept, total
	if len(kept) == 0 {
		o.Status = models.OrderCancelled
	}
	o.UpdatedAt = now
	s.orders[o.ID] = o
	if refused {
		s.notifyLocked(models.NotifyPreorderAgeRefused, []string{o.UserID}, o.VenueID, o.ReservationID, o.ID, nil)
	}
	s.persistBestEffortLocked()
	s.flushPushLocked()
	return s.decorateOrderLocked(o, now), nil
}

func hasPendingAgeCheck(o models.Order) bool {
	for _, it := range o.Items {
		if it.AgeCheck == models.AgeCheckPending {
			return true
		}
	}
	return false
}

// preorderViewLocked is the reservation's active preorder for listings, or nil. Callers must hold s.mu.
func (s *MemoryStore) preorderViewLocked(reservationID string) *models.Order {
	o, ok := s.activePreorderLocked(reservationID)
	if !ok {
		return nil
	}
	view := s.decorateOrderLocked(o, time.Now().UTC())
	return &view
}
