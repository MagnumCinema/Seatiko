package store

import (
	"errors"
	"fmt"
	"net/mail"
	"net/url"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/foodassistant/api/internal/models"
	"github.com/foodassistant/api/internal/qr"
	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"
)

var (
	ErrNotFound      = errors.New("not found")
	ErrEmailTaken    = errors.New("email already registered")
	ErrInvalidCreds  = errors.New("invalid credentials")
	ErrTableNotFree  = errors.New("table not free")
	ErrInvalidQR     = errors.New("invalid qr token")
	ErrBadRequest    = errors.New("bad request")
	ErrForbidden     = errors.New("forbidden")
	ErrConflict      = errors.New("conflict")
	ErrSessionClosed = errors.New("session closed")
	ErrInvalidStatus = errors.New("invalid status")
)

type OrderItemInput struct {
	MenuItemID string `json:"menu_item_id"`
	Qty        int    `json:"qty"`
}

type UserProfileUpdate struct {
	FirstName       *string
	LastName        *string
	DisplayName     *string
	Phone           *string
	Locale          *string
	DietPreferences *[]string
	FavoriteVenues  *[]string
}

type ApplicationUpdate struct {
	Name         *models.LocalizedString
	Description  *models.LocalizedString
	Address      *models.LocalizedString
	Cuisine      *[]string
	Phone        *string
	Email        *string
	Website      *string
	CityID       *string
	Lat          *float64
	Lng          *float64
	PriceLevel   *int
	AverageCheck *int
	HoursText    *string
}

type MemoryStore struct {
	mu             sync.RWMutex
	dataFile       string
	qrSecret       string
	cities         map[string]models.City
	venues         map[string]models.Venue
	tables         map[string]models.Table
	users          map[string]models.User
	reservations   map[string]models.Reservation
	watches        map[string]models.TableWatch
	sessions       map[string]models.Session
	menuItems      map[string]models.MenuItem
	orders         map[string]models.Order
	waiterCalls    map[string]models.WaiterCall
	collections    map[string]models.HolidayCollection
	applications   map[string]models.VenueApplication
	activities     map[string][]models.ApplicationActivity
	staffMembers   map[string]models.StaffMember
	profileChanges map[string]models.ProfileChangeRequest
	waitlist       map[string]models.WaitlistEntry
}

func NewMemory() *MemoryStore {
	s := &MemoryStore{
		qrSecret:       "foodassistant-qr-dev-secret",
		cities:         make(map[string]models.City),
		venues:         make(map[string]models.Venue),
		tables:         make(map[string]models.Table),
		users:          make(map[string]models.User),
		reservations:   make(map[string]models.Reservation),
		watches:        make(map[string]models.TableWatch),
		sessions:       make(map[string]models.Session),
		menuItems:      make(map[string]models.MenuItem),
		orders:         make(map[string]models.Order),
		waiterCalls:    make(map[string]models.WaiterCall),
		collections:    make(map[string]models.HolidayCollection),
		applications:   make(map[string]models.VenueApplication),
		activities:     make(map[string][]models.ApplicationActivity),
		staffMembers:   make(map[string]models.StaffMember),
		profileChanges: make(map[string]models.ProfileChangeRequest),
		waitlist:       make(map[string]models.WaitlistEntry),
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
			Cuisine: []string{"moldovan", "bakery"}, Rating: 4.8, ReviewCount: 214, PriceLevel: 2,
			Address: models.LocalizedString{RU: "ул. Независимости 45", EN: "Independenței 45", RO: "Independenței 45"},
			Lat:     47.7617, Lng: 27.9288, AverageCheck: 250, OpenNow: true,
			ImageURL: "https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=1200&q=80",
			PhotoURLs: []string{
				"https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=1200&q=80",
				"https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=1200&q=80",
				"https://images.unsplash.com/photo-1414235077428-338989a2e8c0?auto=format&fit=crop&w=1200&q=80",
			},
			Reviews: []models.VenueReview{
				{Author: "Maria C.", Rating: 5, Text: "Лучшие плацинды в Бельцах. Зал уютный, бронируем стол через FoodAssistant.", Relative: "2 недели назад", Source: "google"},
				{Author: "Andrei P.", Rating: 5, Text: "Отличный сервис и быстрая подача. Карта столов совпадает с реальностью.", Relative: "месяц назад", Source: "google"},
				{Author: "Elena V.", Rating: 4, Text: "Вкусно и по-домашнему. Иногда очередь в обед.", Relative: "2 месяца назад", Source: "google"},
			},
			AlcoholLicense: true,
			SessionStartBeforeMin: 15, ReleaseBeforeMin: 10,
			BookingIntervalMin: 30, HoldMinutes: 15, AllowPreorder: true,
		},
		{
			ID: "venue-2", CityID: balti.ID,
			Name: models.LocalizedString{RU: "Cafe Central", EN: "Cafe Central", RO: "Cafe Central"},
			Description: models.LocalizedString{
				RU: "Кофе, завтраки и лёгкий обед",
				EN: "Coffee, breakfast and light lunch",
				RO: "Cafea, mic dejun și prânz ușor",
			},
			Cuisine: []string{"cafe", "european"}, Rating: 4.5, ReviewCount: 128, PriceLevel: 1,
			Address: models.LocalizedString{RU: "пл. Василия Лупу 1", EN: "Vasile Lupu Sq 1", RO: "Piața Vasile Lupu 1"},
			Lat:     47.7631, Lng: 27.9299, AverageCheck: 180, OpenNow: true,
			ImageURL: "https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?auto=format&fit=crop&w=1200&q=80",
			PhotoURLs: []string{
				"https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?auto=format&fit=crop&w=1200&q=80",
				"https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb?auto=format&fit=crop&w=1200&q=80",
				"https://images.unsplash.com/photo-1554118811-1e0d58224f24?auto=format&fit=crop&w=1200&q=80",
			},
			Reviews: []models.VenueReview{
				{Author: "Ion M.", Rating: 5, Text: "Идеально для завтрака. Видно свободные столы прямо на карте.", Relative: "5 дней назад", Source: "google"},
				{Author: "Sofia R.", Rating: 4, Text: "Кофе отличный, иногда шумно у окна.", Relative: "3 недели назад", Source: "google"},
				{Author: "Dmitri K.", Rating: 5, Text: "Быстро нашли стол на плане зала и забронировали.", Relative: "месяц назад", Source: "google"},
			},
			AlcoholLicense: false,
			SessionStartBeforeMin: 10, ReleaseBeforeMin: 10,
			BookingIntervalMin: 30, HoldMinutes: 15, AllowPreorder: true,
		},
		{
			ID: "venue-3", CityID: balti.ID,
			Name: models.LocalizedString{RU: "Steak House Balti", EN: "Steak House Balti", RO: "Steak House Balti"},
			Description: models.LocalizedString{
				RU: "Стейки и вечерняя атмосфера",
				EN: "Steaks and evening atmosphere",
				RO: "Steak-uri și atmosferă de seară",
			},
			Cuisine: []string{"steak", "grill"}, Rating: 4.6, ReviewCount: 97, PriceLevel: 3,
			Address: models.LocalizedString{RU: "ул. Штефана чел Маре 12", EN: "Ștefan cel Mare 12", RO: "Ștefan cel Mare 12"},
			Lat:     47.7598, Lng: 27.9255, AverageCheck: 450, OpenNow: true,
			ImageURL: "https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=1200&q=80",
			PhotoURLs: []string{
				"https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=1200&q=80",
				"https://images.unsplash.com/photo-1558030006-450675393462?auto=format&fit=crop&w=1200&q=80",
				"https://images.unsplash.com/photo-1529692236671-f1f6cf9683ba?auto=format&fit=crop&w=1200&q=80",
			},
			Reviews: []models.VenueReview{
				{Author: "Alexei N.", Rating: 5, Text: "Стейк medium rare идеальный. Вечером лучше бронировать заранее.", Relative: "неделю назад", Source: "google"},
				{Author: "Irina S.", Rating: 4, Text: "Атмосфера и сервис на уровне. Цены выше среднего.", Relative: "месяц назад", Source: "google"},
			},
			AlcoholLicense: true,
			SessionStartBeforeMin: 20, ReleaseBeforeMin: 15,
			BookingIntervalMin: 30, HoldMinutes: 15, AllowPreorder: false,
		},
	}
	for _, v := range venues {
		s.venues[v.ID] = v
	}

	now := time.Now()
	occupied := now.Add(-40 * time.Minute)
	reserved := now.Add(45 * time.Minute)
	reservedDemo := now.Add(50 * time.Minute)
	resDemoID := "res-demo-venue-2-t7"

	tables := []models.Table{
		{ID: "t1", VenueID: "venue-1", Number: 1, Seats: 2, Status: models.TableFree, X: 0.2, Y: 0.3, Zone: "hall"},
		{ID: "t2", VenueID: "venue-1", Number: 2, Seats: 4, Status: models.TableFree, X: 0.5, Y: 0.3, Zone: "hall"},
		{ID: "t3", VenueID: "venue-1", Number: 3, Seats: 4, Status: models.TableOccupied, OccupiedSince: &occupied, X: 0.8, Y: 0.3, Zone: "hall"},
		{ID: "t4", VenueID: "venue-1", Number: 4, Seats: 6, Status: models.TableReserved, ReservedFor: &reserved, X: 0.35, Y: 0.65, Zone: "terrace"},
		{ID: "t5", VenueID: "venue-1", Number: 5, Seats: 2, Status: models.TableFree, X: 0.65, Y: 0.65, Zone: "terrace"},
		{ID: "t6", VenueID: "venue-2", Number: 1, Seats: 2, Status: models.TableFree, X: 0.3, Y: 0.4, Zone: "hall"},
		{ID: "t7", VenueID: "venue-2", Number: 2, Seats: 2, Status: models.TableReserved, ReservedFor: &reservedDemo, ReservationID: &resDemoID, X: 0.6, Y: 0.4, Zone: "hall"},
		{ID: "t8", VenueID: "venue-2", Number: 3, Seats: 4, Status: models.TableFree, X: 0.45, Y: 0.7, Zone: "street"},
		{ID: "t9", VenueID: "venue-2", Number: 4, Seats: 2, Status: models.TableOccupied, OccupiedSince: &occupied, X: 0.75, Y: 0.7, Zone: "street"},
		{ID: "t10", VenueID: "venue-2", Number: 5, Seats: 6, Status: models.TableFree, X: 0.2, Y: 0.75, Zone: "street"},
		{ID: "t11", VenueID: "venue-3", Number: 1, Seats: 4, Status: models.TableOccupied, OccupiedSince: &occupied, X: 0.4, Y: 0.5, Zone: "hall"},
		{ID: "t12", VenueID: "venue-3", Number: 2, Seats: 2, Status: models.TableFree, X: 0.7, Y: 0.5, Zone: "hall"},
		{ID: "t13", VenueID: "venue-3", Number: 3, Seats: 4, Status: models.TableFree, X: 0.28, Y: 0.35, Zone: "street"},
		{ID: "t14", VenueID: "venue-3", Number: 4, Seats: 2, Status: models.TableFree, X: 0.55, Y: 0.4, Zone: "street"},
		{ID: "t15", VenueID: "venue-3", Number: 5, Seats: 6, Status: models.TableFree, X: 0.78, Y: 0.62, Zone: "terrace"},
	}
	for _, t := range tables {
		s.tables[t.ID] = t
	}
	for id := range s.venues {
		s.refreshFreeTablesLocked(id)
	}

	s.reservations[resDemoID] = models.Reservation{
		ID:          resDemoID,
		UserID:      "user-guest-demo",
		VenueID:     "venue-2",
		TableID:     "t7",
		Guests:      2,
		ReservedFor: reservedDemo.UTC(),
		Status:      models.ReservationConfirmed,
		Source:      models.ReservationSourceWeb,
		CreatedAt:   now.UTC(),
		UpdatedAt:   now.UTC(),
	}

	// Extra venue-2 bookings for the owner day-calendar demo (today).
	calSlots := []struct {
		id      string
		tableID string
		guests  int
		at      time.Time
		status  models.ReservationStatus
	}{
		{"res-demo-venue-2-cal-12", "t6", 2, time.Date(now.Year(), now.Month(), now.Day(), 12, 0, 0, 0, now.Location()), models.ReservationConfirmed},
		{"res-demo-venue-2-cal-1430", "t8", 4, time.Date(now.Year(), now.Month(), now.Day(), 14, 30, 0, 0, now.Location()), models.ReservationConfirmed},
		{"res-demo-venue-2-cal-18", "t10", 6, time.Date(now.Year(), now.Month(), now.Day(), 18, 0, 0, 0, now.Location()), models.ReservationConfirmed},
		{"res-demo-venue-2-cal-20", "t6", 2, time.Date(now.Year(), now.Month(), now.Day(), 20, 0, 0, 0, now.Location()), models.ReservationCheckedIn},
	}
	for _, slot := range calSlots {
		s.reservations[slot.id] = models.Reservation{
			ID:          slot.id,
			UserID:      "user-guest-demo",
			VenueID:     "venue-2",
			TableID:     slot.tableID,
			Guests:      slot.guests,
			ReservedFor: slot.at.UTC(),
			Status:      slot.status,
			Source:      models.ReservationSourceWeb,
			CreatedAt:   now.UTC(),
			UpdatedAt:   now.UTC(),
		}
	}

	menu := []models.MenuItem{
		{
			ID: "m1", VenueID: "venue-1",
			Category:    models.LocalizedString{RU: "Выпечка", EN: "Pastries", RO: "Patiserie"},
			Name:        models.LocalizedString{RU: "Плацинда с сыром", EN: "Cheese plăcintă", RO: "Plăcintă cu brânză"},
			Description: models.LocalizedString{RU: "Классическая молдавская плацинда", EN: "Classic Moldovan pastry", RO: "Plăcintă moldovenească clasică"},
			Price:       45,
		},
		{
			ID: "m2", VenueID: "venue-1",
			Category:    models.LocalizedString{RU: "Супы", EN: "Soups", RO: "Supe"},
			Name:        models.LocalizedString{RU: "Зеленый борщ", EN: "Green borscht", RO: "Borș verde"},
			Description: models.LocalizedString{RU: "С щавелем и яйцом", EN: "With sorrel and egg", RO: "Cu măcriș și ou"},
			Price:       65,
		},
		{
			ID: "m3", VenueID: "venue-1",
			Category:    models.LocalizedString{RU: "Напитки", EN: "Drinks", RO: "Băuturi"},
			Name:        models.LocalizedString{RU: "Домашний компот", EN: "Homemade compote", RO: "Compot de casă"},
			Description: models.LocalizedString{RU: "Сезонные фрукты", EN: "Seasonal fruits", RO: "Fructe de sezon"},
			Price:       25,
		},
		{
			ID: "m4", VenueID: "venue-2",
			Category:    models.LocalizedString{RU: "Кофе", EN: "Coffee", RO: "Cafea"},
			Name:        models.LocalizedString{RU: "Капучино", EN: "Cappuccino", RO: "Cappuccino"},
			Description: models.LocalizedString{RU: "Двойной эспрессо с молоком", EN: "Double espresso with milk", RO: "Espresso dublu cu lapte"},
			Price:       40,
		},
		{
			ID: "m5", VenueID: "venue-2",
			Category:    models.LocalizedString{RU: "Завтраки", EN: "Breakfast", RO: "Mic dejun"},
			Name:        models.LocalizedString{RU: "Авокадо тост", EN: "Avocado toast", RO: "Toast cu avocado"},
			Description: models.LocalizedString{RU: "На зерновом хлебе", EN: "On wholegrain bread", RO: "Pe pâine integrală"},
			Price:       75,
		},
		{
			ID: "m6", VenueID: "venue-2",
			Category:    models.LocalizedString{RU: "Десерты", EN: "Desserts", RO: "Deserturi"},
			Name:        models.LocalizedString{RU: "Чизкейк", EN: "Cheesecake", RO: "Cheesecake"},
			Description: models.LocalizedString{RU: "Нью-Йорк стиль", EN: "New York style", RO: "Stil New York"},
			Price:       55,
		},
		{
			ID: "m7", VenueID: "venue-3",
			Category:    models.LocalizedString{RU: "Стейки", EN: "Steaks", RO: "Steak-uri"},
			Name:        models.LocalizedString{RU: "Рибай 300г", EN: "Ribeye 300g", RO: "Ribeye 300g"},
			Description: models.LocalizedString{RU: "На гриле, medium rare", EN: "Grilled, medium rare", RO: "La grătar, medium rare"},
			Price:       320,
		},
		{
			ID: "m8", VenueID: "venue-3",
			Category:    models.LocalizedString{RU: "Гарниры", EN: "Sides", RO: "Garnituri"},
			Name:        models.LocalizedString{RU: "Картофель фри", EN: "French fries", RO: "Cartofi prăjiți"},
			Description: models.LocalizedString{RU: "С соусом", EN: "With sauce", RO: "Cu sos"},
			Price:       45,
		},
		{
			ID: "m9", VenueID: "venue-3",
			Category:    models.LocalizedString{RU: "Напитки", EN: "Drinks", RO: "Băuturi"},
			Name:        models.LocalizedString{RU: "Красное вино бокал", EN: "Red wine glass", RO: "Vin roșu pahar"},
			Description: models.LocalizedString{RU: "Местное вино", EN: "Local wine", RO: "Vin local"},
			Price:       80, ContainsAlcohol: true,
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

	adminHash, err := bcrypt.GenerateFromPassword([]byte("admin123"), bcrypt.DefaultCost)
	if err == nil {
		admin := models.User{
			ID:           "user-admin",
			Email:        "admin@foodassistant.local",
			PasswordHash: string(adminHash),
			FirstName:    "Platform",
			LastName:     "Admin",
			DisplayName:  "Platform Admin",
			Locale:       "en",
			Role:         models.RoleAdmin,
			CreatedAt:    time.Now().UTC(),
			UpdatedAt:    time.Now().UTC(),
		}
		s.users[admin.ID] = admin
	}

	guestHash, err := bcrypt.GenerateFromPassword([]byte("guest123"), bcrypt.DefaultCost)
	if err == nil {
		guest := models.User{
			ID:           "user-guest-demo",
			Email:        "guest@foodassistant.local",
			PasswordHash: string(guestHash),
			FirstName:    "Demo",
			LastName:     "Guest",
			DisplayName:  "Demo Guest",
			Locale:       "ru",
			Role:         models.RoleGuest,
			CreatedAt:    time.Now().UTC(),
			UpdatedAt:    time.Now().UTC(),
		}
		s.users[guest.ID] = guest
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

func (s *MemoryStore) ApplyVenuePlaces(
	id, placeID string,
	rating float64,
	reviewCount int,
	photos []string,
	reviews []models.VenueReview,
) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	defer s.persistBestEffortLocked()

	v, ok := s.venues[id]
	if !ok {
		return ErrNotFound
	}
	if placeID != "" {
		v.GooglePlaceID = placeID
	}
	if rating > 0 {
		v.Rating = rating
	}
	if reviewCount > 0 {
		v.ReviewCount = reviewCount
	}
	if len(photos) > 0 {
		v.PhotoURLs = append([]string(nil), photos...)
		v.ImageURL = photos[0]
	}
	if len(reviews) > 0 {
		v.Reviews = append([]models.VenueReview(nil), reviews...)
	}
	s.venues[id] = v
	return nil
}

func (s *MemoryStore) ListTables(venueID string) []models.Table {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := make([]models.Table, 0)
	for _, t := range s.tables {
		if t.VenueID == venueID {
			if t.Zone == "" {
				t.Zone = "hall"
			}
			out = append(out, t)
		}
	}
	return out
}

func (s *MemoryStore) Register(email, password, firstName, lastName, locale, role string) (models.User, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	defer s.persistBestEffortLocked()

	for _, u := range s.users {
		if strings.EqualFold(u.Email, email) {
			return models.User{}, ErrEmailTaken
		}
	}

	if role == "" {
		role = models.RoleGuest
	}
	switch role {
	case models.RoleGuest, models.RoleRestaurant:
	default:
		return models.User{}, ErrBadRequest
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

	now := time.Now().UTC()
	u := models.User{
		ID:           uuid.NewString(),
		Email:        email,
		PasswordHash: string(hash),
		FirstName:    firstName,
		LastName:     lastName,
		DisplayName:  display,
		Locale:       locale,
		Role:         role,
		CreatedAt:    now,
		UpdatedAt:    now,
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
	defer s.persistBestEffortLocked()

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
	if patch.DietPreferences != nil {
		u.DietPreferences = *patch.DietPreferences
	}
	if patch.FavoriteVenues != nil {
		u.FavoriteVenues = *patch.FavoriteVenues
	}
	u.UpdatedAt = time.Now().UTC()
	s.users[id] = u
	return u, nil
}

func (s *MemoryStore) CreateReservation(userID, venueID, tableID string, guests int, reservedFor time.Time, source ...string) (models.Reservation, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	defer s.persistBestEffortLocked()

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

	reservationSource := models.ReservationSourceWeb
	if len(source) > 0 {
		switch strings.ToUpper(source[0]) {
		case models.ReservationSourceAndroid, models.ReservationSourceIOS, models.ReservationSourcePhone, models.ReservationSourceWalkIn:
			reservationSource = strings.ToUpper(source[0])
		}
	}
	now := time.Now().UTC()
	id := uuid.NewString()
	res := models.Reservation{
		ID:          id,
		UserID:      userID,
		VenueID:     venueID,
		TableID:     tableID,
		Guests:      guests,
		ReservedFor: reservedFor,
		Status:      models.ReservationConfirmed,
		Source:      reservationSource,
		CreatedAt:   now,
		UpdatedAt:   now,
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

func (s *MemoryStore) ConfirmArrival(userID, reservationID string, expectedArrival *time.Time) (models.Reservation, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	defer s.persistBestEffortLocked()

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
	if expectedArrival != nil {
		ea := expectedArrival.UTC()
		if ea.After(r.ReservedFor) {
			return models.Reservation{}, ErrConflict
		}
		r.ExpectedArrival = &ea
	}
	now := time.Now().UTC()
	r.ArrivalConfirmedAt = &now
	r.Status = models.ReservationCheckedIn
	r.UpdatedAt = now
	s.reservations[reservationID] = r
	return r, nil
}

func (s *MemoryStore) CancelReservation(userID, reservationID string) (models.Reservation, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	defer s.persistBestEffortLocked()

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
	r.UpdatedAt = time.Now().UTC()
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
		if r.UserID != userID {
			continue
		}
		if venue, ok := s.venues[r.VenueID]; ok {
			r.VenueName = venue.Name
		}
		if table, ok := s.tables[r.TableID]; ok {
			r.TableNumber = table.Number
		}
		out = append(out, r)
	}
	sort.Slice(out, func(i, j int) bool {
		return out[i].ReservedFor.After(out[j].ReservedFor)
	})
	return out
}

func (s *MemoryStore) CreateTableWatch(userID, venueID, tableID string) (models.TableWatch, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	defer s.persistBestEffortLocked()

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
	defer s.persistBestEffortLocked()

	token = strings.TrimSpace(token)
	if token == "" {
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

	legacy := qr.LegacyToken(venueID, tableID)
	if t.QRToken != "" {
		if token != t.QRToken && token != legacy && !qr.Verify(s.qrSecret, venueID, tableID, token) {
			return models.Session{}, ErrInvalidQR
		}
	}
	// When QRToken is empty, any non-empty token is accepted (compat).

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
		if r.Status != models.ReservationConfirmed && r.Status != models.ReservationCheckedIn {
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
	defer s.persistBestEffortLocked()

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
		if m.VenueID == venueID && !m.Stopped {
			out = append(out, m)
		}
	}
	return out, nil
}

func (s *MemoryStore) CreateOrder(sessionID, userID string, items []OrderItemInput) (models.Order, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	defer s.persistBestEffortLocked()

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
		if mi.Stopped {
			return models.Order{}, ErrBadRequest
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
		ID:          uuid.NewString(),
		SessionID:   sessionID,
		UserID:      userID,
		VenueID:     sess.VenueID,
		Items:       orderItems,
		Status:      models.OrderSubmitted,
		Total:       total,
		CheckNumber: fmt.Sprintf("FA-%s-%04d", now.Format("20060102"), len(s.orders)+1),
		CreatedAt:   now,
		UpdatedAt:   now,
	}
	s.orders[o.ID] = o
	return o, nil
}

func (s *MemoryStore) ListOrders(userID string) []models.Order {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := make([]models.Order, 0)
	for _, o := range s.orders {
		if o.UserID != userID {
			continue
		}
		if venue, ok := s.venues[o.VenueID]; ok {
			o.VenueName = venue.Name
		}
		out = append(out, o)
	}
	sort.Slice(out, func(i, j int) bool {
		return out[i].CreatedAt.After(out[j].CreatedAt)
	})
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

func (s *MemoryStore) PayOrder(userID, orderID, method string) (models.Order, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	defer s.persistBestEffortLocked()

	o, ok := s.orders[orderID]
	if !ok {
		return models.Order{}, ErrNotFound
	}
	if o.UserID != userID {
		return models.Order{}, ErrForbidden
	}
	if o.Status == models.OrderCancelled {
		return models.Order{}, ErrConflict
	}
	if o.Status == models.OrderPaid {
		return o, nil
	}

	now := time.Now().UTC()
	method = strings.ToLower(strings.TrimSpace(method))
	switch method {
	case "app", "card", "online":
		o.Status = models.OrderPaid
		o.PaymentMethod = "app"
		o.PaidAt = &now
	case "venue", "cash", "at_venue":
		o.PaymentMethod = "venue"
		if o.Status == models.OrderSubmitted || o.Status == models.OrderPreparing || o.Status == models.OrderReady {
			o.Status = models.OrderServed
		}
	default:
		return models.Order{}, ErrBadRequest
	}
	if o.CheckNumber == "" {
		o.CheckNumber = fmt.Sprintf("FA-%s-%04d", now.Format("20060102"), len(s.orders))
	}
	o.UpdatedAt = now
	s.orders[orderID] = o
	return o, nil
}

func (s *MemoryStore) UpdateOrderStatus(orderID string, status models.OrderStatus) (models.Order, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	defer s.persistBestEffortLocked()

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
	now := time.Now().UTC()
	o.UpdatedAt = now
	if status == models.OrderPaid && o.PaidAt == nil {
		o.PaidAt = &now
		if o.PaymentMethod == "" {
			o.PaymentMethod = "venue"
		}
		if o.CheckNumber == "" {
			o.CheckNumber = fmt.Sprintf("FA-%s-%04d", now.Format("20060102"), len(s.orders))
		}
	}
	s.orders[orderID] = o
	return o, nil
}

func (s *MemoryStore) CreateWaiterCall(sessionID string, reason models.WaiterCallReason) (models.WaiterCall, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	defer s.persistBestEffortLocked()

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
	defer s.persistBestEffortLocked()

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

const MaxApplicationPhotos = 8

func localizedEqual(a, b models.LocalizedString) bool {
	return a.RU == b.RU && a.EN == b.EN && a.RO == b.RO
}

func stringSliceEqual(a, b []string) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i] != b[i] {
			return false
		}
	}
	return true
}

func (s *MemoryStore) recordActivityLocked(appID, actorID, action string, changedFields []string, note string) {
	role := "system"
	if actor, ok := s.users[actorID]; ok {
		role = actor.Role
	}
	entry := models.ApplicationActivity{
		ID:            uuid.NewString(),
		ApplicationID: appID,
		ActorUserID:   actorID,
		ActorRole:     role,
		Action:        action,
		ChangedFields: append([]string(nil), changedFields...),
		Note:          note,
		CreatedAt:     time.Now().UTC(),
	}
	s.activities[appID] = append(s.activities[appID], entry)
}

func (s *MemoryStore) CreateApplication(ownerID string) (models.VenueApplication, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	defer s.persistBestEffortLocked()

	u, ok := s.users[ownerID]
	if !ok {
		return models.VenueApplication{}, ErrNotFound
	}
	if u.Role != models.RoleRestaurant && u.Role != models.RoleAdmin {
		return models.VenueApplication{}, ErrForbidden
	}

	now := time.Now().UTC()
	app := models.VenueApplication{
		ID:          uuid.NewString(),
		OwnerUserID: ownerID,
		Status:      models.AppDraft,
		Cuisine:     []string{},
		PhotoURLs:   []string{},
		CityID:      "city-balti",
		CreatedAt:   now,
		UpdatedAt:   now,
	}
	s.applications[app.ID] = app
	s.recordActivityLocked(app.ID, ownerID, "APPLICATION_CREATED", nil, "")
	return app, nil
}

func (s *MemoryStore) GetApplication(id string) (models.VenueApplication, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	app, ok := s.applications[id]
	if !ok {
		return models.VenueApplication{}, ErrNotFound
	}
	return app, nil
}

func (s *MemoryStore) ListApplicationsByOwner(ownerID string) []models.VenueApplication {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := make([]models.VenueApplication, 0)
	for _, app := range s.applications {
		if app.OwnerUserID == ownerID {
			out = append(out, app)
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i].UpdatedAt.After(out[j].UpdatedAt) })
	return out
}

func (s *MemoryStore) ListApplicationActivity(requesterID, appID string) ([]models.ApplicationActivity, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	app, ok := s.applications[appID]
	if !ok {
		return nil, ErrNotFound
	}
	requester, ok := s.users[requesterID]
	if !ok {
		return nil, ErrNotFound
	}
	if app.OwnerUserID != requesterID && requester.Role != models.RoleAdmin {
		return nil, ErrForbidden
	}

	out := append([]models.ApplicationActivity(nil), s.activities[appID]...)
	sort.Slice(out, func(i, j int) bool { return out[i].CreatedAt.After(out[j].CreatedAt) })
	return out, nil
}

func (s *MemoryStore) ListVenueSchedule(venueID string) ([]models.VenueScheduleSlot, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	if _, ok := s.venues[venueID]; !ok {
		return nil, ErrNotFound
	}

	const slotMinutes = 90
	out := make([]models.VenueScheduleSlot, 0)

	for _, reservation := range s.reservations {
		if reservation.VenueID != venueID {
			continue
		}
		if reservation.Status == models.ReservationCancelled || reservation.Status == models.ReservationNoShow {
			continue
		}
		table := s.tables[reservation.TableID]
		start := reservation.ReservedFor
		end := start.Add(slotMinutes * time.Minute)
		out = append(out, models.VenueScheduleSlot{
			ID:          reservation.ID,
			TableID:     reservation.TableID,
			TableNumber: table.Number,
			StartsAt:    start,
			EndsAt:      end,
			Kind:        "RESERVATION",
		})
	}

	for _, table := range s.tables {
		if table.VenueID != venueID || table.Status != models.TableOccupied || table.OccupiedSince == nil {
			continue
		}
		// Skip if already covered by a reservation slot for the same table overlapping now.
		start := table.OccupiedSince.UTC()
		end := start.Add(slotMinutes * time.Minute)
		// Stale occupied markers (ended long ago) should not pollute the day board.
		if end.Before(time.Now().UTC().Add(-2 * time.Hour)) {
			continue
		}
		covered := false
		for _, slot := range out {
			if slot.TableID == table.ID && !end.Before(slot.StartsAt) && !start.After(slot.EndsAt) {
				covered = true
				break
			}
		}
		if covered {
			continue
		}
		out = append(out, models.VenueScheduleSlot{
			ID:          "occ-" + table.ID,
			TableID:     table.ID,
			TableNumber: table.Number,
			StartsAt:    start,
			EndsAt:      end,
			Kind:        "OCCUPIED",
		})
	}

	sort.Slice(out, func(i, j int) bool {
		return out[i].StartsAt.Before(out[j].StartsAt)
	})
	return out, nil
}

func (s *MemoryStore) ListRestaurantReservations(ownerID string) ([]models.RestaurantReservation, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	owner, ok := s.users[ownerID]
	if !ok {
		return nil, ErrNotFound
	}
	if owner.Role != models.RoleRestaurant && owner.Role != models.RoleAdmin {
		return nil, ErrForbidden
	}

	venueIDs := make(map[string]bool)
	if owner.Role == models.RoleAdmin {
		for venueID := range s.venues {
			venueIDs[venueID] = true
		}
	} else {
		for _, app := range s.applications {
			if app.OwnerUserID == ownerID && app.VenueID != nil {
				venueIDs[*app.VenueID] = true
			}
		}
	}

	out := make([]models.RestaurantReservation, 0)
	for _, reservation := range s.reservations {
		if !venueIDs[reservation.VenueID] {
			continue
		}
		venue := s.venues[reservation.VenueID]
		table := s.tables[reservation.TableID]
		guest := s.users[reservation.UserID]
		guestName := strings.TrimSpace(guest.DisplayName)
		if guestName == "" {
			guestName = strings.TrimSpace(guest.FirstName + " " + guest.LastName)
		}
		out = append(out, models.RestaurantReservation{
			ID:                 reservation.ID,
			VenueID:            reservation.VenueID,
			VenueName:          venue.Name,
			TableID:            reservation.TableID,
			TableNumber:        table.Number,
			GuestName:          guestName,
			GuestEmail:         guest.Email,
			Guests:             reservation.Guests,
			ReservedFor:        reservation.ReservedFor,
			Status:             reservation.Status,
			ArrivalConfirmedAt: reservation.ArrivalConfirmedAt,
			CreatedAt:          reservation.CreatedAt,
		})
	}
	sort.Slice(out, func(i, j int) bool { return out[i].ReservedFor.After(out[j].ReservedFor) })
	return out, nil
}

func (s *MemoryStore) ListAllApplications(status string) []models.VenueApplication {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := make([]models.VenueApplication, 0)
	for _, app := range s.applications {
		if status == "" || string(app.Status) == status {
			out = append(out, app)
		}
	}
	return out
}

func (s *MemoryStore) UpdateApplication(ownerID, id string, patch ApplicationUpdate) (models.VenueApplication, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	defer s.persistBestEffortLocked()

	app, ok := s.applications[id]
	if !ok {
		return models.VenueApplication{}, ErrNotFound
	}
	if app.OwnerUserID != ownerID {
		return models.VenueApplication{}, ErrForbidden
	}
	if app.Status != models.AppDraft && app.Status != models.AppRejected {
		return models.VenueApplication{}, ErrConflict
	}
	if patch.Email != nil && *patch.Email != "" {
		if _, err := mail.ParseAddress(*patch.Email); err != nil {
			return models.VenueApplication{}, ErrBadRequest
		}
	}
	if patch.Website != nil && *patch.Website != "" {
		parsed, err := url.ParseRequestURI(*patch.Website)
		if err != nil || (parsed.Scheme != "http" && parsed.Scheme != "https") || parsed.Host == "" {
			return models.VenueApplication{}, ErrBadRequest
		}
	}
	if patch.Lat != nil && (*patch.Lat < -90 || *patch.Lat > 90) {
		return models.VenueApplication{}, ErrBadRequest
	}
	if patch.Lng != nil && (*patch.Lng < -180 || *patch.Lng > 180) {
		return models.VenueApplication{}, ErrBadRequest
	}
	if patch.PriceLevel != nil && (*patch.PriceLevel < 1 || *patch.PriceLevel > 3) {
		return models.VenueApplication{}, ErrBadRequest
	}
	if patch.AverageCheck != nil && *patch.AverageCheck < 0 {
		return models.VenueApplication{}, ErrBadRequest
	}

	changed := make([]string, 0, 12)
	if patch.Name != nil && !localizedEqual(app.Name, *patch.Name) {
		app.Name = *patch.Name
		changed = append(changed, "name")
	}
	if patch.Description != nil && !localizedEqual(app.Description, *patch.Description) {
		app.Description = *patch.Description
		changed = append(changed, "description")
	}
	if patch.Address != nil && !localizedEqual(app.Address, *patch.Address) {
		app.Address = *patch.Address
		changed = append(changed, "address")
	}
	if patch.Cuisine != nil && !stringSliceEqual(app.Cuisine, *patch.Cuisine) {
		app.Cuisine = *patch.Cuisine
		changed = append(changed, "cuisine")
	}
	if patch.Phone != nil && app.Phone != *patch.Phone {
		app.Phone = *patch.Phone
		changed = append(changed, "phone")
	}
	if patch.Email != nil && app.Email != *patch.Email {
		app.Email = *patch.Email
		changed = append(changed, "email")
	}
	if patch.Website != nil && app.Website != *patch.Website {
		app.Website = *patch.Website
		changed = append(changed, "website")
	}
	if patch.CityID != nil && *patch.CityID != "" && app.CityID != *patch.CityID {
		app.CityID = *patch.CityID
		changed = append(changed, "city")
	}
	if patch.Lat != nil && app.Lat != *patch.Lat {
		app.Lat = *patch.Lat
		changed = append(changed, "latitude")
	}
	if patch.Lng != nil && app.Lng != *patch.Lng {
		app.Lng = *patch.Lng
		changed = append(changed, "longitude")
	}
	if patch.PriceLevel != nil && app.PriceLevel != *patch.PriceLevel {
		app.PriceLevel = *patch.PriceLevel
		changed = append(changed, "price_level")
	}
	if patch.AverageCheck != nil && app.AverageCheck != *patch.AverageCheck {
		app.AverageCheck = *patch.AverageCheck
		changed = append(changed, "average_check")
	}
	if patch.HoursText != nil && app.HoursText != *patch.HoursText {
		app.HoursText = *patch.HoursText
		changed = append(changed, "hours")
	}

	if len(changed) == 0 {
		return app, nil
	}

	// Re-editing a rejected application returns it to draft.
	if app.Status == models.AppRejected {
		app.Status = models.AppDraft
		app.RejectReason = ""
	}
	app.UpdatedAt = time.Now().UTC()
	s.applications[id] = app
	s.recordActivityLocked(id, ownerID, "PROFILE_UPDATED", changed, "")
	return app, nil
}

func (s *MemoryStore) AddPhoto(ownerID, appID, url string) (models.VenueApplication, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	defer s.persistBestEffortLocked()

	app, ok := s.applications[appID]
	if !ok {
		return models.VenueApplication{}, ErrNotFound
	}
	if app.OwnerUserID != ownerID {
		return models.VenueApplication{}, ErrForbidden
	}
	if app.Status != models.AppDraft && app.Status != models.AppRejected {
		return models.VenueApplication{}, ErrConflict
	}
	if len(app.PhotoURLs) >= MaxApplicationPhotos {
		return models.VenueApplication{}, ErrBadRequest
	}
	app.PhotoURLs = append(app.PhotoURLs, url)
	if app.Status == models.AppRejected {
		app.Status = models.AppDraft
		app.RejectReason = ""
	}
	app.UpdatedAt = time.Now().UTC()
	s.applications[appID] = app
	s.recordActivityLocked(appID, ownerID, "PHOTO_ADDED", []string{"photos"}, "")
	return app, nil
}

func (s *MemoryStore) RemovePhoto(ownerID, appID, url string) (models.VenueApplication, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	defer s.persistBestEffortLocked()

	app, ok := s.applications[appID]
	if !ok {
		return models.VenueApplication{}, ErrNotFound
	}
	if app.OwnerUserID != ownerID {
		return models.VenueApplication{}, ErrForbidden
	}
	if app.Status != models.AppDraft && app.Status != models.AppRejected {
		return models.VenueApplication{}, ErrConflict
	}

	found := false
	next := make([]string, 0, len(app.PhotoURLs))
	for _, u := range app.PhotoURLs {
		if u == url && !found {
			found = true
			continue
		}
		next = append(next, u)
	}
	if !found {
		return models.VenueApplication{}, ErrNotFound
	}
	app.PhotoURLs = next
	if app.Status == models.AppRejected {
		app.Status = models.AppDraft
		app.RejectReason = ""
	}
	app.UpdatedAt = time.Now().UTC()
	s.applications[appID] = app
	s.recordActivityLocked(appID, ownerID, "PHOTO_REMOVED", []string{"photos"}, "")
	return app, nil
}

func (s *MemoryStore) SubmitApplication(ownerID, id string) (models.VenueApplication, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	defer s.persistBestEffortLocked()

	app, ok := s.applications[id]
	if !ok {
		return models.VenueApplication{}, ErrNotFound
	}
	if app.OwnerUserID != ownerID {
		return models.VenueApplication{}, ErrForbidden
	}
	if app.Status != models.AppDraft && app.Status != models.AppRejected {
		return models.VenueApplication{}, ErrConflict
	}
	if !applicationComplete(app) {
		return models.VenueApplication{}, ErrBadRequest
	}

	now := time.Now().UTC()
	app.Status = models.AppSubmitted
	app.RejectReason = ""
	app.SubmittedAt = &now
	app.UpdatedAt = now
	s.applications[id] = app
	s.recordActivityLocked(id, ownerID, "APPLICATION_SUBMITTED", nil, "")
	return app, nil
}

func applicationComplete(app models.VenueApplication) bool {
	namePresent := strings.TrimSpace(app.Name.EN) != "" || strings.TrimSpace(app.Name.RU) != "" || strings.TrimSpace(app.Name.RO) != ""
	descriptionPresent := strings.TrimSpace(app.Description.EN) != "" || strings.TrimSpace(app.Description.RU) != "" || strings.TrimSpace(app.Description.RO) != ""
	addressPresent := strings.TrimSpace(app.Address.EN) != "" || strings.TrimSpace(app.Address.RU) != "" || strings.TrimSpace(app.Address.RO) != ""
	_, emailErr := mail.ParseAddress(strings.TrimSpace(app.Email))
	coordinatesValid := app.Lat >= -90 && app.Lat <= 90 && app.Lng >= -180 && app.Lng <= 180 && app.Lat != 0 && app.Lng != 0
	return namePresent && descriptionPresent && addressPresent && len(app.Cuisine) > 0 &&
		strings.TrimSpace(app.Phone) != "" && emailErr == nil && strings.TrimSpace(app.HoursText) != "" &&
		coordinatesValid && len(app.PhotoURLs) > 0
}

func (s *MemoryStore) AdminSetStatus(adminID, id string, status models.ApplicationStatus, rejectReason string) (models.VenueApplication, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	defer s.persistBestEffortLocked()

	admin, ok := s.users[adminID]
	if !ok || admin.Role != models.RoleAdmin {
		return models.VenueApplication{}, ErrForbidden
	}

	app, ok := s.applications[id]
	if !ok {
		return models.VenueApplication{}, ErrNotFound
	}

	switch status {
	case models.AppUnderReview, models.AppApproved, models.AppRejected:
	default:
		return models.VenueApplication{}, ErrInvalidStatus
	}
	if status == models.AppRejected && strings.TrimSpace(rejectReason) == "" {
		return models.VenueApplication{}, ErrBadRequest
	}

	app.Status = status
	if status == models.AppRejected {
		app.RejectReason = rejectReason
	} else {
		app.RejectReason = ""
	}
	app.UpdatedAt = time.Now().UTC()
	s.applications[id] = app
	action := "REVIEW_STARTED"
	if status == models.AppApproved {
		action = "APPLICATION_APPROVED"
	} else if status == models.AppRejected {
		action = "APPLICATION_REJECTED"
	}
	s.recordActivityLocked(id, adminID, action, nil, rejectReason)
	return app, nil
}

func (s *MemoryStore) PublishApplication(adminID, id string) (models.VenueApplication, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	defer s.persistBestEffortLocked()

	admin, ok := s.users[adminID]
	if !ok || admin.Role != models.RoleAdmin {
		return models.VenueApplication{}, ErrForbidden
	}

	app, ok := s.applications[id]
	if !ok {
		return models.VenueApplication{}, ErrNotFound
	}
	if app.Status != models.AppApproved {
		return models.VenueApplication{}, ErrConflict
	}
	if app.VenueID != nil {
		return models.VenueApplication{}, ErrConflict
	}

	imageURL := ""
	photos := append([]string(nil), app.PhotoURLs...)
	if len(photos) > 0 {
		imageURL = photos[0]
	}
	cityID := app.CityID
	if cityID == "" {
		cityID = "city-balti"
	}
	cuisine := app.Cuisine
	if cuisine == nil {
		cuisine = []string{}
	}

	venueID := "venue-" + uuid.NewString()
	venue := models.Venue{
		ID:                    venueID,
		CityID:                cityID,
		Name:                  app.Name,
		Description:           app.Description,
		Cuisine:               cuisine,
		Rating:                0,
		ReviewCount:           0,
		PriceLevel:            app.PriceLevel,
		Address:               app.Address,
		Lat:                   app.Lat,
		Lng:                   app.Lng,
		AverageCheck:          app.AverageCheck,
		OpenNow:               true,
		ImageURL:              imageURL,
		PhotoURLs:             photos,
		Website:               app.Website,
		AlcoholLicense:        false,
		SessionStartBeforeMin: 15,
		ReleaseBeforeMin:      10,
		BookingIntervalMin:    30,
		HoldMinutes:           15,
		AllowPreorder:         true,
	}
	s.venues[venueID] = venue

	// Start every published restaurant with an editable, booking-ready floor
	// layout. Positions are normalized so web and mobile render the same room.
	defaultLayout := []struct {
		x, y  float64
		seats int
		zone  string
	}{
		{x: 0.18, y: 0.22, seats: 2, zone: "hall"},
		{x: 0.43, y: 0.22, seats: 4, zone: "hall"},
		{x: 0.72, y: 0.22, seats: 4, zone: "hall"},
		{x: 0.22, y: 0.5, seats: 4, zone: "hall"},
		{x: 0.52, y: 0.5, seats: 6, zone: "hall"},
		{x: 0.28, y: 0.35, seats: 2, zone: "terrace"},
		{x: 0.55, y: 0.4, seats: 4, zone: "terrace"},
		{x: 0.78, y: 0.55, seats: 4, zone: "street"},
		{x: 0.42, y: 0.7, seats: 6, zone: "street"},
	}
	for index, position := range defaultLayout {
		tID := uuid.NewString()
		t := models.Table{
			ID:      tID,
			VenueID: venueID,
			Number:  index + 1,
			Seats:   position.seats,
			Status:  models.TableFree,
			X:       position.x,
			Y:       position.y,
			Zone:    position.zone,
			QRToken: qr.Sign(s.qrSecret, venueID, tID),
		}
		s.tables[t.ID] = t
	}
	s.refreshFreeTablesLocked(venueID)

	now := time.Now().UTC()
	app.Status = models.AppPublished
	app.VenueID = &venueID
	app.UpdatedAt = now
	s.applications[id] = app
	s.recordActivityLocked(id, adminID, "APPLICATION_PUBLISHED", nil, "")
	return app, nil
}
