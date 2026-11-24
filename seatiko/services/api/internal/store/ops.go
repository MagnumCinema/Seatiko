package store

import (
	"sort"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/seatiko/api/internal/models"
	"github.com/seatiko/api/internal/qr"
)

type TableLayoutInput struct {
	Number int     `json:"number"`
	Seats  int     `json:"seats"`
	X      float64 `json:"x"`
	Y      float64 `json:"y"`
	Zone   string  `json:"zone"`
}

type MenuItemInput struct {
	ID              string                  `json:"id"`
	Category        models.LocalizedString  `json:"category"`
	Name            models.LocalizedString  `json:"name"`
	Description     models.LocalizedString  `json:"description"`
	Ingredients     *models.LocalizedString `json:"ingredients"`
	Allergens       []string                `json:"allergens"`
	Price           int                     `json:"price"`
	WeightG         *int                    `json:"weight_g"`
	VolumeML        *int                    `json:"volume_ml"`
	ImageURL        *string                 `json:"image_url"`
	ContainsAlcohol bool                    `json:"contains_alcohol"`
	RequiresAge18   bool                    `json:"requires_age_18"`
	Tags            []string                `json:"tags"`
	Stopped         bool                    `json:"stopped"`
}

type BookingRulesInput struct {
	BookingIntervalMin    *int  `json:"booking_interval_min"`
	HoldMinutes           *int  `json:"hold_minutes"`
	AllowPreorder         *bool `json:"allow_preorder"`
	SessionStartBeforeMin *int  `json:"session_start_before_min"`
	ReleaseBeforeMin      *int  `json:"release_before_min"`
	MaxLateArrivalMin     *int  `json:"max_late_arrival_min"`
	VisitDurationMin      *int  `json:"visit_duration_min"`
	MaxVisitDurationMin   *int  `json:"max_visit_duration_min"`
}

func (s *MemoryStore) ownerCanManageVenueLocked(ownerID, venueID string) bool {
	for _, app := range s.applications {
		if app.OwnerUserID == ownerID && app.VenueID != nil && *app.VenueID == venueID && app.Status == models.AppPublished {
			return true
		}
	}
	return false
}

func (s *MemoryStore) RequireStaffOrOwner(userID, venueID string) error {
	s.mu.RLock()
	defer s.mu.RUnlock()
	user, ok := s.users[userID]
	if !ok {
		return ErrNotFound
	}
	if user.Role == models.RoleAdmin {
		return nil
	}
	if user.Role == models.RoleRestaurant && s.ownerCanManageVenueLocked(userID, venueID) {
		return nil
	}
	for _, member := range s.staffMembers {
		if member.VenueID == venueID && member.Status == models.StaffStatusActive &&
			(member.UserID == userID || strings.EqualFold(member.Email, user.Email)) {
			return nil
		}
	}
	return ErrForbidden
}

func (s *MemoryStore) ReplaceTablesLayout(ownerID, venueID string, layout []TableLayoutInput) ([]models.Table, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	defer s.persistBestEffortLocked()

	if !s.ownerCanManageVenueLocked(ownerID, venueID) {
		return nil, ErrForbidden
	}
	if _, ok := s.venues[venueID]; !ok {
		return nil, ErrNotFound
	}
	if len(layout) == 0 {
		return nil, ErrBadRequest
	}

	byNumber := map[int]models.Table{}
	for _, table := range s.tables {
		if table.VenueID != venueID {
			continue
		}
		byNumber[table.Number] = table
	}

	wanted := map[int]struct{}{}
	out := make([]models.Table, 0, len(layout))
	for _, item := range layout {
		if item.Number < 1 || item.Seats < 1 || item.Seats > 20 {
			return nil, ErrBadRequest
		}
		x := item.X
		y := item.Y
		if x < 0.08 {
			x = 0.08
		}
		if x > 0.92 {
			x = 0.92
		}
		if y < 0.12 {
			y = 0.12
		}
		if y > 0.88 {
			y = 0.88
		}
		wanted[item.Number] = struct{}{}
		zone := normalizeZone(item.Zone)

		if existing, ok := byNumber[item.Number]; ok {
			existing.Seats = item.Seats
			existing.X = x
			existing.Y = y
			existing.Zone = zone
			s.tables[existing.ID] = existing
			out = append(out, existing)
			continue
		}

		token, err := qr.RandomToken()
		if err != nil {
			return nil, err
		}
		table := models.Table{
			ID:      uuid.NewString(),
			VenueID: venueID,
			Number:  item.Number,
			Seats:   item.Seats,
			Status:  models.TableFree,
			X:       x,
			Y:       y,
			Zone:    zone,
			QRToken: token,
		}
		s.tables[table.ID] = table
		out = append(out, table)
	}

	for id, table := range s.tables {
		if table.VenueID != venueID {
			continue
		}
		if _, keep := wanted[table.Number]; keep {
			continue
		}
		if table.Status == models.TableOccupied || table.Status == models.TableReserved {
			continue
		}
		delete(s.tables, id)
	}

	s.refreshFreeTablesLocked(venueID)
	sort.Slice(out, func(i, j int) bool { return out[i].Number < out[j].Number })
	return out, nil
}

func (s *MemoryStore) UpsertMenuItem(ownerID, venueID string, input MenuItemInput) (models.MenuItem, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	defer s.persistBestEffortLocked()

	if !s.ownerCanManageVenueLocked(ownerID, venueID) {
		return models.MenuItem{}, ErrForbidden
	}
	if strings.TrimSpace(input.Name.RU) == "" && strings.TrimSpace(input.Name.EN) == "" && strings.TrimSpace(input.Name.RO) == "" {
		return models.MenuItem{}, ErrBadRequest
	}
	if input.Price < 0 {
		return models.MenuItem{}, ErrBadRequest
	}
	id := strings.TrimSpace(input.ID)
	existing, exists := s.menuItems[id]
	if id == "" {
		id = uuid.NewString()
	} else if exists && existing.VenueID != venueID {
		return models.MenuItem{}, ErrForbidden
	}
	item := models.MenuItem{
		ID:              id,
		VenueID:         venueID,
		Category:        input.Category,
		Name:            input.Name,
		Description:     input.Description,
		Ingredients:     existing.Ingredients,
		Allergens:       existing.Allergens,
		Price:           input.Price,
		WeightG:         existing.WeightG,
		VolumeML:        existing.VolumeML,
		ImageURL:        existing.ImageURL,
		ContainsAlcohol: input.ContainsAlcohol,
		RequiresAge18:   input.RequiresAge18,
		Tags:            existing.Tags,
		Position:        existing.Position,
		Stopped:         input.Stopped,
	}
	if input.Ingredients != nil {
		item.Ingredients = *input.Ingredients
	}
	if input.Allergens != nil {
		item.Allergens = input.Allergens
	}
	if input.WeightG != nil {
		item.WeightG = max(0, *input.WeightG)
	}
	if input.VolumeML != nil {
		item.VolumeML = max(0, *input.VolumeML)
	}
	if input.ImageURL != nil {
		item.ImageURL = strings.TrimSpace(*input.ImageURL)
	}
	if input.Tags != nil {
		item.Tags = input.Tags
	}
	item = normalizeAgeRestriction(item)
	s.menuItems[id] = item
	return item, nil
}

func (s *MemoryStore) DeleteMenuItem(ownerID, venueID, itemID string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	defer s.persistBestEffortLocked()

	if !s.ownerCanManageVenueLocked(ownerID, venueID) {
		return ErrForbidden
	}
	item, ok := s.menuItems[itemID]
	if !ok || item.VenueID != venueID {
		return ErrNotFound
	}
	delete(s.menuItems, itemID)
	return nil
}

func (s *MemoryStore) SetMenuStopped(ownerID, venueID, itemID string, stopped bool) (models.MenuItem, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	defer s.persistBestEffortLocked()

	if !s.ownerCanManageVenueLocked(ownerID, venueID) {
		return models.MenuItem{}, ErrForbidden
	}
	item, ok := s.menuItems[itemID]
	if !ok || item.VenueID != venueID {
		return models.MenuItem{}, ErrNotFound
	}
	item.Stopped = stopped
	s.menuItems[itemID] = item
	return item, nil
}

func (s *MemoryStore) EnsureTableQRTokens(ownerID, venueID string) ([]models.Table, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	defer s.persistBestEffortLocked()

	if !s.ownerCanManageVenueLocked(ownerID, venueID) {
		return nil, ErrForbidden
	}
	out := make([]models.Table, 0)
	for id, table := range s.tables {
		if table.VenueID != venueID {
			continue
		}
		if table.QRToken == "" {
			table.QRToken = qr.Sign(s.qrSecret, venueID, table.ID)
			s.tables[id] = table
		}
		out = append(out, table)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Number < out[j].Number })
	return out, nil
}

func (s *MemoryStore) ListVenueQR(ownerID, venueID string) ([]models.Table, error) {
	return s.EnsureTableQRTokens(ownerID, venueID)
}

func (s *MemoryStore) ListMenuForOwner(ownerID, venueID string) ([]models.MenuItem, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	if !s.ownerCanManageVenueLocked(ownerID, venueID) {
		return nil, ErrForbidden
	}
	out := make([]models.MenuItem, 0)
	for _, m := range s.menuItems {
		if m.VenueID == venueID {
			out = append(out, m)
		}
	}
	sortMenu(out)
	return out, nil
}

func (s *MemoryStore) RegenerateTableQRTokens(ownerID, venueID string) ([]models.Table, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	defer s.persistBestEffortLocked()
	if !s.ownerCanManageVenueLocked(ownerID, venueID) {
		return nil, ErrForbidden
	}
	out := make([]models.Table, 0)
	for id, table := range s.tables {
		if table.VenueID != venueID {
			continue
		}
		token, err := qr.RandomToken()
		if err != nil {
			return nil, err
		}
		table.QRToken = token
		s.tables[id] = table
		out = append(out, table)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Number < out[j].Number })
	return out, nil
}

func (s *MemoryStore) UpdateVenueBookingRules(ownerID, venueID string, input BookingRulesInput) (models.Venue, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	defer s.persistBestEffortLocked()

	if !s.ownerCanManageVenueLocked(ownerID, venueID) {
		return models.Venue{}, ErrForbidden
	}
	venue, ok := s.venues[venueID]
	if !ok {
		return models.Venue{}, ErrNotFound
	}
	if input.BookingIntervalMin != nil {
		venue.BookingIntervalMin = *input.BookingIntervalMin
	}
	if input.HoldMinutes != nil {
		venue.HoldMinutes = *input.HoldMinutes
	}
	if input.AllowPreorder != nil {
		venue.AllowPreorder = *input.AllowPreorder
	}
	if input.SessionStartBeforeMin != nil {
		venue.SessionStartBeforeMin = *input.SessionStartBeforeMin
	}
	if input.ReleaseBeforeMin != nil {
		venue.ReleaseBeforeMin = *input.ReleaseBeforeMin
	}
	if input.MaxLateArrivalMin != nil {
		venue.MaxLateArrivalMin = *input.MaxLateArrivalMin
	}
	if input.VisitDurationMin != nil {
		venue.VisitDurationMin = *input.VisitDurationMin
	}
	if input.MaxVisitDurationMin != nil {
		venue.MaxVisitDurationMin = *input.MaxVisitDurationMin
	}
	if err := validateBookingRules(venue); err != nil {
		return models.Venue{}, err
	}
	s.venues[venueID] = venue
	return venue, nil
}

func (s *MemoryStore) VenueAnalytics(ownerID, venueID string) (models.VenueAnalytics, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	if !s.ownerCanManageVenueLocked(ownerID, venueID) {
		user, ok := s.users[ownerID]
		if !ok || user.Role != models.RoleAdmin {
			return models.VenueAnalytics{}, ErrForbidden
		}
	}
	if _, ok := s.venues[venueID]; !ok {
		return models.VenueAnalytics{}, ErrNotFound
	}
	analytics := models.VenueAnalytics{
		VenueID:              venueID,
		ReservationsByStatus: map[string]int{},
		OrdersByStatus:       map[string]int{},
	}
	for _, table := range s.tables {
		if table.VenueID != venueID {
			continue
		}
		analytics.TotalTables++
		if table.Status == models.TableFree {
			analytics.FreeTables++
		}
	}
	for _, reservation := range s.reservations {
		if reservation.VenueID == venueID {
			analytics.ReservationsByStatus[string(reservation.Status)]++
		}
	}
	for _, order := range s.orders {
		if order.VenueID == venueID {
			analytics.OrdersByStatus[string(order.Status)]++
		}
	}
	for _, call := range s.waiterCalls {
		if call.VenueID == venueID && call.Status == models.WaiterPending {
			analytics.WaiterCallsPending++
		}
	}
	return analytics, nil
}

func (s *MemoryStore) InviteStaff(ownerID, venueID, email string) (models.StaffMember, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	defer s.persistBestEffortLocked()

	if !s.ownerCanManageVenueLocked(ownerID, venueID) {
		return models.StaffMember{}, ErrForbidden
	}
	email = strings.ToLower(strings.TrimSpace(email))
	if email == "" {
		return models.StaffMember{}, ErrBadRequest
	}
	member := models.StaffMember{
		ID:        uuid.NewString(),
		VenueID:   venueID,
		Email:     email,
		Role:      models.StaffRoleWaiter,
		Status:    models.StaffStatusInvited,
		CreatedAt: time.Now().UTC(),
	}
	for _, user := range s.users {
		if strings.EqualFold(user.Email, email) {
			member.UserID = user.ID
			member.Status = models.StaffStatusActive
			user.Role = models.RoleStaff
			user.UpdatedAt = time.Now().UTC()
			s.users[user.ID] = user
			break
		}
	}
	s.staffMembers[member.ID] = member
	return member, nil
}

func (s *MemoryStore) ListStaff(ownerID, venueID string) ([]models.StaffMember, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	if !s.ownerCanManageVenueLocked(ownerID, venueID) {
		return nil, ErrForbidden
	}
	out := make([]models.StaffMember, 0)
	for _, member := range s.staffMembers {
		if member.VenueID == venueID {
			out = append(out, member)
		}
	}
	return out, nil
}

func (s *MemoryStore) AcceptStaffInvite(userID, inviteID string) (models.StaffMember, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	defer s.persistBestEffortLocked()

	user, ok := s.users[userID]
	if !ok {
		return models.StaffMember{}, ErrNotFound
	}
	member, ok := s.staffMembers[inviteID]
	if !ok {
		return models.StaffMember{}, ErrNotFound
	}
	if member.Status != models.StaffStatusInvited && member.Status != models.StaffStatusActive {
		return models.StaffMember{}, ErrConflict
	}
	if member.Email != "" && !strings.EqualFold(member.Email, user.Email) {
		return models.StaffMember{}, ErrForbidden
	}
	member.UserID = userID
	member.Status = models.StaffStatusActive
	s.staffMembers[inviteID] = member
	user.Role = models.RoleStaff
	user.UpdatedAt = time.Now().UTC()
	s.users[userID] = user
	return member, nil
}

func (s *MemoryStore) GetWaiterCall(id string) (models.WaiterCall, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	call, ok := s.waiterCalls[id]
	if !ok {
		return models.WaiterCall{}, ErrNotFound
	}
	return call, nil
}

func (s *MemoryStore) CompleteWaiterCall(id string) (models.WaiterCall, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	defer s.persistBestEffortLocked()

	call, ok := s.waiterCalls[id]
	if !ok {
		return models.WaiterCall{}, ErrNotFound
	}
	if call.Status == models.WaiterDone {
		return models.WaiterCall{}, ErrConflict
	}
	call.Status = models.WaiterDone
	s.waiterCalls[id] = call
	return call, nil
}

func (s *MemoryStore) ListVenueOrders(venueID string) ([]models.Order, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	if _, ok := s.venues[venueID]; !ok {
		return nil, ErrNotFound
	}
	out := make([]models.Order, 0)
	for _, order := range s.orders {
		if order.VenueID == venueID {
			out = append(out, order)
		}
	}
	return out, nil
}

func (s *MemoryStore) ListVenueReservationsStaff(venueID string) ([]models.Reservation, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	if _, ok := s.venues[venueID]; !ok {
		return nil, ErrNotFound
	}
	out := make([]models.Reservation, 0)
	for _, reservation := range s.reservations {
		if reservation.VenueID == venueID {
			out = append(out, reservation)
		}
	}
	return out, nil
}

func (s *MemoryStore) SubmitProfileChangeRequest(ownerID, applicationID string, patch models.ApplicationPatch) (models.ProfileChangeRequest, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	defer s.persistBestEffortLocked()

	app, ok := s.applications[applicationID]
	if !ok {
		return models.ProfileChangeRequest{}, ErrNotFound
	}
	if app.OwnerUserID != ownerID {
		return models.ProfileChangeRequest{}, ErrForbidden
	}
	if app.Status != models.AppPublished {
		return models.ProfileChangeRequest{}, ErrConflict
	}
	req := models.ProfileChangeRequest{
		ID:            uuid.NewString(),
		ApplicationID: applicationID,
		OwnerUserID:   ownerID,
		Status:        models.ProfileChangePending,
		Patch:         patch,
		CreatedAt:     time.Now().UTC(),
	}
	s.profileChanges[req.ID] = req
	s.recordActivityLocked(applicationID, ownerID, "PROFILE_CHANGE_REQUESTED", nil, "")
	return req, nil
}

func (s *MemoryStore) ListProfileChangeRequests(ownerID string) []models.ProfileChangeRequest {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := make([]models.ProfileChangeRequest, 0)
	for _, req := range s.profileChanges {
		if req.OwnerUserID == ownerID {
			out = append(out, req)
		}
	}
	return out
}

func (s *MemoryStore) AdminListProfileChangeRequests() []models.ProfileChangeRequest {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := make([]models.ProfileChangeRequest, 0, len(s.profileChanges))
	for _, req := range s.profileChanges {
		out = append(out, req)
	}
	return out
}

func (s *MemoryStore) AdminReviewProfileChange(adminID, requestID, status, note string) (models.ProfileChangeRequest, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	defer s.persistBestEffortLocked()

	admin, ok := s.users[adminID]
	if !ok || admin.Role != models.RoleAdmin {
		return models.ProfileChangeRequest{}, ErrForbidden
	}
	req, ok := s.profileChanges[requestID]
	if !ok {
		return models.ProfileChangeRequest{}, ErrNotFound
	}
	if req.Status != models.ProfileChangePending {
		return models.ProfileChangeRequest{}, ErrConflict
	}
	switch status {
	case models.ProfileChangeApproved:
		app, ok := s.applications[req.ApplicationID]
		if !ok {
			return models.ProfileChangeRequest{}, ErrNotFound
		}
		update := ApplicationUpdate{
			Name:         req.Patch.Name,
			Description:  req.Patch.Description,
			Address:      req.Patch.Address,
			Cuisine:      req.Patch.Cuisine,
			Phone:        req.Patch.Phone,
			Email:        req.Patch.Email,
			Website:      req.Patch.Website,
			CityID:       req.Patch.CityID,
			Lat:          req.Patch.Lat,
			Lng:          req.Patch.Lng,
			PriceLevel:   req.Patch.PriceLevel,
			AverageCheck: req.Patch.AverageCheck,
			HoursText:    req.Patch.HoursText,
		}
		// Apply patch inline without ownership re-check (admin path).
		if update.Name != nil {
			app.Name = *update.Name
		}
		if update.Description != nil {
			app.Description = *update.Description
		}
		if update.Address != nil {
			app.Address = *update.Address
		}
		if update.Cuisine != nil {
			app.Cuisine = append([]string(nil), (*update.Cuisine)...)
		}
		if update.Phone != nil {
			app.Phone = *update.Phone
		}
		if update.Email != nil {
			app.Email = *update.Email
		}
		if update.Website != nil {
			app.Website = *update.Website
		}
		if update.CityID != nil {
			app.CityID = *update.CityID
		}
		if update.Lat != nil {
			app.Lat = *update.Lat
		}
		if update.Lng != nil {
			app.Lng = *update.Lng
		}
		if update.PriceLevel != nil {
			app.PriceLevel = *update.PriceLevel
		}
		if update.AverageCheck != nil {
			app.AverageCheck = *update.AverageCheck
		}
		if update.HoursText != nil {
			app.HoursText = *update.HoursText
		}
		app.UpdatedAt = time.Now().UTC()
		s.applications[app.ID] = app
		if app.VenueID != nil {
			if venue, ok := s.venues[*app.VenueID]; ok {
				venue.Name = app.Name
				venue.Description = app.Description
				venue.Address = app.Address
				venue.Cuisine = append([]string(nil), app.Cuisine...)
				venue.Website = app.Website
				venue.CityID = app.CityID
				venue.Lat = app.Lat
				venue.Lng = app.Lng
				venue.PriceLevel = app.PriceLevel
				venue.AverageCheck = app.AverageCheck
				venue.HoursText = app.HoursText
				s.venues[venue.ID] = venue
			}
		}
		req.Status = models.ProfileChangeApproved
		s.recordActivityLocked(app.ID, adminID, "PROFILE_CHANGE_APPROVED", nil, note)
	case models.ProfileChangeRejected:
		req.Status = models.ProfileChangeRejected
		req.Note = note
		s.recordActivityLocked(req.ApplicationID, adminID, "PROFILE_CHANGE_REJECTED", nil, note)
	default:
		return models.ProfileChangeRequest{}, ErrBadRequest
	}
	s.profileChanges[requestID] = req
	return req, nil
}

func normalizeZone(zone string) string {
	z := strings.ToLower(strings.TrimSpace(zone))
	switch z {
	case "", "зал", "hall", "indoor", "main":
		return "hall"
	case "улица", "street", "outside":
		return "street"
	case "терраса", "terrace", "patio", "veranda", "веранда":
		return "terrace"
	case "сад", "garden":
		return "garden"
	case "бар", "bar":
		return "bar"
	default:
		// keep custom slug-ish values (letters, digits, dash/underscore)
		clean := strings.Builder{}
		for _, r := range z {
			if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') || r == '-' || r == '_' {
				clean.WriteRune(r)
			}
		}
		if clean.Len() == 0 {
			return "hall"
		}
		return clean.String()
	}
}
