package store

import (
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"strings"

	"github.com/foodassistant/api/internal/models"
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
	ProfileChanges map[string]models.ProfileChangeRequest  `json:"profile_changes"`
	Waitlist       map[string]models.WaitlistEntry         `json:"waitlist"`
}

type persistedUser struct {
	models.User
	PasswordHash string `json:"password_hash"`
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
	return s, nil
}

// backfillVenueMediaLocked fills demo photos/reviews for seeded venues that
// were persisted before those fields existed.
func (s *MemoryStore) backfillVenueMediaLocked() {
	s.mu.Lock()
	defer s.mu.Unlock()
	changed := false
	demo := NewMemory()
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

func (s *MemoryStore) applyState(state persistedState) {
	if state.Cities != nil {
		s.cities = state.Cities
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
			s.users[id] = user
		}
	}
	if state.Reservations != nil {
		s.reservations = state.Reservations
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
	if state.ProfileChanges != nil {
		s.profileChanges = state.ProfileChanges
	}
	if state.Waitlist != nil {
		s.waitlist = state.Waitlist
	}
}

func (s *MemoryStore) stateLocked() persistedState {
	users := make(map[string]persistedUser, len(s.users))
	for id, user := range s.users {
		users[id] = persistedUser{User: user, PasswordHash: user.PasswordHash}
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
		ProfileChanges: s.profileChanges,
		Waitlist:       s.waitlist,
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
		log.Printf("persist FoodAssistant state: %v", err)
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

	temporary, err := os.CreateTemp(filepath.Dir(s.dataFile), "foodassistant-state-*.json")
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
