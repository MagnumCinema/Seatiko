package store

import (
	"errors"
	"time"

	"github.com/seatiko/api/internal/models"
	"golang.org/x/crypto/bcrypt"
)

// Guest account deletion (GDPR, BACKEND_TASKS №17). The user record stays as an
// anonymous stub so orders, receipts and the 18+ audit keep a stable user_id
// without personal data; the account can no longer sign in.

var (
	ErrWrongPassword = errors.New("wrong_password")
	// ErrAccountDeleted: the token belongs to a deleted account.
	ErrAccountDeleted = errors.New("account_deleted")
)

// DeletedAccount reports what was removed, for the response and for storage cleanup.
type DeletedAccount struct {
	CancelledReservations int
	// AvatarKey is the stored photo to delete from object storage, if any.
	AvatarKey string
}

func deletedEmail(userID string) string {
	short := userID
	if len(short) > 12 {
		short = short[:12]
	}
	return "deleted-" + short + "@deleted.invalid"
}

// DeleteAccount anonymises a guest after checking their password: profile fields are
// cleared, upcoming reservations and their preorders cancelled, waitlist entries and
// event requests stripped of contact data, notifications dropped.
func (s *MemoryStore) DeleteAccount(userID, password string) (DeletedAccount, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	user, ok := s.users[userID]
	if !ok || user.DeletedAt != nil {
		return DeletedAccount{}, ErrNotFound
	}
	if user.Role != models.RoleGuest {
		return DeletedAccount{}, ErrForbidden
	}
	if bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(password)) != nil {
		return DeletedAccount{}, ErrWrongPassword
	}

	now := time.Now().UTC()
	out := DeletedAccount{AvatarKey: user.AvatarKey}

	for id, r := range s.reservations {
		if r.UserID != userID {
			continue
		}
		r.Notes = ""
		if r.Status == models.ReservationConfirmed && r.ReservedFor.After(now.Add(-2*time.Hour)) {
			r.Status = models.ReservationCancelled
			r.UpdatedAt = now
			s.releaseReservationTablesLocked(r)
			s.cancelPreorderForReservationLocked(id, now)
			out.CancelledReservations++
		}
		s.reservations[id] = r
	}
	for id, w := range s.waitlist {
		if w.UserID != userID {
			continue
		}
		w.GuestName, w.Phone = "", ""
		if w.Status == models.WaitlistWaiting || w.Status == models.WaitlistReady {
			w.Status = models.WaitlistLeft
		}
		s.waitlist[id] = w
	}
	for id, q := range s.eventInquiries {
		if q.UserID == userID {
			q.ContactName, q.ContactPhone, q.Notes = "", "", ""
			s.eventInquiries[id] = q
		}
	}
	for id, w := range s.watches {
		if w.UserID == userID {
			delete(s.watches, id)
		}
	}
	kept := s.notifications[:0]
	for _, n := range s.notifications {
		if n.UserID != userID {
			kept = append(kept, n)
		}
	}
	s.notifications = kept

	s.users[userID] = models.User{
		ID:          userID,
		Email:       deletedEmail(userID),
		DisplayName: "",
		Locale:      user.Locale,
		Role:        user.Role,
		CreatedAt:   user.CreatedAt,
		UpdatedAt:   now,
		DeletedAt:   &now,
		// PasswordHash empty: no password matches, sign-in is impossible.
	}
	for venueID := range s.venues {
		s.refreshFreeTablesLocked(venueID)
	}
	s.persistBestEffortLocked()
	s.flushPushLocked()
	return out, nil
}

// releaseReservationTablesLocked frees tables still showing this reservation. Callers must hold s.mu.
func (s *MemoryStore) releaseReservationTablesLocked(r models.Reservation) {
	ids := append([]string{r.TableID}, r.TableIDs...)
	for _, tid := range ids {
		t, ok := s.tables[tid]
		if !ok || t.ReservationID == nil || *t.ReservationID != r.ID {
			continue
		}
		t.Status = models.TableFree
		t.ReservedFor = nil
		t.ReservationID = nil
		s.tables[tid] = t
	}
}

// ActiveUser fails for unknown or deleted accounts; the auth middleware uses it so
// tokens issued before deletion stop working.
func (s *MemoryStore) ActiveUser(userID string) error {
	s.mu.RLock()
	defer s.mu.RUnlock()
	u, ok := s.users[userID]
	if !ok {
		return ErrNotFound
	}
	if u.DeletedAt != nil {
		return ErrAccountDeleted
	}
	return nil
}
