package store

import (
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/seatiko/api/internal/models"
	"github.com/seatiko/api/internal/places"
)

type persistedState struct {
	Cities         map[string]models.City                  `json:"cities"`
	Venues         map[string]models.Venue                 `json:"venues"`
	Tables         map[string]models.Table                 `json:"tables"`
	Users          map[string]persistedUser                `json:"users"`
	Reservations   map[string]models.Reservation           `json:"reservations"`
	Watches        map[string]models.TableWatch            `json:"watches"`
	Sessions       map[string]models.Session               `json:"sessions"`
	MenuItems      map[string]models.MenuItem              `json:"menu_items"`
	Orders         map[string]models.Order                 `json:"orders"`
	WaiterCalls    map[string]models.WaiterCall            `json:"waiter_calls"`
	Collections    map[string]models.HolidayCollection     `json:"collections"`
	Applications   map[string]models.VenueApplication      `json:"applications"`
	Activities     map[string][]models.ApplicationActivity `json:"activities"`
	StaffMembers   map[string]models.StaffMember           `json:"staff_members"`
	WorkShifts     map[string]models.WorkShift             `json:"work_shifts"`
	ProfileChanges map[string]models.ProfileChangeRequest  `json:"profile_changes"`
	Waitlist       map[string]models.WaitlistEntry         `json:"waitlist"`
	AdultLog       []models.AdultPermissionLogEntry        `json:"adult_permission_log,omitempty"`
	Notifications  []models.Notification                   `json:"notifications,omitempty"`
	DemoMenuVer    int                                     `json:"demo_menu_version"`
	DemoSeedVer    int                                     `json:"demo_seed_version"`
}

type persistedUser struct {
	models.User
	PasswordHash string `json:"password_hash"`
	AvatarKey    string `json:"avatar_key,omitempty"`
}

// NewPersistent creates the same store used by the API, but keeps all mutable
// state in an atomic JSON snapshot. This removes the previous data-loss window
// on container restarts while keeping the prototype storage simple.
func NewPersistent(path string) (*MemoryStore, error) {
	s := NewMemory()
	s.dataFile = path

	data, err := os.ReadFile(path)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			if err := s.persist(); err != nil {
				return nil, err
			}
			return s, nil
		}
		return nil, fmt.Errorf("read state: %w", err)
	}

	var state persistedState
	if err := json.Unmarshal(data, &state); err != nil {
		return nil, fmt.Errorf("decode state: %w", err)
	}
	s.applyState(state)
	s.backfillVenueMediaLocked()
	s.ensureDemoUsersLocked()
	s.ensureDemoFloorExamplesLocked()
	s.ensureDemoMenuLocked()
	s.ensureExtendedDemoSeedLocked()
	s.releaseStaleReservedTablesLocked()
	return s, nil
}

// ensureDemoMenuLocked brings the seeded demo menu into snapshots saved with an
// older demo menu version. It runs once per version: dishes an owner deletes
// afterwards stay deleted, and the stop-list flag of seeded dishes is kept.
func (s *MemoryStore) ensureDemoMenuLocked() {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.demoMenuVer >= demoMenuVersion {
		return
	}
	for _, fresh := range demoMenu() {
		if _, ok := s.venues[fresh.VenueID]; !ok {
			continue
		}
		if current, ok := s.menuItems[fresh.ID]; ok {
			if current.VenueID != fresh.VenueID {
				continue
			}
			fresh.Stopped = current.Stopped
		}
		s.menuItems[fresh.ID] = fresh
	}
	s.demoMenuVer = demoMenuVersion
	s.persistBestEffortLocked()
}

// releaseStaleReservedTablesLocked frees tables still marked RESERVED for a booking
// that ended long ago (nobody released them), so the floor shows the real state.
// The reservation itself stays in history untouched.
func (s *MemoryStore) releaseStaleReservedTablesLocked() {
	s.mu.Lock()
	defer s.mu.Unlock()
	changed := map[string]bool{}
	for id, t := range s.tables {
		if t.Status != models.TableReserved || !staleDemoTime(t.ReservedFor) {
			continue
		}
		t.Status = models.TableFree
		t.ReservedFor = nil
		t.ReservationID = nil
		s.tables[id] = t
		changed[t.VenueID] = true
	}
	if len(changed) == 0 {
		return
	}
	for venueID := range changed {
		s.refreshFreeTablesLocked(venueID)
	}
	s.persistBestEffortLocked()
}

// backfillVenueMediaLocked fills demo photos/reviews for seeded venues that
// were persisted before those fields existed.
func (s *MemoryStore) backfillVenueMediaLocked() {
	s.mu.Lock()
	defer s.mu.Unlock()
	changed := s.dropLegacyPlacesPhotosLocked()
	demo := NewMemory()
	if s.backfillVenueGeoLocked(demo.venues) {
		changed = true
	}
	for id, fresh := range demo.venues {
		current, ok := s.venues[id]
		if !ok {
			continue
		}
		if len(current.PhotoURLs) == 0 && len(fresh.PhotoURLs) > 0 {
			current.PhotoURLs = append([]string(nil), fresh.PhotoURLs...)
			current.ImageURL = fresh.ImageURL
			changed = true
		}
		if current.HoursText == "" && fresh.HoursText != "" {
			current.HoursText = fresh.HoursText
			changed = true
		}
		if len(current.Reviews) == 0 && len(fresh.Reviews) > 0 {
			current.Reviews = append([]models.VenueReview(nil), fresh.Reviews...)
			current.ReviewCount = fresh.ReviewCount
			if current.Rating == 0 {
				current.Rating = fresh.Rating
			}
			changed = true
		}
		s.venues[id] = current
	}
	if changed {
		s.persistBestEffortLocked()
	}
}

// dropLegacyPlacesPhotosLocked removes direct Places media URLs (they embed the
// Google API key and break when photo billing is off).
func (s *MemoryStore) dropLegacyPlacesPhotosLocked() bool {
	changed := false
	for id, v := range s.venues {
		kept := make([]string, 0, len(v.PhotoURLs))
		for _, u := range v.PhotoURLs {
			if !places.IsLegacyPhotoURL(u) {
				kept = append(kept, u)
			}
		}
		legacyCover := places.IsLegacyPhotoURL(v.ImageURL)
		if len(kept) == len(v.PhotoURLs) && !legacyCover {
			continue
		}
		v.PhotoURLs = kept
		if legacyCover {
			v.ImageURL = ""
			if len(kept) > 0 {
				v.ImageURL = kept[0]
			}
		}
		s.venues[id] = v
		changed = true
	}
	return changed
}

// ensureDemoUsersLocked adds and verifies development demo accounts and applications.
func (s *MemoryStore) ensureDemoUsersLocked() {
	s.mu.Lock()
	defer s.mu.Unlock()

	demo := NewMemory()
	changed := false
	for id, demoUser := range demo.users {
		existing, exists := s.users[id]
		if !exists {
			found := false
			for eid, u := range s.users {
				if strings.EqualFold(u.Email, demoUser.Email) {
					u.PasswordHash = demoUser.PasswordHash
					u.Role = demoUser.Role
					s.users[eid] = u
					changed = true
					found = true
					log.Printf("repaired demo user credentials for %s (%s)", u.Email, u.Role)
					break
				}
			}
			if !found {
				s.users[id] = demoUser
				changed = true
				log.Printf("seeded missing demo user %s (%s)", demoUser.Email, demoUser.Role)
			}
		} else {
			if existing.PasswordHash != demoUser.PasswordHash || existing.Role != demoUser.Role {
				existing.PasswordHash = demoUser.PasswordHash
				existing.Role = demoUser.Role
				s.users[id] = existing
				changed = true
				log.Printf("synchronized demo user credentials for %s (%s)", existing.Email, existing.Role)
			}
		}
	}

	for appID, app := range demo.applications {
		if _, exists := s.applications[appID]; !exists {
			s.applications[appID] = app
			changed = true
			log.Printf("seeded missing demo application %s for venue %v", appID, app.VenueID)
		}
	}

	for staffID, member := range demo.staffMembers {
		if existing, exists := s.staffMembers[staffID]; !exists {
			s.staffMembers[staffID] = member
			changed = true
			log.Printf("seeded missing demo staff member %s for venue %s", staffID, member.VenueID)
		} else {
			updated := false
			if existing.Name == "" && member.Name != "" {
				existing.Name = member.Name
				updated = true
			}
			if existing.UserID == "" && member.UserID != "" {
				existing.UserID = member.UserID
				updated = true
			}
			if updated {
				s.staffMembers[staffID] = existing
				changed = true
				log.Printf("backfilled profile for demo staff member %s", staffID)
			}
		}
	}

	for shiftID, shift := range demo.shifts {
		if _, exists := s.shifts[shiftID]; !exists {
			s.shifts[shiftID] = shift
			changed = true
			log.Printf("seeded missing demo shift %s for venue %s", shiftID, shift.VenueID)
		}
	}

	if changed {
		s.persistBestEffortLocked()
	}
}

// staleDemoTime marks demo floor timestamps from a previous day (e.g. a booking
// "for 07:30" that is actually months old) so they are re-seeded relative to now.
func staleDemoTime(t *time.Time) bool {
	return t != nil && time.Since(*t) > 12*time.Hour
}

func sameOptionalID(a, b *string) bool {
	if a == nil || b == nil {
		return a == b
	}
	return *a == *b
}

// ensureDemoFloorExamplesLocked restores occupied + reserved demo tables used on
// the public venue floor map (APP_LOGIC §5.3 / prototype floor examples).
func (s *MemoryStore) ensureDemoFloorExamplesLocked() {
	s.mu.Lock()
	defer s.mu.Unlock()

	demo := NewMemory()
	changed := false
	for _, id := range []string{"t3", "t4", "t7", "t9", "t11"} {
		fresh, ok := demo.tables[id]
		if !ok {
			continue
		}
		current, ok := s.tables[id]
		if !ok {
			s.tables[id] = fresh
			changed = true
			continue
		}
		if current.Status == fresh.Status &&
			((current.OccupiedSince == nil) == (fresh.OccupiedSince == nil)) &&
			((current.ReservedFor == nil) == (fresh.ReservedFor == nil)) &&
			((current.ReservationID == nil) == (fresh.ReservationID == nil)) &&
			!staleDemoTime(current.OccupiedSince) && !staleDemoTime(current.ReservedFor) &&
			sameOptionalID(current.ReservationID, fresh.ReservationID) {
			continue
		}
		current.Status = fresh.Status
		current.OccupiedSince = fresh.OccupiedSince
		current.ReservedFor = fresh.ReservedFor
		current.ReservationID = fresh.ReservationID
		s.tables[id] = current
		changed = true
	}
	for id, res := range demo.reservations {
		existing, exists := s.reservations[id]
		if !exists {
			s.reservations[id] = res
			changed = true
			continue
		}
		// Refresh demo calendar slot times / statuses when seed changes.
		if strings.HasPrefix(id, "res-demo-venue-2") {
			existing.ReservedFor = res.ReservedFor
			existing.Status = res.Status
			existing.TableID = res.TableID
			existing.Guests = res.Guests
			existing.UpdatedAt = res.UpdatedAt
			s.reservations[id] = existing
			changed = true
		}
	}
	if changed {
		for venueID := range s.venues {
			s.refreshFreeTablesLocked(venueID)
		}
		s.persistBestEffortLocked()
	}
}

func (s *MemoryStore) applyState(state persistedState) {
	for id, city := range state.Cities {
		if city.Bounds == (models.MapBounds{}) {
			city.Center = s.cities[id].Center
			city.Bounds = s.cities[id].Bounds
		}
		s.cities[id] = city
	}
	if state.Venues != nil {
		s.venues = state.Venues
	}
	if state.Tables != nil {
		s.tables = state.Tables
		s.migrateTableZonesLocked()
	}
	if state.Users != nil {
		s.users = make(map[string]models.User, len(state.Users))
		for id, persisted := range state.Users {
			user := persisted.User
			user.PasswordHash = persisted.PasswordHash
			user.AvatarKey = persisted.AvatarKey
			s.users[id] = user
		}
	}
	if state.Reservations != nil {
		s.reservations = state.Reservations
		// Migrate legacy seed reservations away from user-guest-demo so guest profile is clean
		for id, r := range s.reservations {
			if r.UserID == demoGuestID {
				if strings.HasPrefix(id, "res-demo-") {
					r.UserID = demoCalendarGuestID
					s.reservations[id] = r
				} else if id == "04ffb1bd-1e30-4f92-bee3-89eece63d28e" {
					delete(s.reservations, id)
				}
			}
		}
	}
	if state.Watches != nil {
		s.watches = state.Watches
	}
	if state.Sessions != nil {
		s.sessions = state.Sessions
	}
	if state.MenuItems != nil {
		s.menuItems = state.MenuItems
	}
	if state.Orders != nil {
		s.orders = state.Orders
	}
	if state.WaiterCalls != nil {
		s.waiterCalls = state.WaiterCalls
	}
	if state.Collections != nil {
		s.collections = state.Collections
	}
	if state.Applications != nil {
		s.applications = state.Applications
	}
	if state.Activities != nil {
		s.activities = state.Activities
	}
	if state.StaffMembers != nil {
		s.staffMembers = state.StaffMembers
	}
	if state.WorkShifts != nil {
		s.shifts = state.WorkShifts
	}
	if state.ProfileChanges != nil {
		s.profileChanges = state.ProfileChanges
	}
	if state.Waitlist != nil {
		s.waitlist = state.Waitlist
	}
	s.adultLog = state.AdultLog
	s.notifications = state.Notifications
	for id, item := range s.menuItems {
		s.menuItems[id] = normalizeAgeRestriction(item)
	}
	s.demoMenuVer = state.DemoMenuVer
	s.demoSeedVer = state.DemoSeedVer
}

func (s *MemoryStore) stateLocked() persistedState {
	users := make(map[string]persistedUser, len(s.users))
	for id, user := range s.users {
		users[id] = persistedUser{User: user, PasswordHash: user.PasswordHash, AvatarKey: user.AvatarKey}
	}
	return persistedState{
		Cities:         s.cities,
		Venues:         s.venues,
		Tables:         s.tables,
		Users:          users,
		Reservations:   s.reservations,
		Watches:        s.watches,
		Sessions:       s.sessions,
		MenuItems:      s.menuItems,
		Orders:         s.orders,
		WaiterCalls:    s.waiterCalls,
		Collections:    s.collections,
		Applications:   s.applications,
		Activities:     s.activities,
		StaffMembers:   s.staffMembers,
		WorkShifts:     s.shifts,
		ProfileChanges: s.profileChanges,
		Waitlist:       s.waitlist,
		AdultLog:       s.adultLog,
		Notifications:  s.notifications,
		DemoMenuVer:    s.demoMenuVer,
		DemoSeedVer:    s.demoSeedVer,
	}
}

func (s *MemoryStore) migrateTableZonesLocked() {
	demo := map[string]string{
		"t1": "hall", "t2": "hall", "t3": "hall", "t4": "terrace", "t5": "terrace",
		"t6": "hall", "t7": "hall", "t8": "street", "t9": "street", "t10": "street",
		"t11": "hall", "t12": "hall", "t13": "street", "t14": "street", "t15": "terrace",
	}
	for id, table := range s.tables {
		if strings.TrimSpace(table.Zone) != "" {
			continue
		}
		if z, ok := demo[id]; ok {
			table.Zone = z
		} else {
			table.Zone = "hall"
		}
		s.tables[id] = table
	}
	// Ensure Steak House demo has street/terrace tables even on old snapshots.
	if _, ok := s.venues["venue-3"]; ok {
		hasStreet := false
		for _, t := range s.tables {
			if t.VenueID == "venue-3" && t.Zone == "street" {
				hasStreet = true
				break
			}
		}
		if !hasStreet {
			extras := []models.Table{
				{ID: "t13", VenueID: "venue-3", Number: 3, Seats: 4, Status: models.TableFree, X: 0.28, Y: 0.35, Zone: "street"},
				{ID: "t14", VenueID: "venue-3", Number: 4, Seats: 2, Status: models.TableFree, X: 0.55, Y: 0.4, Zone: "street"},
				{ID: "t15", VenueID: "venue-3", Number: 5, Seats: 6, Status: models.TableFree, X: 0.78, Y: 0.62, Zone: "terrace"},
			}
			for _, t := range extras {
				if _, exists := s.tables[t.ID]; !exists {
					s.tables[t.ID] = t
				}
			}
		}
	}
}

func (s *MemoryStore) persist() error {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.persistLocked()
}

func (s *MemoryStore) persistBestEffortLocked() {
	if err := s.persistLocked(); err != nil {
		log.Printf("persist Seatiko state: %v", err)
	}
}

func (s *MemoryStore) persistLocked() error {
	if s.dataFile == "" {
		return nil
	}
	if err := os.MkdirAll(filepath.Dir(s.dataFile), 0o750); err != nil {
		return fmt.Errorf("create state directory: %w", err)
	}
	data, err := json.MarshalIndent(s.stateLocked(), "", "  ")
	if err != nil {
		return fmt.Errorf("encode state: %w", err)
	}

	temporary, err := os.CreateTemp(filepath.Dir(s.dataFile), "seatiko-state-*.json")
	if err != nil {
		return fmt.Errorf("create state snapshot: %w", err)
	}
	temporaryPath := temporary.Name()
	committed := false
	defer func() {
		_ = temporary.Close()
		if !committed {
			_ = os.Remove(temporaryPath)
		}
	}()
	if err := temporary.Chmod(0o600); err != nil {
		return fmt.Errorf("protect state snapshot: %w", err)
	}
	if _, err := temporary.Write(data); err != nil {
		return fmt.Errorf("write state snapshot: %w", err)
	}
	if err := temporary.Sync(); err != nil {
		return fmt.Errorf("sync state snapshot: %w", err)
	}
	if err := temporary.Close(); err != nil {
		return fmt.Errorf("close state snapshot: %w", err)
	}
	if err := os.Rename(temporaryPath, s.dataFile); err != nil {
		return fmt.Errorf("commit state snapshot: %w", err)
	}
	committed = true
	return nil
}
