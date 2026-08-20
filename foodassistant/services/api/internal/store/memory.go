package store

import (
	"errors"
	"strings"
	"sync"
	"time"

	"github.com/foodassistant/api/internal/models"
	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"
)

var (
	ErrNotFound       = errors.New("not found")
	ErrEmailTaken     = errors.New("email already registered")
	ErrInvalidCreds   = errors.New("invalid credentials")
	ErrTableNotFree   = errors.New("table not free")
	ErrInvalidQR      = errors.New("invalid qr token")
	ErrBadRequest     = errors.New("bad request")
	ErrForbidden      = errors.New("forbidden")
	ErrConflict       = errors.New("conflict")
	ErrSessionClosed  = errors.New("session closed")
	ErrInvalidStatus  = errors.New("invalid status")
)

type OrderItemInput struct {
	MenuItemID string `json:"menu_item_id"`
	Qty        int    `json:"qty"`
}

type UserProfileUpdate struct {
	FirstName   *string
	LastName    *string
	DisplayName *string
	Phone       *string
	Locale      *string
}

type MemoryStore struct {
	mu           sync.RWMutex
	cities       map[string]models.City
	venues       map[string]models.Venue
	tables       map[string]models.Table
	users        map[string]models.User
	reservations map[string]models.Reservation
	watches      map[string]models.TableWatch
	sessions     map[string]models.Session
	menuItems    map[string]models.MenuItem
	orders       map[string]models.Order
	waiterCalls  map[string]models.WaiterCall
	collections  map[string]models.HolidayCollection
}

func NewMemory() *MemoryStore {
	s := &MemoryStore{
		cities:       make(map[string]models.City),
		venues:       make(map[string]models.Venue),
		tables:       make(map[string]models.Table),
		users:        make(map[string]models.User),
		reservations: make(map[string]models.Reservation),
		watches:      make(map[string]models.TableWatch),
		sessions:     make(map[string]models.Session),
		menuItems:    make(map[string]models.MenuItem),
		orders:       make(map[string]models.Order),
		waiterCalls:  make(map[string]models.WaiterCall),
		collections:  make(map[string]models.HolidayCollection),
	}
	s.seed()
	return s
}

func (s *MemoryStore) seed() {
	balti := models.City{
		ID:        "city-balti",
		Slug:      "balti",
		Name:      models.LocalizedString{RU: "Бельцы", EN: "Bălți", RO: "Bălți"},
		Available: true,
		Country:   "MD",
	}
	s.cities[balti.ID] = balti
	s.cities["city-chisinau"] = models.City{
		ID: "city-chisinau", Slug: "chisinau",
		Name:      models.LocalizedString{RU: "Кишинёв", EN: "Chișinău", RO: "Chișinău"},
		Available: false, Country: "MD",
	}
	s.cities["city-cahul"] = models.City{
		ID: "city-cahul", Slug: "cahul",
		Name:      models.LocalizedString{RU: "Кагул", EN: "Cahul", RO: "Cahul"},
		Available: false, Country: "MD",
	}

	venues := []models.Venue{
		{
			ID: "venue-1", CityID: balti.ID,
			Name: models.LocalizedString{RU: "La Plăcinte", EN: "La Plăcinte", RO: "La Plăcinte"},
			Description: models.LocalizedString{
				RU: "Молдавская кухня и выпечка в центре Бельц",
				EN: "Moldovan cuisine and pastries in central Bălți",
				RO: "Bucătărie moldovenească și plăcinte în centrul Bălțiului",
			},
			Cuisine: []string{"moldovan", "bakery"}, Rating: 4.8, PriceLevel: 2,
			Address:             models.LocalizedString{RU: "ул. Независимости 45", EN: "Independenței 45", RO: "Independenței 45"},
			Lat: 47.7617, Lng: 27.9288, AverageCheck: 250, OpenNow: true,
			ImageURL: "/images/venues/la-placinte.jpg", AlcoholLicense: true,
			SessionStartBeforeMin: 15, ReleaseBeforeMin: 10,
		},
		{
			ID: "venue-2", CityID: balti.ID,
			Name: models.LocalizedString{RU: "Cafe Central", EN: "Cafe Central", RO: "Cafe Central"},
			Description: models.LocalizedString{
				RU: "Кофе, завтраки и лёгкий обед",
				EN: "Coffee, breakfast and light lunch",
				RO: "Cafea, mic dejun și prânz ușor",
			},
			Cuisine: []string{"cafe", "european"}, Rating: 4.5, PriceLevel: 1,
			Address:             models.LocalizedString{RU: "пл. Василия Лупу 1", EN: "Vasile Lupu Sq 1", RO: "Piața Vasile Lupu 1"},
			Lat: 47.7631, Lng: 27.9299, AverageCheck: 180, OpenNow: true,
			ImageURL: "/images/venues/cafe-central.jpg", AlcoholLicense: false,
			SessionStartBeforeMin: 10, ReleaseBeforeMin: 10,
		},
		{
			ID: "venue-3", CityID: balti.ID,
			Name: models.LocalizedString{RU: "Steak House Balti", EN: "Steak House Balti", RO: "Steak House Balti"},
			Description: models.LocalizedString{
				RU: "Стейки и вечерняя атмосфера",
				EN: "Steaks and evening atmosphere",
				RO: "Steak-uri și atmosferă de seară",
			},
			Cuisine: []string{"steak", "grill"}, Rating: 4.6, PriceLevel: 3,
			Address:             models.LocalizedString{RU: "ул. Штефана чел Маре 12", EN: "Ștefan cel Mare 12", RO: "Ștefan cel Mare 12"},
			Lat: 47.7598, Lng: 27.9255, AverageCheck: 450, OpenNow: true,
			ImageURL: "/images/venues/steak-house.jpg", AlcoholLicense: true,
			SessionStartBeforeMin: 20, ReleaseBeforeMin: 15,
		},
	}
	for _, v := range venues {
		s.venues[v.ID] = v
	}

	now := time.Now()
	occupied := now.Add(-40 * time.Minute)
	reserved := now.Add(45 * time.Minute)

	tables := []models.Table{
		{ID: "t1", VenueID: "venue-1", Number: 1, Seats: 2, Status: models.TableFree, X: 0.2, Y: 0.3},
		{ID: "t2", VenueID: "venue-1", Number: 2, Seats: 4, Status: models.TableFree, X: 0.5, Y: 0.3},
		{ID: "t3", VenueID: "venue-1", Number: 3, Seats: 4, Status: models.TableOccupied, OccupiedSince: &occupied, X: 0.8, Y: 0.3},
		{ID: "t4", VenueID: "venue-1", Number: 4, Seats: 6, Status: models.TableReserved, ReservedFor: &reserved, X: 0.35, Y: 0.65},
		{ID: "t5", VenueID: "venue-1", Number: 5, Seats: 2, Status: models.TableFree, X: 0.65, Y: 0.65},
		{ID: "t6", VenueID: "venue-2", Number: 1, Seats: 2, Status: models.TableFree, X: 0.3, Y: 0.4},
		{ID: "t7", VenueID: "venue-2", Number: 2, Seats: 2, Status: models.TableFree, X: 0.6, Y: 0.4},
		{ID: "t8", VenueID: "venue-2", Number: 3, Seats: 4, Status: models.TableFree, X: 0.45, Y: 0.7},
		{ID: "t9", VenueID: "venue-2", Number: 4, Seats: 2, Status: models.TableOccupied, OccupiedSince: &occupied, X: 0.75, Y: 0.7},
		{ID: "t10", VenueID: "venue-2", Number: 5, Seats: 6, Status: models.TableFree, X: 0.2, Y: 0.75},
		{ID: "t11", VenueID: "venue-3", Number: 1, Seats: 4, Status: models.TableOccupied, OccupiedSince: &occupied, X: 0.4, Y: 0.5},
		{ID: "t12", VenueID: "venue-3", Number: 2, Seats: 2, Status: models.TableFree, X: 0.7, Y: 0.5},
	}
	for _, t := range tables {
		s.tables[t.ID] = t
	}
	for id := range s.venues {
		s.refreshFreeTablesLocked(id)
	}

	menu := []models.MenuItem{
		{
			ID: "m1", VenueID: "venue-1",
			Category:    models.LocalizedString{RU: "Выпечка", EN: "Pastries", RO: "Patiserie"},
			Name:        models.LocalizedString{RU: "Плацинда с сыром", EN: "Cheese plăcintă", RO: "Plăcintă cu brânză"},
			Description: models.LocalizedString{RU: "Классическая молдавская плацинда", EN: "Classic Moldovan pastry", RO: "Plăcintă moldovenească clasică"},
			Price: 45,
		},
		{
			ID: "m2", VenueID: "venue-1",
			Category:    models.LocalizedString{RU: "Супы", EN: "Soups", RO: "Supe"},
			Name:        models.LocalizedString{RU: "Зеленый борщ", EN: "Green borscht", RO: "Borș verde"},
			Description: models.LocalizedString{RU: "С щавелем и яйцом", EN: "With sorrel and egg", RO: "Cu măcriș și ou"},
			Price: 65,
		},
		{
			ID: "m3", VenueID: "venue-1",
			Category:    models.LocalizedString{RU: "Напитки", EN: "Drinks", RO: "Băuturi"},
			Name:        models.LocalizedString{RU: "Домашний компот", EN: "Homemade compote", RO: "Compot de casă"},
			Description: models.LocalizedString{RU: "Сезонные фрукты", EN: "Seasonal fruits", RO: "Fructe de sezon"},
			Price: 25,
		},
		{
			ID: "m4", VenueID: "venue-2",
			Category:    models.LocalizedString{RU: "Кофе", EN: "Coffee", RO: "Cafea"},
			Name:        models.LocalizedString{RU: "Капучино", EN: "Cappuccino", RO: "Cappuccino"},
			Description: models.LocalizedString{RU: "Двойной эспрессо с молоком", EN: "Double espresso with milk", RO: "Espresso dublu cu lapte"},
			Price: 40,
		},
		{
			ID: "m5", VenueID: "venue-2",
			Category:    models.LocalizedString{RU: "Завтраки", EN: "Breakfast", RO: "Mic dejun"},
			Name:        models.LocalizedString{RU: "Авокадо тост", EN: "Avocado toast", RO: "Toast cu avocado"},
			Description: models.LocalizedString{RU: "На зерновом хлебе", EN: "On wholegrain bread", RO: "Pe pâine integrală"},
			Price: 75,
		},
		{
			ID: "m6", VenueID: "venue-2",
			Category:    models.LocalizedString{RU: "Десерты", EN: "Desserts", RO: "Deserturi"},
			Name:        models.LocalizedString{RU: "Чизкейк", EN: "Cheesecake", RO: "Cheesecake"},
			Description: models.LocalizedString{RU: "Нью-Йорк стиль", EN: "New York style", RO: "Stil New York"},
			Price: 55,
		},
		{
			ID: "m7", VenueID: "venue-3",
			Category:    models.LocalizedString{RU: "Стейки", EN: "Steaks", RO: "Steak-uri"},
			Name:        models.LocalizedString{RU: "Рибай 300г", EN: "Ribeye 300g", RO: "Ribeye 300g"},
			Description: models.LocalizedString{RU: "На гриле, medium rare", EN: "Grilled, medium rare", RO: "La grătar, medium rare"},
			Price: 320,
		},
		{
			ID: "m8", VenueID: "venue-3",
			Category:    models.LocalizedString{RU: "Гарниры", EN: "Sides", RO: "Garnituri"},
			Name:        models.LocalizedString{RU: "Картофель фри", EN: "French fries", RO: "Cartofi prăjiți"},
			Description: models.LocalizedString{RU: "С соусом", EN: "With sauce", RO: "Cu sos"},
			Price: 45,
		},
		{
			ID: "m9", VenueID: "venue-3",
			Category:    models.LocalizedString{RU: "Напитки", EN: "Drinks", RO: "Băuturi"},
			Name:        models.LocalizedString{RU: "Красное вино бокал", EN: "Red wine glass", RO: "Vin roșu pahar"},
			Description: models.LocalizedString{RU: "Местное вино", EN: "Local wine", RO: "Vin local"},
			Price: 80, ContainsAlcohol: true,
		},
	}
	for _, m := range menu {
		s.menuItems[m.ID] = m
	}

	s.collections["col-easter"] = models.HolidayCollection{
		ID: "col-easter", Slug: "easter",
		Title:    models.LocalizedString{RU: "Пасхальный стол", EN: "Easter table", RO: "Masa de Paște"},
		VenueIDs: []string{"venue-1", "venue-2"},
	}
	s.collections["col-date-night"] = models.HolidayCollection{
		ID: "col-date-night", Slug: "date-night",
		Title:    models.LocalizedString{RU: "Романтический вечер", EN: "Date night", RO: "Seară romantică"},
		VenueIDs: []string{"venue-3"},
	}
	s.collections["col-family"] = models.HolidayCollection{
		ID: "col-family", Slug: "family",
		Title:    models.LocalizedString{RU: "Семейный обед", EN: "Family lunch", RO: "Prânz în familie"},
		VenueIDs: []string{"venue-1", "venue-2", "venue-3"},
	}
}

func (s *MemoryStore) refreshFreeTablesLocked(venueID string) {
	v, ok := s.venues[venueID]
	if !ok {
		return
	}
	count := 0
	for _, t := range s.tables {
		if t.VenueID == venueID && t.Status == models.TableFree {
			count++
		}
	}
	v.FreeTables = count
	s.venues[venueID] = v
}

func (s *MemoryStore) ListCities() []models.City {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := make([]models.City, 0, len(s.cities))
	for _, c := range s.cities {
		out = append(out, c)
	}
	return out
}

func (s *MemoryStore) ListVenues(cityID string) []models.Venue {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := make([]models.Venue, 0)
	for _, v := range s.venues {
		if cityID == "" || v.CityID == cityID {
			out = append(out, v)
		}
	}
	return out
}

func (s *MemoryStore) GetVenue(id string) (models.Venue, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	v, ok := s.venues[id]
	if !ok {
		return models.Venue{}, ErrNotFound
	}
	return v, nil
}

func (s *MemoryStore) ListTables(venueID string) []models.Table {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := make([]models.Table, 0)
	for _, t := range s.tables {
		if t.VenueID == venueID {
			out = append(out, t)
		}
	}
	return out
}

func (s *MemoryStore) Register(email, password, firstName, lastName, locale string) (models.User, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	for _, u := range s.users {
		if strings.EqualFold(u.Email, email) {
			return models.User{}, ErrEmailTaken
		}
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return models.User{}, err
	}
	if locale == "" {
		locale = "ru"
	}
	display := strings.TrimSpace(firstName + " " + lastName)
	if display == "" {
		display = email
	}

	u := models.User{
		ID:           uuid.NewString(),
		Email:        email,
		PasswordHash: string(hash),
		FirstName:    firstName,
		LastName:     lastName,
		DisplayName:  display,
		Locale:       locale,
		CreatedAt:    time.Now().UTC(),
	}
	s.users[u.ID] = u
	return u, nil
}

func (s *MemoryStore) Authenticate(email, password string) (models.User, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	var found *models.User
	for _, u := range s.users {
		if strings.EqualFold(u.Email, email) {
			uu := u
			found = &uu
			break
		}
	}
	if found == nil {
		return models.User{}, ErrInvalidCreds
	}
	if err := bcrypt.CompareHashAndPassword([]byte(found.PasswordHash), []byte(password)); err != nil {
		return models.User{}, ErrInvalidCreds
	}
	return *found, nil
}

func (s *MemoryStore) GetUser(id string) (models.User, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	u, ok := s.users[id]
	if !ok {
		return models.User{}, ErrNotFound
	}
	return u, nil
}

func (s *MemoryStore) UpdateUser(id string, patch UserProfileUpdate) (models.User, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	u, ok := s.users[id]
	if !ok {
		return models.User{}, ErrNotFound
	}
	if patch.FirstName != nil {
		u.FirstName = *patch.FirstName
	}
	if patch.LastName != nil {
		u.LastName = *patch.LastName
	}
	if patch.DisplayName != nil {
		u.DisplayName = *patch.DisplayName
	}
	if patch.Phone != nil {
		u.Phone = *patch.Phone
	}
	if patch.Locale != nil && *patch.Locale != "" {
		u.Locale = *patch.Locale
	}
	s.users[id] = u
	return u, nil
}

func (s *MemoryStore) CreateReservation(userID, venueID, tableID string, guests int, reservedFor time.Time) (models.Reservation, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if _, ok := s.users[userID]; !ok {
		return models.Reservation{}, ErrNotFound
	}
	if _, ok := s.venues[venueID]; !ok {
		return models.Reservation{}, ErrNotFound
	}
	t, ok := s.tables[tableID]
	if !ok || t.VenueID != venueID {
		return models.Reservation{}, ErrNotFound
	}
	if guests < 1 {
		return models.Reservation{}, ErrBadRequest
	}
	if t.Status != models.TableFree {
		return models.Reservation{}, ErrTableNotFree
	}

	id := uuid.NewString()
	res := models.Reservation{
		ID:          id,
		UserID:      userID,
		VenueID:     venueID,
		TableID:     tableID,
		Guests:      guests,
		ReservedFor: reservedFor,
		Status:      models.ReservationConfirmed,
		CreatedAt:   time.Now().UTC(),
	}
	rf := reservedFor
	t.Status = models.TableReserved
	t.ReservedFor = &rf
	t.ReservationID = &id
	s.tables[tableID] = t
	s.reservations[id] = res
	s.refreshFreeTablesLocked(venueID)
	return res, nil
}

func (s *MemoryStore) ConfirmArrival(userID, reservationID string) (models.Reservation, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	r, ok := s.reservations[reservationID]
	if !ok {
		return models.Reservation{}, ErrNotFound
	}
	if r.UserID != userID {
		return models.Reservation{}, ErrForbidden
	}
	if r.Status != models.ReservationConfirmed {
		return models.Reservation{}, ErrConflict
	}
	now := time.Now().UTC()
	r.ArrivalConfirmedAt = &now
	s.reservations[reservationID] = r
	return r, nil
}

func (s *MemoryStore) CancelReservation(userID, reservationID string) (models.Reservation, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	r, ok := s.reservations[reservationID]
	if !ok {
		return models.Reservation{}, ErrNotFound
	}
	if r.UserID != userID {
		return models.Reservation{}, ErrForbidden
	}
	if r.Status == models.ReservationCancelled || r.Status == models.ReservationCheckedIn {
		return models.Reservation{}, ErrConflict
	}

	r.Status = models.ReservationCancelled
	s.reservations[reservationID] = r

	if t, ok := s.tables[r.TableID]; ok {
		if t.ReservationID != nil && *t.ReservationID == reservationID {
			t.Status = models.TableFree
			t.ReservedFor = nil
			t.ReservationID = nil
			s.tables[r.TableID] = t
			s.refreshFreeTablesLocked(r.VenueID)
		}
	}
	return r, nil
}

func (s *MemoryStore) ListReservations(userID string) []models.Reservation {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := make([]models.Reservation, 0)
	for _, r := range s.reservations {
		if r.UserID == userID {
			out = append(out, r)
		}
	}
	return out
}

func (s *MemoryStore) CreateTableWatch(userID, venueID, tableID string) (models.TableWatch, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if _, ok := s.users[userID]; !ok {
		return models.TableWatch{}, ErrNotFound
	}
	if _, ok := s.venues[venueID]; !ok {
		return models.TableWatch{}, ErrNotFound
	}
	t, ok := s.tables[tableID]
	if !ok || t.VenueID != venueID {
		return models.TableWatch{}, ErrNotFound
	}

	now := time.Now().UTC()
	w := models.TableWatch{
		ID:        uuid.NewString(),
		UserID:    userID,
		VenueID:   venueID,
		TableID:   tableID,
		CreatedAt: now,
		ExpiresAt: now.Add(2 * time.Hour),
	}
	s.watches[w.ID] = w
	return w, nil
}

func (s *MemoryStore) ScanQR(userID, venueID, tableID, token string) (models.Session, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	// MVP: accept any non-empty token (including "demo")
	if strings.TrimSpace(token) == "" {
		return models.Session{}, ErrInvalidQR
	}

	if _, ok := s.users[userID]; !ok {
		return models.Session{}, ErrNotFound
	}
	if _, ok := s.venues[venueID]; !ok {
		return models.Session{}, ErrNotFound
	}
	t, ok := s.tables[tableID]
	if !ok || t.VenueID != venueID {
		return models.Session{}, ErrNotFound
	}

	var reservationID *string
	now := time.Now().UTC()

	switch t.Status {
	case models.TableFree:
		// walk-in
	case models.TableReserved:
		if t.ReservationID == nil {
			return models.Session{}, ErrConflict
		}
		r, ok := s.reservations[*t.ReservationID]
		if !ok || r.UserID != userID {
			return models.Session{}, ErrForbidden
		}
		if r.Status != models.ReservationConfirmed {
			return models.Session{}, ErrConflict
		}
		r.Status = models.ReservationCheckedIn
		s.reservations[r.ID] = r
		rid := r.ID
		reservationID = &rid
	default:
		return models.Session{}, ErrConflict
	}

	sess := models.Session{
		ID:            uuid.NewString(),
		UserID:        userID,
		VenueID:       venueID,
		TableID:       tableID,
		ReservationID: reservationID,
		Status:        models.SessionActive,
		StartedAt:     now,
	}
	s.sessions[sess.ID] = sess

	t.Status = models.TableOccupied
	t.OccupiedSince = &now
	t.ReservedFor = nil
	s.tables[tableID] = t
	s.refreshFreeTablesLocked(venueID)

	return sess, nil
}

func (s *MemoryStore) GetSession(id string) (models.Session, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	sess, ok := s.sessions[id]
	if !ok {
		return models.Session{}, ErrNotFound
	}
	return sess, nil
}

func (s *MemoryStore) CloseSession(userID, sessionID string) (models.Session, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	sess, ok := s.sessions[sessionID]
	if !ok {
		return models.Session{}, ErrNotFound
	}
	if sess.UserID != userID {
		return models.Session{}, ErrForbidden
	}
	if sess.Status != models.SessionActive {
		return models.Session{}, ErrSessionClosed
	}

	now := time.Now().UTC()
	sess.Status = models.SessionClosed
	sess.ClosedAt = &now
	s.sessions[sessionID] = sess

	if t, ok := s.tables[sess.TableID]; ok {
		t.Status = models.TableCleaning
		t.OccupiedSince = nil
		t.ReservationID = nil
		s.tables[sess.TableID] = t
		// MVP: free immediately after cleaning mark
		t.Status = models.TableFree
		s.tables[sess.TableID] = t
		s.refreshFreeTablesLocked(sess.VenueID)
	}
	return sess, nil
}

func (s *MemoryStore) ListMenu(venueID string) ([]models.MenuItem, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	if _, ok := s.venues[venueID]; !ok {
		return nil, ErrNotFound
	}
	out := make([]models.MenuItem, 0)
	for _, m := range s.menuItems {
		if m.VenueID == venueID {
			out = append(out, m)
		}
	}
	return out, nil
}

func (s *MemoryStore) CreateOrder(sessionID, userID string, items []OrderItemInput) (models.Order, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	sess, ok := s.sessions[sessionID]
	if !ok {
		return models.Order{}, ErrNotFound
	}
	if sess.UserID != userID {
		return models.Order{}, ErrForbidden
	}
	if sess.Status != models.SessionActive {
		return models.Order{}, ErrSessionClosed
	}
	if len(items) == 0 {
		return models.Order{}, ErrBadRequest
	}

	orderItems := make([]models.OrderItem, 0, len(items))
	total := 0
	for _, in := range items {
		if in.Qty < 1 {
			return models.Order{}, ErrBadRequest
		}
		mi, ok := s.menuItems[in.MenuItemID]
		if !ok || mi.VenueID != sess.VenueID {
			return models.Order{}, ErrNotFound
		}
		orderItems = append(orderItems, models.OrderItem{
			MenuItemID: mi.ID,
			Name:       mi.Name,
			Qty:        in.Qty,
			Price:      mi.Price,
		})
		total += mi.Price * in.Qty
	}

	now := time.Now().UTC()
	o := models.Order{
		ID:        uuid.NewString(),
		SessionID: sessionID,
		UserID:    userID,
		VenueID:   sess.VenueID,
		Items:     orderItems,
		Status:    models.OrderSubmitted,
		Total:     total,
		CreatedAt: now,
		UpdatedAt: now,
	}
	s.orders[o.ID] = o
	return o, nil
}

func (s *MemoryStore) ListOrders(userID string) []models.Order {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := make([]models.Order, 0)
	for _, o := range s.orders {
		if o.UserID == userID {
			out = append(out, o)
		}
	}
	return out
}

func (s *MemoryStore) GetOrder(id string) (models.Order, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	o, ok := s.orders[id]
	if !ok {
		return models.Order{}, ErrNotFound
	}
	return o, nil
}

func (s *MemoryStore) UpdateOrderStatus(orderID string, status models.OrderStatus) (models.Order, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	o, ok := s.orders[orderID]
	if !ok {
		return models.Order{}, ErrNotFound
	}
	switch status {
	case models.OrderDraft, models.OrderSubmitted, models.OrderPreparing,
		models.OrderReady, models.OrderServed, models.OrderPaid, models.OrderCancelled:
	default:
		return models.Order{}, ErrInvalidStatus
	}
	o.Status = status
	o.UpdatedAt = time.Now().UTC()
	s.orders[orderID] = o
	return o, nil
}

func (s *MemoryStore) CreateWaiterCall(sessionID string, reason models.WaiterCallReason) (models.WaiterCall, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	sess, ok := s.sessions[sessionID]
	if !ok {
		return models.WaiterCall{}, ErrNotFound
	}
	if sess.Status != models.SessionActive {
		return models.WaiterCall{}, ErrSessionClosed
	}
	switch reason {
	case models.WaiterOrder, models.WaiterBill, models.WaiterQuestion, models.WaiterOther, models.WaiterInitial:
	default:
		return models.WaiterCall{}, ErrBadRequest
	}

	wc := models.WaiterCall{
		ID:        uuid.NewString(),
		SessionID: sessionID,
		VenueID:   sess.VenueID,
		TableID:   sess.TableID,
		Reason:    reason,
		Status:    models.WaiterPending,
		CreatedAt: time.Now().UTC(),
	}
	s.waiterCalls[wc.ID] = wc
	return wc, nil
}

func (s *MemoryStore) ListWaiterCalls(venueID string) ([]models.WaiterCall, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	if venueID == "" {
		return nil, ErrBadRequest
	}
	if _, ok := s.venues[venueID]; !ok {
		return nil, ErrNotFound
	}
	out := make([]models.WaiterCall, 0)
	for _, wc := range s.waiterCalls {
		if wc.VenueID == venueID {
			out = append(out, wc)
		}
	}
	return out, nil
}

func (s *MemoryStore) AcceptWaiterCall(id string) (models.WaiterCall, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	wc, ok := s.waiterCalls[id]
	if !ok {
		return models.WaiterCall{}, ErrNotFound
	}
	if wc.Status != models.WaiterPending {
		return models.WaiterCall{}, ErrConflict
	}
	wc.Status = models.WaiterAccepted
	s.waiterCalls[id] = wc
	return wc, nil
}

func (s *MemoryStore) ListCollections() []models.HolidayCollection {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := make([]models.HolidayCollection, 0, len(s.collections))
	for _, c := range s.collections {
		out = append(out, c)
	}
	return out
}

func (s *MemoryStore) AIRecommend(query string) []models.Venue {
	s.mu.RLock()
	defer s.mu.RUnlock()

	q := strings.ToLower(strings.TrimSpace(query))
	if q == "" {
		out := make([]models.Venue, 0, len(s.venues))
		for _, v := range s.venues {
			out = append(out, v)
		}
		return out
	}

	out := make([]models.Venue, 0)
	for _, v := range s.venues {
		blob := strings.ToLower(strings.Join([]string{
			v.Name.RU, v.Name.EN, v.Name.RO,
			v.Description.RU, v.Description.EN, v.Description.RO,
			strings.Join(v.Cuisine, " "),
		}, " "))
		if strings.Contains(blob, q) {
			out = append(out, v)
			continue
		}
		for _, word := range strings.Fields(q) {
			if len(word) >= 3 && strings.Contains(blob, word) {
				out = append(out, v)
				break
			}
		}
	}
	return out
}
