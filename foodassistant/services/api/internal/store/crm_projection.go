package store

import (
	"net/mail"
	"sort"
	"strings"
	"time"

	"github.com/foodassistant/api/internal/models"
)

// ListAllUsers returns a detached snapshot for the CRM reconciler.
func (s *MemoryStore) ListAllUsers() []models.User {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := make([]models.User, 0, len(s.users))
	for _, user := range s.users {
		out = append(out, user)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].CreatedAt.Before(out[j].CreatedAt) })
	return out
}

// ListAllReservations returns a detached snapshot for idempotent reconciliation.
func (s *MemoryStore) ListAllReservations() []models.Reservation {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := make([]models.Reservation, 0, len(s.reservations))
	for _, reservation := range s.reservations {
		out = append(out, reservation)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].CreatedAt.Before(out[j].CreatedAt) })
	return out
}

func (s *MemoryStore) GetTable(id string) (models.Table, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	table, ok := s.tables[id]
	if !ok {
		return models.Table{}, ErrNotFound
	}
	return table, nil
}

func (s *MemoryStore) GetApplicationByVenueID(venueID string) (models.VenueApplication, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	for _, application := range s.applications {
		if application.VenueID != nil && *application.VenueID == venueID {
			return application, nil
		}
	}
	return models.VenueApplication{}, ErrNotFound
}

// UpdateUserFromCRM applies only the owner/contact fields that CRM is allowed
// to manage. Authentication and roles stay owned by FoodAssistant.
func (s *MemoryStore) UpdateUserFromCRM(id, firstName, lastName, email, phone, locale string) (models.User, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	defer s.persistBestEffortLocked()

	user, ok := s.users[id]
	if !ok {
		return models.User{}, ErrNotFound
	}
	if email != "" {
		if _, err := mail.ParseAddress(email); err != nil {
			return models.User{}, ErrBadRequest
		}
		for userID, existing := range s.users {
			if userID != id && strings.EqualFold(existing.Email, email) {
				return models.User{}, ErrEmailTaken
			}
		}
		user.Email = email
	}
	if firstName != "" {
		user.FirstName = firstName
	}
	if lastName != "" {
		user.LastName = lastName
	}
	if phone != "" {
		user.Phone = phone
	}
	if locale == "ru" || locale == "en" || locale == "ro" {
		user.Locale = locale
	}
	displayName := strings.TrimSpace(user.FirstName + " " + user.LastName)
	if displayName != "" {
		user.DisplayName = displayName
	}
	user.UpdatedAt = time.Now().UTC()
	s.users[id] = user
	return user, nil
}

// UpdateApplicationFromCRM applies descriptive restaurant fields, but never
// lifecycle status, moderation, publication, or ownership. Those remain owned
// by FoodAssistant so a manual CRM edit cannot accidentally publish a venue.
func (s *MemoryStore) UpdateApplicationFromCRM(id string, patch ApplicationUpdate) (models.VenueApplication, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	defer s.persistBestEffortLocked()

	application, ok := s.applications[id]
	if !ok {
		return models.VenueApplication{}, ErrNotFound
	}
	if patch.Email != nil && *patch.Email != "" {
		if _, err := mail.ParseAddress(*patch.Email); err != nil {
			return models.VenueApplication{}, ErrBadRequest
		}
	}
	if patch.Lat != nil && (*patch.Lat < -90 || *patch.Lat > 90) {
		return models.VenueApplication{}, ErrBadRequest
	}
	if patch.Lng != nil && (*patch.Lng < -180 || *patch.Lng > 180) {
		return models.VenueApplication{}, ErrBadRequest
	}

	changed := make([]string, 0, 12)
	if patch.Name != nil && !localizedEqual(application.Name, *patch.Name) {
		application.Name = *patch.Name
		changed = append(changed, "name")
	}
	if patch.Description != nil && !localizedEqual(application.Description, *patch.Description) {
		application.Description = *patch.Description
		changed = append(changed, "description")
	}
	if patch.Address != nil && !localizedEqual(application.Address, *patch.Address) {
		application.Address = *patch.Address
		changed = append(changed, "address")
	}
	if patch.Cuisine != nil && !stringSliceEqual(application.Cuisine, *patch.Cuisine) {
		application.Cuisine = append([]string(nil), (*patch.Cuisine)...)
		changed = append(changed, "cuisine")
	}
	if patch.Phone != nil && application.Phone != *patch.Phone {
		application.Phone = *patch.Phone
		changed = append(changed, "phone")
	}
	if patch.Email != nil && application.Email != *patch.Email {
		application.Email = *patch.Email
		changed = append(changed, "email")
	}
	if patch.Website != nil && application.Website != *patch.Website {
		application.Website = *patch.Website
		changed = append(changed, "website")
	}
	if patch.CityID != nil && application.CityID != *patch.CityID {
		application.CityID = *patch.CityID
		changed = append(changed, "city")
	}
	if patch.Lat != nil && application.Lat != *patch.Lat {
		application.Lat = *patch.Lat
		changed = append(changed, "latitude")
	}
	if patch.Lng != nil && application.Lng != *patch.Lng {
		application.Lng = *patch.Lng
		changed = append(changed, "longitude")
	}
	if patch.PriceLevel != nil && application.PriceLevel != *patch.PriceLevel {
		application.PriceLevel = *patch.PriceLevel
		changed = append(changed, "price_level")
	}
	if patch.AverageCheck != nil && application.AverageCheck != *patch.AverageCheck {
		application.AverageCheck = *patch.AverageCheck
		changed = append(changed, "average_check")
	}
	if patch.HoursText != nil && application.HoursText != *patch.HoursText {
		application.HoursText = *patch.HoursText
		changed = append(changed, "hours")
	}
	if len(changed) == 0 {
		return application, nil
	}
	application.UpdatedAt = time.Now().UTC()
	s.applications[id] = application
	s.recordActivityLocked(id, "twenty-crm", "CRM_PROFILE_UPDATED", changed, "")
	return application, nil
}

func (s *MemoryStore) UpdateReservationStatusFromCRM(id string, status models.ReservationStatus) (models.Reservation, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	defer s.persistBestEffortLocked()

	reservation, ok := s.reservations[id]
	if !ok {
		return models.Reservation{}, ErrNotFound
	}
	switch status {
	case models.ReservationConfirmed, models.ReservationCheckedIn, models.ReservationCancelled, models.ReservationNoShow:
	default:
		return models.Reservation{}, ErrInvalidStatus
	}
	if reservation.Status == status {
		return reservation, nil
	}
	reservation.Status = status
	reservation.UpdatedAt = time.Now().UTC()
	if status == models.ReservationCheckedIn && reservation.ArrivalConfirmedAt == nil {
		now := reservation.UpdatedAt
		reservation.ArrivalConfirmedAt = &now
	}
	if status == models.ReservationCancelled {
		if table, exists := s.tables[reservation.TableID]; exists && table.ReservationID != nil && *table.ReservationID == reservation.ID {
			table.Status = models.TableFree
			table.ReservedFor = nil
			table.ReservationID = nil
			s.tables[table.ID] = table
			s.refreshFreeTablesLocked(reservation.VenueID)
		}
	}
	s.reservations[id] = reservation
	return reservation, nil
}
