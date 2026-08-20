package store

import (
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"os"
	"path/filepath"

	"github.com/foodassistant/api/internal/models"
)

type persistedState struct {
	Cities       map[string]models.City                  `json:"cities"`
	Venues       map[string]models.Venue                 `json:"venues"`
	Tables       map[string]models.Table                 `json:"tables"`
	Users        map[string]persistedUser                `json:"users"`
	Reservations map[string]models.Reservation           `json:"reservations"`
	Watches      map[string]models.TableWatch            `json:"watches"`
	Sessions     map[string]models.Session               `json:"sessions"`
	MenuItems    map[string]models.MenuItem              `json:"menu_items"`
	Orders       map[string]models.Order                 `json:"orders"`
	WaiterCalls  map[string]models.WaiterCall            `json:"waiter_calls"`
	Collections  map[string]models.HolidayCollection     `json:"collections"`
	Applications map[string]models.VenueApplication      `json:"applications"`
	Activities   map[string][]models.ApplicationActivity `json:"activities"`
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
	return s, nil
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
}

func (s *MemoryStore) stateLocked() persistedState {
	users := make(map[string]persistedUser, len(s.users))
	for id, user := range s.users {
		users[id] = persistedUser{User: user, PasswordHash: user.PasswordHash}
	}
	return persistedState{
		Cities:       s.cities,
		Venues:       s.venues,
		Tables:       s.tables,
		Users:        users,
		Reservations: s.reservations,
		Watches:      s.watches,
		Sessions:     s.sessions,
		MenuItems:    s.menuItems,
		Orders:       s.orders,
		WaiterCalls:  s.waiterCalls,
		Collections:  s.collections,
		Applications: s.applications,
		Activities:   s.activities,
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
