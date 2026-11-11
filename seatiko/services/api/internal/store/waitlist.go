package store

import (
	"sort"
	"strings"
	"time"

	"github.com/seatiko/api/internal/models"
	"github.com/google/uuid"
)

// defaultTurnMinutes is the fallback table turn time used to quote waits when a
// venue has no explicit hold configured.
const defaultTurnMinutes = 20

type WaitlistInput struct {
	VenueID   string `json:"venue_id"`
	GuestName string `json:"guest_name"`
	Phone     string `json:"phone"`
	Guests    int    `json:"guests"`
	Zone      string `json:"zone"`
	Note      string `json:"note"`
	Source    string `json:"source"`
}

func (s *MemoryStore) turnMinutesLocked(venueID string) int {
	venue, ok := s.venues[venueID]
	if ok && venue.HoldMinutes > 0 {
		return venue.HoldMinutes
	}
	return defaultTurnMinutes
}

// waitingSortedLocked returns the venue's active queue ordered by join time.
func (s *MemoryStore) waitingSortedLocked(venueID string) []models.WaitlistEntry {
	out := make([]models.WaitlistEntry, 0)
	for _, entry := range s.waitlist {
		if entry.VenueID != venueID {
			continue
		}
		if entry.Status != models.WaitlistWaiting {
			continue
		}
		out = append(out, entry)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].CreatedAt.Before(out[j].CreatedAt) })
	return out
}

func (s *MemoryStore) freeTableCountLocked(venueID string) int {
	free := 0
	for _, table := range s.tables {
		if table.VenueID == venueID && table.Status == models.TableFree {
			free++
		}
	}
	return free
}

// enrichWaitlistLocked fills position, quoted wait and display names.
func (s *MemoryStore) enrichWaitlistLocked(entry models.WaitlistEntry) models.WaitlistEntry {
	if venue, ok := s.venues[entry.VenueID]; ok {
		entry.VenueName = venue.Name
	}
	if entry.TableID != "" {
		if table, ok := s.tables[entry.TableID]; ok {
			entry.TableNumber = table.Number
		}
	}
	if entry.Status != models.WaitlistWaiting {
		return entry
	}
	queue := s.waitingSortedLocked(entry.VenueID)
	for idx, waiting := range queue {
		if waiting.ID != entry.ID {
			continue
		}
		entry.Position = idx + 1
		ahead := idx - s.freeTableCountLocked(entry.VenueID)
		if ahead < 0 {
			ahead = 0
		}
		entry.QuotedWait = ahead * s.turnMinutesLocked(entry.VenueID)
		break
	}
	return entry
}

func (s *MemoryStore) JoinWaitlist(userID string, input WaitlistInput) (models.WaitlistEntry, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	defer s.persistBestEffortLocked()

	if _, ok := s.venues[input.VenueID]; !ok {
		return models.WaitlistEntry{}, ErrNotFound
	}
	guests := input.Guests
	if guests <= 0 {
		guests = 2
	}
	if guests > 30 {
		return models.WaitlistEntry{}, ErrBadRequest
	}

	name := strings.TrimSpace(input.GuestName)
	if userID != "" {
		if user, ok := s.users[userID]; ok {
			for _, entry := range s.waitlist {
				if entry.UserID == userID && entry.VenueID == input.VenueID &&
					(entry.Status == models.WaitlistWaiting || entry.Status == models.WaitlistReady) {
					return models.WaitlistEntry{}, ErrConflict
				}
			}
			if name == "" {
				name = strings.TrimSpace(user.FirstName + " " + user.LastName)
			}
			if name == "" {
				name = user.Email
			}
		} else {
			return models.WaitlistEntry{}, ErrNotFound
		}
	}
	if name == "" {
		return models.WaitlistEntry{}, ErrBadRequest
	}

	source := strings.ToUpper(strings.TrimSpace(input.Source))
	switch source {
	case models.WaitlistSourceWeb, models.WaitlistSourceAndroid, models.WaitlistSourceIOS, models.WaitlistSourceHost:
	default:
		source = models.WaitlistSourceWeb
	}

	entry := models.WaitlistEntry{
		ID:        uuid.NewString(),
		VenueID:   input.VenueID,
		UserID:    userID,
		GuestName: name,
		Phone:     strings.TrimSpace(input.Phone),
		Guests:    guests,
		Zone:      normalizeZone(input.Zone),
		Note:      strings.TrimSpace(input.Note),
		Status:    models.WaitlistWaiting,
		Source:    source,
		CreatedAt: time.Now().UTC(),
	}
	s.waitlist[entry.ID] = entry
	return s.enrichWaitlistLocked(entry), nil
}

func (s *MemoryStore) ListMyWaitlist(userID string) []models.WaitlistEntry {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := make([]models.WaitlistEntry, 0)
	for _, entry := range s.waitlist {
		if entry.UserID != userID {
			continue
		}
		out = append(out, s.enrichWaitlistLocked(entry))
	}
	sort.Slice(out, func(i, j int) bool { return out[i].CreatedAt.After(out[j].CreatedAt) })
	return out
}

func (s *MemoryStore) LeaveWaitlist(userID, entryID string) (models.WaitlistEntry, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	defer s.persistBestEffortLocked()

	entry, ok := s.waitlist[entryID]
	if !ok {
		return models.WaitlistEntry{}, ErrNotFound
	}
	if entry.UserID != userID {
		return models.WaitlistEntry{}, ErrForbidden
	}
	if entry.Status == models.WaitlistSeated {
		return models.WaitlistEntry{}, ErrConflict
	}
	now := time.Now().UTC()
	entry.Status = models.WaitlistLeft
	entry.ClosedAt = &now
	s.waitlist[entryID] = entry
	return s.enrichWaitlistLocked(entry), nil
}

func (s *MemoryStore) WaitlistSummary(venueID string) (models.WaitlistSummary, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	if _, ok := s.venues[venueID]; !ok {
		return models.WaitlistSummary{}, ErrNotFound
	}
	queue := s.waitingSortedLocked(venueID)
	free := s.freeTableCountLocked(venueID)
	ahead := len(queue) - free
	if ahead < 0 {
		ahead = 0
	}
	return models.WaitlistSummary{
		VenueID:    venueID,
		Waiting:    len(queue),
		QuotedWait: ahead * s.turnMinutesLocked(venueID),
		FreeTables: free,
	}, nil
}

func (s *MemoryStore) GetWaitlistEntry(id string) (models.WaitlistEntry, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	entry, ok := s.waitlist[id]
	if !ok {
		return models.WaitlistEntry{}, ErrNotFound
	}
	return s.enrichWaitlistLocked(entry), nil
}

// ListVenueWaitlist returns the host-stand view: active queue first, then the
// recently closed entries so staff can undo mistakes.
func (s *MemoryStore) ListVenueWaitlist(venueID string) ([]models.WaitlistEntry, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	if _, ok := s.venues[venueID]; !ok {
		return nil, ErrNotFound
	}
	out := make([]models.WaitlistEntry, 0)
	cutoff := time.Now().UTC().Add(-6 * time.Hour)
	for _, entry := range s.waitlist {
		if entry.VenueID != venueID {
			continue
		}
		active := entry.Status == models.WaitlistWaiting || entry.Status == models.WaitlistReady
		if !active && entry.CreatedAt.Before(cutoff) {
			continue
		}
		out = append(out, s.enrichWaitlistLocked(entry))
	}
	sort.Slice(out, func(i, j int) bool {
		ai, bi := waitlistOrder(out[i].Status), waitlistOrder(out[j].Status)
		if ai != bi {
			return ai < bi
		}
		return out[i].CreatedAt.Before(out[j].CreatedAt)
	})
	return out, nil
}

func waitlistOrder(status models.WaitlistStatus) int {
	switch status {
	case models.WaitlistReady:
		return 0
	case models.WaitlistWaiting:
		return 1
	default:
		return 2
	}
}

// NotifyWaitlistEntry marks a guest as "table ready" and holds the table so the
// floor plan stops offering it to others.
func (s *MemoryStore) NotifyWaitlistEntry(entryID, tableID string) (models.WaitlistEntry, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	defer s.persistBestEffortLocked()

	entry, ok := s.waitlist[entryID]
	if !ok {
		return models.WaitlistEntry{}, ErrNotFound
	}
	if entry.Status != models.WaitlistWaiting {
		return models.WaitlistEntry{}, ErrConflict
	}
	if tableID != "" {
		table, ok := s.tables[tableID]
		if !ok || table.VenueID != entry.VenueID {
			return models.WaitlistEntry{}, ErrNotFound
		}
		if table.Status != models.TableFree {
			return models.WaitlistEntry{}, ErrTableNotFree
		}
		table.Status = models.TableReserved
		s.tables[tableID] = table
		s.refreshFreeTablesLocked(entry.VenueID)
		entry.TableID = tableID
	}
	now := time.Now().UTC()
	entry.Status = models.WaitlistReady
	entry.NotifiedAt = &now
	s.waitlist[entryID] = entry
	return s.enrichWaitlistLocked(entry), nil
}

// SeatWaitlistEntry seats the guest and occupies the table.
func (s *MemoryStore) SeatWaitlistEntry(entryID, tableID string) (models.WaitlistEntry, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	defer s.persistBestEffortLocked()

	entry, ok := s.waitlist[entryID]
	if !ok {
		return models.WaitlistEntry{}, ErrNotFound
	}
	if entry.Status == models.WaitlistSeated {
		return models.WaitlistEntry{}, ErrConflict
	}
	if tableID == "" {
		tableID = entry.TableID
	}
	if tableID == "" {
		return models.WaitlistEntry{}, ErrBadRequest
	}
	table, ok := s.tables[tableID]
	if !ok || table.VenueID != entry.VenueID {
		return models.WaitlistEntry{}, ErrNotFound
	}
	if table.Status == models.TableOccupied {
		return models.WaitlistEntry{}, ErrTableNotFree
	}
	// A table reserved through a real booking may only be seated by the guest
	// who holds it; our own waitlist hold has no reservation attached.
	if table.Status == models.TableReserved && table.ReservationID != nil {
		return models.WaitlistEntry{}, ErrTableNotFree
	}
	now := time.Now().UTC()
	table.Status = models.TableOccupied
	table.OccupiedSince = &now
	s.tables[tableID] = table
	s.refreshFreeTablesLocked(entry.VenueID)

	entry.TableID = tableID
	entry.Status = models.WaitlistSeated
	entry.SeatedAt = &now
	entry.ClosedAt = &now
	s.waitlist[entryID] = entry
	return s.enrichWaitlistLocked(entry), nil
}

// CloseWaitlistEntry drops a guest from the queue (left or expired) and frees a
// table that was held for them.
func (s *MemoryStore) CloseWaitlistEntry(entryID string, status models.WaitlistStatus) (models.WaitlistEntry, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	defer s.persistBestEffortLocked()

	entry, ok := s.waitlist[entryID]
	if !ok {
		return models.WaitlistEntry{}, ErrNotFound
	}
	switch status {
	case models.WaitlistLeft, models.WaitlistExpired:
	default:
		return models.WaitlistEntry{}, ErrInvalidStatus
	}
	if entry.Status == models.WaitlistSeated {
		return models.WaitlistEntry{}, ErrConflict
	}
	if entry.TableID != "" {
		if table, ok := s.tables[entry.TableID]; ok && table.Status == models.TableReserved {
			table.Status = models.TableFree
			s.tables[entry.TableID] = table
			s.refreshFreeTablesLocked(entry.VenueID)
		}
		entry.TableID = ""
	}
	now := time.Now().UTC()
	entry.Status = status
	entry.ClosedAt = &now
	s.waitlist[entryID] = entry
	return s.enrichWaitlistLocked(entry), nil
}
