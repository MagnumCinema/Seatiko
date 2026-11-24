package store

import (
	"sort"
	"strconv"
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
		if app.OwnerUserID == ownerID {
			if (app.VenueID != nil && *app.VenueID == venueID) || app.ID == venueID {
				return true
			}
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
	venueID = s.resolveVenueIDLocked(venueID)
	_, hasVenue := s.venues[venueID]
	_, hasApp := s.applications[venueID]
	if !hasVenue && !hasApp {
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
	venueID = s.resolveVenueIDLocked(venueID)
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
	venueID = s.resolveVenueIDLocked(venueID)
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
	venueID = s.resolveVenueIDLocked(venueID)
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
	venueID = s.resolveVenueIDLocked(venueID)
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
	venueID = s.resolveVenueIDLocked(venueID)
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
	venueID = s.resolveVenueIDLocked(venueID)
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
	targetID := s.resolveVenueIDLocked(venueID)
	venue, ok := s.venues[targetID]
	if ok {
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
		s.venues[targetID] = venue
		return venue, nil
	}

	app, ok := s.applications[targetID]
	if !ok {
		return models.Venue{}, ErrNotFound
	}
	draftVenue := s.venueFromApplicationLocked(app)
	if input.BookingIntervalMin != nil {
		draftVenue.BookingIntervalMin = *input.BookingIntervalMin
		app.BookingIntervalMin = *input.BookingIntervalMin
	}
	if input.HoldMinutes != nil {
		draftVenue.HoldMinutes = *input.HoldMinutes
		app.HoldMinutes = *input.HoldMinutes
	}
	if input.AllowPreorder != nil {
		draftVenue.AllowPreorder = *input.AllowPreorder
		app.AllowPreorder = *input.AllowPreorder
	}
	if input.SessionStartBeforeMin != nil {
		draftVenue.SessionStartBeforeMin = *input.SessionStartBeforeMin
		app.SessionStartBeforeMin = *input.SessionStartBeforeMin
	}
	if input.ReleaseBeforeMin != nil {
		draftVenue.ReleaseBeforeMin = *input.ReleaseBeforeMin
		app.ReleaseBeforeMin = *input.ReleaseBeforeMin
	}
	if input.MaxLateArrivalMin != nil {
		draftVenue.MaxLateArrivalMin = *input.MaxLateArrivalMin
		app.MaxLateArrivalMin = *input.MaxLateArrivalMin
	}
	if input.VisitDurationMin != nil {
		draftVenue.VisitDurationMin = *input.VisitDurationMin
		app.VisitDurationMin = *input.VisitDurationMin
	}
	if input.MaxVisitDurationMin != nil {
		draftVenue.MaxVisitDurationMin = *input.MaxVisitDurationMin
		app.MaxVisitDurationMin = *input.MaxVisitDurationMin
	}
	if err := validateBookingRules(draftVenue); err != nil {
		return models.Venue{}, err
	}
	s.applications[targetID] = app
	return draftVenue, nil
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
	targetID := s.resolveVenueIDLocked(venueID)
	_, hasVenue := s.venues[targetID]
	_, hasApp := s.applications[targetID]
	if !hasVenue && !hasApp {
		return models.VenueAnalytics{}, ErrNotFound
	}
	analytics := models.VenueAnalytics{
		VenueID:              targetID,
		ReservationsByStatus: map[string]int{},
		OrdersByStatus:       map[string]int{},
	}
	for _, table := range s.tables {
		if table.VenueID != targetID {
			continue
		}
		analytics.TotalTables++
		if table.Status == models.TableFree {
			analytics.FreeTables++
		}
	}
	for _, reservation := range s.reservations {
		if reservation.VenueID == targetID {
			analytics.ReservationsByStatus[string(reservation.Status)]++
		}
	}
	for _, order := range s.orders {
		if order.VenueID == targetID {
			analytics.OrdersByStatus[string(order.Status)]++
		}
	}
	for _, call := range s.waiterCalls {
		if call.VenueID == targetID && call.Status == models.WaiterPending {
			analytics.WaiterCallsPending++
		}
	}
	return analytics, nil
}

func (s *MemoryStore) InviteStaff(ownerID, venueID, email string, details ...string) (models.StaffMember, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	defer s.persistBestEffortLocked()

	if !s.ownerCanManageVenueLocked(ownerID, venueID) {
		return models.StaffMember{}, ErrForbidden
	}
	venueID = s.resolveVenueIDLocked(venueID)
	email = strings.ToLower(strings.TrimSpace(email))
	if email == "" {
		return models.StaffMember{}, ErrBadRequest
	}
	staffName := ""
	if len(details) > 0 && strings.TrimSpace(details[0]) != "" {
		staffName = strings.TrimSpace(details[0])
	}
	role := models.StaffRoleWaiter
	if len(details) > 1 && strings.TrimSpace(details[1]) != "" {
		r := strings.ToLower(strings.TrimSpace(details[1]))
		if r == models.StaffRoleCook || r == models.StaffRoleWaiter {
			role = r
		}
	}
	member := models.StaffMember{
		ID:        uuid.NewString(),
		VenueID:   venueID,
		Name:      staffName,
		Email:     email,
		Role:      role,
		Status:    models.StaffStatusInvited,
		OnShift:   false,
		CreatedAt: time.Now().UTC(),
	}
	for _, user := range s.users {
		if strings.EqualFold(user.Email, email) {
			member.UserID = user.ID
			if member.Name == "" && user.DisplayName != "" {
				member.Name = user.DisplayName
			}
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

func (s *MemoryStore) RemoveStaff(ownerID, venueID, staffID string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	defer s.persistBestEffortLocked()

	if !s.ownerCanManageVenueLocked(ownerID, venueID) {
		return ErrForbidden
	}
	venueID = s.resolveVenueIDLocked(venueID)
	member, ok := s.staffMembers[staffID]
	if !ok || member.VenueID != venueID {
		return ErrNotFound
	}
	delete(s.staffMembers, staffID)
	return nil
}

func (s *MemoryStore) ToggleStaffShift(ownerID, venueID, staffID string, onShift *bool) (models.StaffMember, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	defer s.persistBestEffortLocked()

	if !s.ownerCanManageVenueLocked(ownerID, venueID) {
		return models.StaffMember{}, ErrForbidden
	}
	venueID = s.resolveVenueIDLocked(venueID)
	member, ok := s.staffMembers[staffID]
	if !ok || member.VenueID != venueID {
		return models.StaffMember{}, ErrNotFound
	}
	if onShift != nil {
		member.OnShift = *onShift
	} else {
		member.OnShift = !member.OnShift
	}
	s.staffMembers[staffID] = member
	return member, nil
}

func (s *MemoryStore) ListStaff(ownerID, venueID string) ([]models.StaffMember, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	if !s.ownerCanManageVenueLocked(ownerID, venueID) {
		return nil, ErrForbidden
	}
	venueID = s.resolveVenueIDLocked(venueID)
	out := make([]models.StaffMember, 0)
	for _, member := range s.staffMembers {
		if member.VenueID == venueID {
			if member.Name == "" && member.UserID != "" {
				if u, ok := s.users[member.UserID]; ok && u.DisplayName != "" {
					member.Name = u.DisplayName
				}
			}
			out = append(out, member)
		}
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i].Role != out[j].Role {
			return out[i].Role < out[j].Role
		}
		if out[i].Name != out[j].Name {
			return out[i].Name < out[j].Name
		}
		return out[i].ID < out[j].ID
	})
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

type WorkShiftInput struct {
	StaffID   string `json:"staff_id"`
	Date      string `json:"date"`
	StartTime string `json:"start_time"`
	EndTime   string `json:"end_time"`
	Note      string `json:"note"`
}

type BatchWorkShiftsInput struct {
	StaffIDs  []string `json:"staff_ids"`
	Dates     []string `json:"dates"`
	StartTime string   `json:"start_time"`
	EndTime   string   `json:"end_time"`
	Note      string   `json:"note"`
}

type CopyWeekShiftsInput struct {
	SourceStartDate string `json:"source_start_date"`
	TargetStartDate string `json:"target_start_date"`
}

func parseShiftTimeMinutes(hhmm string) (int, bool) {
	parts := strings.Split(strings.TrimSpace(hhmm), ":")
	if len(parts) != 2 {
		return 0, false
	}
	h, err1 := strconv.Atoi(parts[0])
	m, err2 := strconv.Atoi(parts[1])
	if err1 != nil || err2 != nil || h < 0 || h > 23 || m < 0 || m > 59 {
		return 0, false
	}
	return h*60 + m, true
}

func shiftsTimeOverlap(startA, endA, startB, endB string) bool {
	s1, ok1 := parseShiftTimeMinutes(startA)
	e1, ok2 := parseShiftTimeMinutes(endA)
	s2, ok3 := parseShiftTimeMinutes(startB)
	e2, ok4 := parseShiftTimeMinutes(endB)
	if !ok1 || !ok2 || !ok3 || !ok4 {
		return true
	}
	if e1 <= s1 {
		e1 += 24 * 60
	}
	if e2 <= s2 {
		e2 += 24 * 60
	}
	return s1 < e2 && s2 < e1
}

func (s *MemoryStore) hasShiftConflictLocked(venueID, staffID, date, startTime, endTime, excludeShiftID string) bool {
	for _, existing := range s.shifts {
		if existing.ID == excludeShiftID {
			continue
		}
		if existing.VenueID != venueID || existing.StaffID != staffID || existing.Date != date {
			continue
		}
		if existing.Status != models.ShiftStatusConfirmed && existing.Status != models.ShiftStatusPending {
			continue
		}
		if shiftsTimeOverlap(startTime, endTime, existing.StartTime, existing.EndTime) {
			return true
		}
	}
	return false
}

func (s *MemoryStore) BatchCreateWorkShifts(ownerID, venueID string, input BatchWorkShiftsInput) ([]models.WorkShift, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	defer s.persistBestEffortLocked()

	if !s.ownerCanManageVenueLocked(ownerID, venueID) {
		return nil, ErrForbidden
	}
	venueID = s.resolveVenueIDLocked(venueID)
	startTime := strings.TrimSpace(input.StartTime)
	endTime := strings.TrimSpace(input.EndTime)
	if startTime == "" || endTime == "" || len(input.StaffIDs) == 0 || len(input.Dates) == 0 {
		return nil, ErrBadRequest
	}

	created := make([]models.WorkShift, 0, len(input.StaffIDs)*len(input.Dates))
	skippedConflicts := 0
	for _, staffID := range input.StaffIDs {
		member, ok := s.staffMembers[strings.TrimSpace(staffID)]
		if !ok || member.VenueID != venueID {
			continue
		}
		displayName := member.Name
		if displayName == "" {
			displayName = member.Email
		}
		role := member.Role
		if role == "" {
			role = models.StaffRoleWaiter
		}
		for _, date := range input.Dates {
			d := strings.TrimSpace(date)
			if d == "" {
				continue
			}
			if s.hasShiftConflictLocked(venueID, member.ID, d, startTime, endTime, "") {
				skippedConflicts++
				continue
			}
			shift := models.WorkShift{
				ID:        uuid.NewString(),
				VenueID:   venueID,
				StaffID:   member.ID,
				StaffName: displayName,
				Role:      role,
				Date:      d,
				StartTime: startTime,
				EndTime:   endTime,
				Status:    models.ShiftStatusPending,
				Note:      strings.TrimSpace(input.Note),
				CreatedAt: time.Now().UTC(),
				UpdatedAt: time.Now().UTC(),
			}
			s.shifts[shift.ID] = shift
			created = append(created, shift)
		}
	}
	if len(created) == 0 && skippedConflicts > 0 {
		return nil, ErrConflict
	}
	return created, nil
}

func (s *MemoryStore) CopyWeekWorkShifts(ownerID, venueID string, input CopyWeekShiftsInput) ([]models.WorkShift, int, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	defer s.persistBestEffortLocked()

	if !s.ownerCanManageVenueLocked(ownerID, venueID) {
		return nil, 0, ErrForbidden
	}
	venueID = s.resolveVenueIDLocked(venueID)

	srcStart, err1 := time.Parse("2006-01-02", strings.TrimSpace(input.SourceStartDate))
	dstStart, err2 := time.Parse("2006-01-02", strings.TrimSpace(input.TargetStartDate))
	if err1 != nil || err2 != nil {
		return nil, 0, ErrBadRequest
	}

	// Collect active source week shifts
	type candidate struct {
		shift      models.WorkShift
		targetDate string
	}
	candidates := make([]candidate, 0)
	for _, shift := range s.shifts {
		if shift.VenueID != venueID || shift.Status == models.ShiftStatusDeclined {
			continue
		}
		shiftDate, err := time.Parse("2006-01-02", shift.Date)
		if err != nil {
			continue
		}
		dayDiff := int(shiftDate.Sub(srcStart).Hours() / 24)
		if dayDiff < 0 || dayDiff > 6 {
			continue
		}
		// Ensure staff member still exists in venue
		member, ok := s.staffMembers[shift.StaffID]
		if !ok || member.VenueID != venueID {
			continue
		}
		targetDate := dstStart.AddDate(0, 0, dayDiff).Format("2006-01-02")
		candidates = append(candidates, candidate{shift: shift, targetDate: targetDate})
	}

	if len(candidates) == 0 {
		return []models.WorkShift{}, 0, nil
	}

	created := make([]models.WorkShift, 0, len(candidates))
	skipped := 0
	for _, c := range candidates {
		if s.hasShiftConflictLocked(venueID, c.shift.StaffID, c.targetDate, c.shift.StartTime, c.shift.EndTime, "") {
			skipped++
			continue
		}
		member := s.staffMembers[c.shift.StaffID]
		displayName := member.Name
		if displayName == "" {
			displayName = member.Email
		}
		role := member.Role
		if role == "" {
			role = c.shift.Role
		}
		newShift := models.WorkShift{
			ID:        uuid.NewString(),
			VenueID:   venueID,
			StaffID:   c.shift.StaffID,
			StaffName: displayName,
			Role:      role,
			Date:      c.targetDate,
			StartTime: c.shift.StartTime,
			EndTime:   c.shift.EndTime,
			Status:    models.ShiftStatusPending,
			Note:      c.shift.Note,
			CreatedAt: time.Now().UTC(),
			UpdatedAt: time.Now().UTC(),
		}
		s.shifts[newShift.ID] = newShift
		created = append(created, newShift)
	}

	if len(created) == 0 && skipped > 0 {
		return nil, skipped, ErrConflict
	}
	return created, skipped, nil
}

func (s *MemoryStore) CreateWorkShift(ownerID, venueID string, input WorkShiftInput) (models.WorkShift, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	defer s.persistBestEffortLocked()

	if !s.ownerCanManageVenueLocked(ownerID, venueID) {
		return models.WorkShift{}, ErrForbidden
	}
	venueID = s.resolveVenueIDLocked(venueID)
	staffID := strings.TrimSpace(input.StaffID)
	member, ok := s.staffMembers[staffID]
	if !ok || member.VenueID != venueID {
		return models.WorkShift{}, ErrBadRequest
	}
	date := strings.TrimSpace(input.Date)
	if date == "" {
		return models.WorkShift{}, ErrBadRequest
	}
	startTime := strings.TrimSpace(input.StartTime)
	endTime := strings.TrimSpace(input.EndTime)
	if startTime == "" || endTime == "" {
		return models.WorkShift{}, ErrBadRequest
	}
	if s.hasShiftConflictLocked(venueID, member.ID, date, startTime, endTime, "") {
		return models.WorkShift{}, ErrConflict
	}
	displayName := member.Name
	if displayName == "" {
		displayName = member.Email
	}
	role := member.Role
	if role == "" {
		role = models.StaffRoleWaiter
	}
	shift := models.WorkShift{
		ID:        uuid.NewString(),
		VenueID:   venueID,
		StaffID:   member.ID,
		StaffName: displayName,
		Role:      role,
		Date:      date,
		StartTime: startTime,
		EndTime:   endTime,
		Status:    models.ShiftStatusPending,
		Note:      strings.TrimSpace(input.Note),
		CreatedAt: time.Now().UTC(),
		UpdatedAt: time.Now().UTC(),
	}
	s.shifts[shift.ID] = shift
	return shift, nil
}

func (s *MemoryStore) ListWorkShifts(ownerID, venueID string, roleFilter ...string) ([]models.WorkShift, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	if !s.ownerCanManageVenueLocked(ownerID, venueID) {
		user, ok := s.users[ownerID]
		if !ok || (user.Role != models.RoleAdmin && user.Role != models.RoleStaff) {
			return nil, ErrForbidden
		}
	}
	venueID = s.resolveVenueIDLocked(venueID)
	filter := ""
	if len(roleFilter) > 0 && roleFilter[0] != "" && roleFilter[0] != "all" {
		filter = strings.ToLower(strings.TrimSpace(roleFilter[0]))
	}
	out := make([]models.WorkShift, 0)
	for _, shift := range s.shifts {
		if shift.VenueID == venueID {
			if filter != "" && strings.ToLower(shift.Role) != filter {
				continue
			}
			out = append(out, shift)
		}
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i].Date == out[j].Date {
			return out[i].StartTime < out[j].StartTime
		}
		return out[i].Date < out[j].Date
	})
	return out, nil
}

func (s *MemoryStore) DeleteWorkShift(ownerID, venueID, shiftID string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	defer s.persistBestEffortLocked()

	if !s.ownerCanManageVenueLocked(ownerID, venueID) {
		return ErrForbidden
	}
	venueID = s.resolveVenueIDLocked(venueID)
	shift, ok := s.shifts[shiftID]
	if !ok || shift.VenueID != venueID {
		return ErrNotFound
	}
	delete(s.shifts, shiftID)
	return nil
}

func (s *MemoryStore) ListMyStaffShifts(userID string) ([]models.WorkShift, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	user, ok := s.users[userID]
	if !ok {
		return nil, ErrNotFound
	}
	myStaffIDs := map[string]struct{}{}
	for id, member := range s.staffMembers {
		if member.UserID == userID || strings.EqualFold(member.Email, user.Email) {
			myStaffIDs[id] = struct{}{}
		}
	}
	out := make([]models.WorkShift, 0)
	for _, shift := range s.shifts {
		if _, matches := myStaffIDs[shift.StaffID]; matches {
			out = append(out, shift)
		}
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i].Date == out[j].Date {
			return out[i].StartTime < out[j].StartTime
		}
		return out[i].Date < out[j].Date
	})
	return out, nil
}

func (s *MemoryStore) RespondToWorkShift(userID, shiftID, response string, reason ...string) (models.WorkShift, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	defer s.persistBestEffortLocked()

	user, ok := s.users[userID]
	if !ok {
		return models.WorkShift{}, ErrNotFound
	}
	resp := strings.ToUpper(strings.TrimSpace(response))
	if resp != models.ShiftStatusConfirmed && resp != models.ShiftStatusDeclined && resp != models.ShiftStatusSwapRequested {
		return models.WorkShift{}, ErrBadRequest
	}
	shift, ok := s.shifts[shiftID]
	if !ok {
		return models.WorkShift{}, ErrNotFound
	}
	member, isMember := s.staffMembers[shift.StaffID]
	isOwner := s.ownerCanManageVenueLocked(userID, shift.VenueID)
	isAdmin := user.Role == models.RoleAdmin
	isAssignedStaff := isMember && (member.UserID == userID || strings.EqualFold(member.Email, user.Email))

	if !isAssignedStaff && !isOwner && !isAdmin {
		return models.WorkShift{}, ErrForbidden
	}

	shift.Status = resp
	if len(reason) > 0 && strings.TrimSpace(reason[0]) != "" {
		shift.Reason = strings.TrimSpace(reason[0])
	}
	shift.UpdatedAt = time.Now().UTC()
	s.shifts[shiftID] = shift
	return shift, nil
}

func (s *MemoryStore) SwapWorkShift(ownerID, venueID, shiftID, newStaffID string) (models.WorkShift, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	defer s.persistBestEffortLocked()

	if !s.ownerCanManageVenueLocked(ownerID, venueID) {
		return models.WorkShift{}, ErrForbidden
	}
	venueID = s.resolveVenueIDLocked(venueID)
	shift, ok := s.shifts[shiftID]
	if !ok || shift.VenueID != venueID {
		return models.WorkShift{}, ErrNotFound
	}
	newMember, ok := s.staffMembers[newStaffID]
	if !ok || newMember.VenueID != venueID {
		return models.WorkShift{}, ErrBadRequest
	}
	if newMember.ID == shift.StaffID {
		return models.WorkShift{}, ErrBadRequest
	}
	if s.hasShiftConflictLocked(venueID, newMember.ID, shift.Date, shift.StartTime, shift.EndTime, shift.ID) {
		return models.WorkShift{}, ErrConflict
	}
	displayName := newMember.Name
	if displayName == "" {
		displayName = newMember.Email
	}
	role := newMember.Role
	if role == "" {
		role = shift.Role
	}
	shift.StaffID = newMember.ID
	shift.StaffName = displayName
	shift.Role = role
	shift.Status = models.ShiftStatusPending
	shift.Reason = "" // reset reason after replacement
	shift.UpdatedAt = time.Now().UTC()
	s.shifts[shiftID] = shift
	return shift, nil
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
