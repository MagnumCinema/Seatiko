package store

import (
	"errors"
	"sort"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/seatiko/api/internal/models"
)

// 18+ preorder permission (APP_LOGIC §8.4): staff grant it in person after checking
// an ID, tied to their own account; owners and admins can revoke it; every change
// is logged.

var (
	// ErrIDDocumentRequired: grant without "ID document checked" is not allowed.
	ErrIDDocumentRequired = errors.New("id_document_required")
	// ErrVisitRequired: the guest must be checked in at this venue right now or recently.
	ErrVisitRequired = errors.New("visit_required")
)

// adultGrantVisitWindow is how recent a check-in must be for staff to grant 18+.
const adultGrantVisitWindow = 12 * time.Hour

// AdultGrantInput is what staff confirm when granting 18+.
type AdultGrantInput struct {
	IDDocumentChecked bool
	IDDocumentType    string
}

func validIDDocumentType(t string) bool {
	switch t {
	case models.IDDocumentIDCard, models.IDDocumentPassport, models.IDDocumentOther:
		return true
	}
	return false
}

// requiresAge18 reports whether an item is 18+; alcohol always is.
func requiresAge18(item models.MenuItem) bool {
	return item.RequiresAge18 || item.ContainsAlcohol
}

// normalizeAgeRestriction keeps the invariant contains_alcohol ⇒ requires_age_18.
func normalizeAgeRestriction(item models.MenuItem) models.MenuItem {
	item.RequiresAge18 = requiresAge18(item)
	return item
}

// staffActorLocked returns how userID acts at venueID: their 18+ role and display name.
// Callers must hold s.mu.
func (s *MemoryStore) staffActorLocked(userID, venueID string) (models.User, string, error) {
	user, ok := s.users[userID]
	if !ok {
		return models.User{}, "", ErrNotFound
	}
	switch {
	case user.Role == models.RoleAdmin:
		return user, models.AdultStaffRoleAdmin, nil
	case user.Role == models.RoleRestaurant && s.ownerCanManageVenueLocked(userID, venueID):
		return user, models.AdultStaffRoleManager, nil
	}
	for _, member := range s.staffMembers {
		if member.VenueID == venueID && member.Status == models.StaffStatusActive &&
			(member.UserID == userID || strings.EqualFold(member.Email, user.Email)) {
			return user, models.AdultStaffRoleWaiter, nil
		}
	}
	return models.User{}, "", ErrForbidden
}

func staffDisplayName(u models.User) string {
	if name := strings.TrimSpace(u.DisplayName); name != "" {
		return name
	}
	if name := strings.TrimSpace(u.FirstName + " " + u.LastName); name != "" {
		return name
	}
	return u.Email
}

// GrantAdultPreorder lets staff of the reservation's venue confirm the guest is 18+
// after checking an ID in person. The reservation must be checked in and recent.
func (s *MemoryStore) GrantAdultPreorder(staffUserID, reservationID string, input AdultGrantInput) (models.User, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	reservation, ok := s.reservations[reservationID]
	if !ok {
		return models.User{}, ErrNotFound
	}
	staff, role, err := s.staffActorLocked(staffUserID, reservation.VenueID)
	if err != nil {
		return models.User{}, err
	}
	if !input.IDDocumentChecked {
		return models.User{}, ErrIDDocumentRequired
	}
	if !validIDDocumentType(input.IDDocumentType) {
		return models.User{}, ErrBadRequest
	}
	guest, ok := s.users[reservation.UserID]
	if !ok {
		return models.User{}, ErrNotFound
	}
	if guest.ID == staff.ID {
		return models.User{}, ErrForbidden
	}
	now := time.Now().UTC()
	if reservation.Status != models.ReservationCheckedIn || reservation.ReservedFor.Before(now.Add(-adultGrantVisitWindow)) {
		return models.User{}, ErrVisitRequired
	}

	name := staffDisplayName(staff)
	guest.AdultPreorderAllowed = true
	guest.AdultVerification = &models.AdultVerification{
		VerifiedAt:        now,
		StaffID:           staff.ID,
		StaffRole:         role,
		StaffDisplayName:  name,
		VenueID:           reservation.VenueID,
		IDDocumentChecked: true,
		IDDocumentType:    input.IDDocumentType,
	}
	guest.UpdatedAt = now
	s.users[guest.ID] = guest
	s.adultLog = append(s.adultLog, models.AdultPermissionLogEntry{
		ID:                uuid.NewString(),
		UserID:            guest.ID,
		Action:            models.AdultActionGrant,
		StaffID:           staff.ID,
		StaffRole:         role,
		StaffDisplayName:  name,
		VenueID:           reservation.VenueID,
		ReservationID:     reservation.ID,
		IDDocumentChecked: true,
		IDDocumentType:    input.IDDocumentType,
		CreatedAt:         now,
	})
	s.notifyLocked(models.NotifyAdultGranted, []string{guest.ID}, reservation.VenueID, reservation.ID, "", nil)
	s.persistBestEffortLocked()
	s.flushPushLocked()
	return guest, nil
}

// RevokeAdultPreorder withdraws the 18+ preorder permission. Only the venue owner
// (manager) or a platform admin may revoke, and the guest must have a reservation there.
func (s *MemoryStore) RevokeAdultPreorder(staffUserID, venueID, guestUserID, reason string) (models.User, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if _, ok := s.venues[venueID]; !ok {
		return models.User{}, ErrNotFound
	}
	staff, role, err := s.staffActorLocked(staffUserID, venueID)
	if err != nil {
		return models.User{}, err
	}
	if role == models.AdultStaffRoleWaiter {
		return models.User{}, ErrForbidden
	}
	guest, ok := s.users[guestUserID]
	if !ok {
		return models.User{}, ErrNotFound
	}
	if role != models.AdultStaffRoleAdmin && !s.guestVisitedVenueLocked(guestUserID, venueID) {
		return models.User{}, ErrNotFound
	}
	if !guest.AdultPreorderAllowed {
		return guest, nil
	}

	now := time.Now().UTC()
	guest.AdultPreorderAllowed = false
	if guest.AdultVerification != nil {
		v := *guest.AdultVerification
		v.RevokedAt = &now
		v.RevokedByStaffID = staff.ID
		guest.AdultVerification = &v
	}
	guest.UpdatedAt = now
	s.users[guest.ID] = guest
	s.dropAdultPreorderItemsLocked(guest.ID, now)
	s.adultLog = append(s.adultLog, models.AdultPermissionLogEntry{
		ID:               uuid.NewString(),
		UserID:           guest.ID,
		Action:           models.AdultActionRevoke,
		StaffID:          staff.ID,
		StaffRole:        role,
		StaffDisplayName: staffDisplayName(staff),
		VenueID:          venueID,
		Reason:           strings.TrimSpace(reason),
		CreatedAt:        now,
	})
	s.notifyLocked(models.NotifyAdultRevoked, []string{guest.ID}, venueID, "", "", nil)
	s.persistBestEffortLocked()
	s.flushPushLocked()
	return guest, nil
}

// guestVisitedVenueLocked: the guest has any reservation at the venue. Callers must hold s.mu.
func (s *MemoryStore) guestVisitedVenueLocked(userID, venueID string) bool {
	for _, r := range s.reservations {
		if r.UserID == userID && r.VenueID == venueID {
			return true
		}
	}
	return false
}

// ListAdultPermissionLog returns the 18+ audit, newest first; userID "" = everyone.
func (s *MemoryStore) ListAdultPermissionLog(userID string) []models.AdultPermissionLogEntry {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := make([]models.AdultPermissionLogEntry, 0)
	for _, entry := range s.adultLog {
		if userID == "" || entry.UserID == userID {
			out = append(out, entry)
		}
	}
	sort.SliceStable(out, func(i, j int) bool { return out[i].CreatedAt.After(out[j].CreatedAt) })
	return out
}

// PreorderMenu is the venue menu for preordering to a booking as this guest:
// requires_age_18 items are not orderable without adult_preorder_allowed.
func (s *MemoryStore) PreorderMenu(userID, venueID string) ([]models.PreorderMenuItem, error) {
	items, err := s.ListMenu(venueID)
	if err != nil {
		return nil, err
	}
	s.mu.RLock()
	user, ok := s.users[userID]
	s.mu.RUnlock()
	if !ok {
		return nil, ErrNotFound
	}
	out := make([]models.PreorderMenuItem, 0, len(items))
	for _, item := range items {
		entry := models.PreorderMenuItem{MenuItem: item, Orderable: true}
		switch {
		case item.Stopped:
			entry.Orderable, entry.BlockedReason = false, "stopped"
		case requiresAge18(item) && !user.AdultPreorderAllowed:
			entry.Orderable, entry.BlockedReason = false, "age_verification_required"
		}
		out = append(out, entry)
	}
	return out, nil
}

// CanPreorderItem reports whether the guest may add the item to a preorder.
// The preorder API (BACKEND_TASKS №1) must check every item with it.
func (s *MemoryStore) CanPreorderItem(userID, itemID string) error {
	s.mu.RLock()
	defer s.mu.RUnlock()
	item, ok := s.menuItems[itemID]
	if !ok {
		return ErrNotFound
	}
	user, ok := s.users[userID]
	if !ok {
		return ErrNotFound
	}
	if item.Stopped {
		return ErrConflict
	}
	if requiresAge18(item) && !user.AdultPreorderAllowed {
		return ErrForbidden
	}
	return nil
}
