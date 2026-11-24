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

	"github.com/google/uuid"
	"github.com/seatiko/api/internal/models"
	"github.com/seatiko/api/internal/qr"
	"golang.org/x/crypto/bcrypt"
)

var (
	ErrNotFound                = errors.New("not found")
	ErrEmailTaken              = errors.New("email already registered")
	ErrInvalidCreds            = errors.New("invalid credentials")
	ErrTableNotFree            = errors.New("table not free")
	ErrInvalidQR               = errors.New("invalid qr token")
	ErrBadRequest              = errors.New("bad request")
	ErrForbidden               = errors.New("forbidden")
	ErrConflict                = errors.New("conflict")
	ErrSessionClosed           = errors.New("session closed")
	ErrInvalidStatus           = errors.New("invalid status")
	ErrActiveReservationExists = errors.New("active reservation exists")
	ErrInvalidDuration         = errors.New("invalid booking duration")
)

type OrderItemInput struct {
	MenuItemID string `json:"menu_item_id"`
	Qty        int    `json:"qty"`
}

const (
	demoGuestID         = "user-guest-demo"
	demoCalendarGuestID = "user-guest-calendar"
	demoOwnerID         = "user-demo-owner"
	demoOwnerAppID      = "app-demo-owner"
	demoStaffID         = "user-demo-staff"
	demoStaffMemberID   = "staff-demo-1"
)

func IsDemoGuestID(id string) bool {
	return id == demoGuestID || id == demoCalendarGuestID
}

func IsDemoUserID(id string) bool {
	return id == demoGuestID || id == demoCalendarGuestID || id == demoOwnerID || id == demoStaffID
}

func IsDemoApplicationID(id string) bool {
	return id == demoOwnerAppID
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
	shifts         map[string]models.WorkShift
	profileChanges map[string]models.ProfileChangeRequest
	waitlist       map[string]models.WaitlistEntry
	eventInquiries map[string]models.EventInquiry
	demoMenuVer    int
}

func NewMemory() *MemoryStore {
	s := &MemoryStore{
		qrSecret:       "seatiko-qr-dev-secret",
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
		shifts:         make(map[string]models.WorkShift),
		profileChanges: make(map[string]models.ProfileChangeRequest),
		waitlist:       make(map[string]models.WaitlistEntry),
		eventInquiries: make(map[string]models.EventInquiry),
		demoMenuVer:    demoMenuVersion,
	}
	s.seed()
	return s
}

func (s *MemoryStore) seed() {
	for _, city := range moldovaCities() {
		s.cities[city.ID] = city
	}
	balti := s.cities[DefaultCityID]

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
				{Author: "Maria C.", Rating: 5, Text: "Лучшие плацинды в Бельцах. Зал уютный, бронируем стол через Seatiko.", Relative: "2 недели назад", Source: "google"},
				{Author: "Andrei P.", Rating: 5, Text: "Отличный сервис и быстрая подача. Карта столов совпадает с реальностью.", Relative: "месяц назад", Source: "google"},
				{Author: "Elena V.", Rating: 4, Text: "Вкусно и по-домашнему. Иногда очередь в обед.", Relative: "2 месяца назад", Source: "google"},
			},
			AlcoholLicense:        true,
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
			AlcoholLicense:        false,
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
			AlcoholLicense:        true,
			SessionStartBeforeMin: 20, ReleaseBeforeMin: 15,
			BookingIntervalMin: 30, HoldMinutes: 15, AllowPreorder: false,
		},
		{
			ID: "venue-4", CityID: balti.ID,
			Name: models.LocalizedString{RU: "Oliva", EN: "Oliva", RO: "Oliva"},
			Description: models.LocalizedString{
				RU: "Средиземноморская и итальянская кухня, пицца на дровах и паста в центре Бельц",
				EN: "Mediterranean and Italian cuisine, wood-fired pizza and pasta in central Bălți",
				RO: "Bucătărie mediteraneană și italiană, pizza pe lemne și paste în centrul Bălțiului",
			},
			Cuisine: []string{"italian", "mediterranean", "pizza"}, Rating: 4.7, ReviewCount: 185, PriceLevel: 2,
			Address: models.LocalizedString{RU: "ул. Независимости 15A", EN: "Strada Independenței 15A", RO: "Strada Independenței 15A"},
			Lat:     47.7612, Lng: 27.9275, AverageCheck: 280, OpenNow: true,
			ImageURL:       "https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=1200&q=80",
			AlcoholLicense: true, SessionStartBeforeMin: 15, ReleaseBeforeMin: 10,
			BookingIntervalMin: 30, HoldMinutes: 15, AllowPreorder: true,
		},
		{
			ID: "venue-5", CityID: balti.ID,
			Name: models.LocalizedString{RU: "Beermaster Pub", EN: "Beermaster Pub", RO: "Beermaster Pub"},
			Description: models.LocalizedString{
				RU: "Легендарный бельцкий паб: свежее крафтовое пиво, сочные стейки и гриль-закуски",
				EN: "Legendary Bălți pub: fresh craft beer, juicy steaks and grilled bites",
				RO: "Legendarul pub din Bălți: bere artizanală proaspătă, fripturi suculente și gustări",
			},
			Cuisine: []string{"pub", "grill", "european"}, Rating: 4.8, ReviewCount: 310, PriceLevel: 2,
			Address: models.LocalizedString{RU: "ул. Михаила Садовяну 37/A", EN: "Strada Mihail Sadoveanu 37/A", RO: "Strada Mihail Sadoveanu 37/A"},
			Lat:     47.7640, Lng: 27.9230, AverageCheck: 260, OpenNow: true,
			ImageURL:       "https://images.unsplash.com/photo-1514933651103-005eec06c04b?auto=format&fit=crop&w=1200&q=80",
			AlcoholLicense: true, SessionStartBeforeMin: 15, ReleaseBeforeMin: 10,
			BookingIntervalMin: 30, HoldMinutes: 15, AllowPreorder: true,
		},
		{
			ID: "venue-6", CityID: balti.ID,
			Name: models.LocalizedString{RU: "Restaurant Noroc", EN: "Noroc Restaurant", RO: "Restaurant Noroc"},
			Description: models.LocalizedString{
				RU: "Традиционная молдавская кухня, домашний уют, мамалыга с брынзой и отборные вина",
				EN: "Traditional Moldovan cuisine, cozy ambiance and fine local wines",
				RO: "Bucătărie tradițională moldovenească, mămăligă cu brânză și vinuri alese",
			},
			Cuisine: []string{"moldovan", "traditional", "wine"}, Rating: 4.6, ReviewCount: 142, PriceLevel: 2,
			Address: models.LocalizedString{RU: "ул. Дечебал 131", EN: "Strada Decebal 131", RO: "Strada Decebal 131"},
			Lat:     47.7715, Lng: 27.9180, AverageCheck: 240, OpenNow: true,
			ImageURL:       "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=1200&q=80",
			AlcoholLicense: true, SessionStartBeforeMin: 15, ReleaseBeforeMin: 10,
			BookingIntervalMin: 30, HoldMinutes: 15, AllowPreorder: true,
		},
		{
			ID: "venue-7", CityID: balti.ID,
			Name: models.LocalizedString{RU: "Loft Burger Bar", EN: "Loft Burger Bar", RO: "Loft Burger Bar"},
			Description: models.LocalizedString{
				RU: "Крафтовые бургеры на открытом гриле, хрустящий картофель и авторские коктейли",
				EN: "Craft grilled burgers, crispy fries and specialty cocktails",
				RO: "Burger craft la grătar, cartofi crocanți și cocktailuri de autor",
			},
			Cuisine: []string{"burgers", "grill", "american"}, Rating: 4.7, ReviewCount: 165, PriceLevel: 1,
			Address: models.LocalizedString{RU: "ул. Стрый 3", EN: "Strada Strîi 3", RO: "Strada Strîi 3"},
			Lat:     47.7550, Lng: 27.9210, AverageCheck: 190, OpenNow: true,
			ImageURL:       "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=1200&q=80",
			AlcoholLicense: true, SessionStartBeforeMin: 15, ReleaseBeforeMin: 10,
			BookingIntervalMin: 30, HoldMinutes: 15, AllowPreorder: true,
		},
		{
			ID: "venue-8", CityID: balti.ID,
			Name: models.LocalizedString{RU: "Oscar Lounge", EN: "Oscar Lounge", RO: "Oscar Lounge"},
			Description: models.LocalizedString{
				RU: "Европейская кухня, изысканная лаунж-атмосфера, десерты и вечерние коктейли",
				EN: "European cuisine, stylish lounge atmosphere, desserts and evening cocktails",
				RO: "Bucătărie europeană, atmosferă lounge rafinată, deserturi și cocktailuri",
			},
			Cuisine: []string{"european", "lounge", "dessert"}, Rating: 4.5, ReviewCount: 98, PriceLevel: 3,
			Address: models.LocalizedString{RU: "ул. Михаила Садовяну 1", EN: "Strada Mihail Sadoveanu 1", RO: "Strada Mihail Sadoveanu 1"},
			Lat:     47.7625, Lng: 27.9245, AverageCheck: 340, OpenNow: true,
			ImageURL:       "https://images.unsplash.com/photo-1550966871-3ed3cdb5ed0c?auto=format&fit=crop&w=1200&q=80",
			AlcoholLicense: true, SessionStartBeforeMin: 15, ReleaseBeforeMin: 10,
			BookingIntervalMin: 30, HoldMinutes: 15, AllowPreorder: true,
		},
		{
			ID: "venue-9", CityID: balti.ID,
			Name: models.LocalizedString{RU: "Wine House Bălți", EN: "Wine House Bălți", RO: "Wine House Bălți"},
			Description: models.LocalizedString{
				RU: "Коллекция лучших молдавских вин, сырные и мясные тарелки, европейские блюда",
				EN: "Fine Moldovan wine collection, cheese platters and European dining",
				RO: "Colecție de vinuri alese din Moldova, platouri asortate și preparate europene",
			},
			Cuisine: []string{"wine", "european"}, Rating: 4.9, ReviewCount: 112, PriceLevel: 3,
			Address: models.LocalizedString{RU: "ул. Александру чел Бун 5", EN: "Strada Alexandru cel Bun 5", RO: "Strada Alexandru cel Bun 5"},
			Lat:     47.7580, Lng: 27.9290, AverageCheck: 380, OpenNow: true,
			ImageURL:       "https://images.unsplash.com/photo-1510812431401-41d2bd2722f3?auto=format&fit=crop&w=1200&q=80",
			AlcoholLicense: true, SessionStartBeforeMin: 15, ReleaseBeforeMin: 10,
			BookingIntervalMin: 30, HoldMinutes: 15, AllowPreorder: true,
		},
		{
			ID: "venue-10", CityID: balti.ID,
			Name: models.LocalizedString{RU: "Andy's", EN: "Andy's", RO: "Andy's"},
			Description: models.LocalizedString{
				RU: "Популярная пицца, паста, салаты и детское меню для всей семьи",
				EN: "Popular pizza, pasta, fresh salads and kids menu for the whole family",
				RO: "Pizza populară, paste, salate proaspete și meniu pentru copii",
			},
			Cuisine: []string{"pizza", "family", "european"}, Rating: 4.4, ReviewCount: 420, PriceLevel: 1,
			Address: models.LocalizedString{RU: "ул. Штефан чел Маре 57", EN: "Strada Ștefan cel Mare 57", RO: "Strada Ștefan cel Mare 57"},
			Lat:     47.7605, Lng: 27.9265, AverageCheck: 160, OpenNow: true,
			ImageURL:       "https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&w=1200&q=80",
			AlcoholLicense: true, SessionStartBeforeMin: 15, ReleaseBeforeMin: 10,
			BookingIntervalMin: 30, HoldMinutes: 15, AllowPreorder: true,
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
		UserID:      demoCalendarGuestID,
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
			UserID:      demoCalendarGuestID,
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

	// Seed demo guest reservations and inquiries for demoGuestID ("user-guest-demo")
	activeDemoResID := "res-guest-demo-active"
	historyDemoResID := "res-guest-demo-history"
	s.reservations[activeDemoResID] = models.Reservation{
		ID:          activeDemoResID,
		UserID:      demoGuestID,
		VenueID:     "venue-1",
		TableID:     "t3",
		Guests:      4,
		ReservedFor: time.Date(now.Year(), now.Month(), now.Day(), 19, 30, 0, 0, now.Location()).UTC(),
		Status:      models.ReservationConfirmed,
		Source:      models.ReservationSourceWeb,
		Notes:       "Столик у панорамного окна, празднуем годовщину",
		CreatedAt:   now.Add(-2 * time.Hour).UTC(),
		UpdatedAt:   now.UTC(),
	}
	s.reservations[historyDemoResID] = models.Reservation{
		ID:          historyDemoResID,
		UserID:      demoGuestID,
		VenueID:     "venue-2",
		TableID:     "t2",
		Guests:      2,
		ReservedFor: now.Add(-72 * time.Hour).UTC(),
		Status:      models.ReservationCheckedIn,
		Source:      models.ReservationSourceWeb,
		Notes:       "Ужин для двоих",
		CreatedAt:   now.Add(-74 * time.Hour).UTC(),
		UpdatedAt:   now.Add(-70 * time.Hour).UTC(),
	}

	demoInqID := "inq-guest-demo"
	s.eventInquiries[demoInqID] = models.EventInquiry{
		ID:            demoInqID,
		UserID:        demoGuestID,
		VenueID:       "venue-1",
		VenueName:     models.LocalizedString{RU: "Beermaster Pub", EN: "Beermaster Pub", RO: "Beermaster Pub"},
		EventType:     "birthday",
		GuestCount:    14,
		PreferredDate: now.Add(5 * 24 * time.Hour).UTC(),
		ContactMethod: "chat",
		ContactPhone:  "+373 68 123 456",
		ContactName:   "Александр Смирнов",
		Notes:         "Отдельная зона на террасе, банкетное меню и индивидуальная подача",
		Status:        "PENDING",
		AdminPhone:    "+373 (231) 2-44-11",
		AdminTelegram: "@seatiko_admin",
		CreatedAt:     now.Add(-6 * time.Hour).UTC(),
		UpdatedAt:     now.Add(-6 * time.Hour).UTC(),
	}

	for _, m := range demoMenu() {
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
			Email:        "admin@seatiko.local",
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
			ID:              demoGuestID,
			Email:           "guest@seatiko.local",
			PasswordHash:    string(guestHash),
			FirstName:       "Александр",
			LastName:        "Смирнов",
			DisplayName:     "Alex Smirnov",
			Phone:           "+373 68 123 456",
			Locale:          "ru",
			Role:            models.RoleGuest,
			DietPreferences: []string{"Вегетарианство", "Без лактозы"},
			FavoriteVenues:  []string{"venue-1", "venue-2", "venue-3"},
			CreatedAt:       time.Now().UTC(),
			UpdatedAt:       time.Now().UTC(),
		}
		s.users[guest.ID] = guest
	}

	guestCalHash, err := bcrypt.GenerateFromPassword([]byte("guest123"), bcrypt.DefaultCost)
	if err == nil {
		guestCal := models.User{
			ID:           demoCalendarGuestID,
			Email:        "guest.calendar@seatiko.local",
			PasswordHash: string(guestCalHash),
			FirstName:    "Иван",
			LastName:     "Селезнёв",
			DisplayName:  "Иван Селезнёв",
			Locale:       "ru",
			Role:         models.RoleGuest,
			CreatedAt:    time.Now().UTC(),
			UpdatedAt:    time.Now().UTC(),
		}
		s.users[guestCal.ID] = guestCal
	}

	ownerHash, err := bcrypt.GenerateFromPassword([]byte("owner123"), bcrypt.DefaultCost)
	if err == nil {
		demoOwnerID := "user-demo-owner"
		owner := models.User{
			ID:           demoOwnerID,
			Email:        "owner@seatiko.local",
			PasswordHash: string(ownerHash),
			FirstName:    "Дмитрий",
			LastName:     "Волков",
			DisplayName:  "Дмитрий Волков",
			Phone:        "+373 69 987 654",
			Locale:       "ru",
			Role:         models.RoleRestaurant,
			CreatedAt:    time.Now().UTC(),
			UpdatedAt:    time.Now().UTC(),
		}
		s.users[owner.ID] = owner

		venueID := "venue-1"
		v1 := s.venues[venueID]
		appID := "app-demo-owner"
		s.applications[appID] = models.VenueApplication{
			ID:           appID,
			OwnerUserID:  owner.ID,
			VenueID:      &venueID,
			CityID:       v1.CityID,
			Name:         v1.Name,
			Description:  v1.Description,
			Address:      v1.Address,
			Cuisine:      v1.Cuisine,
			Phone:        v1.Phone,
			HoursText:    "Пн-Вс 10:00 - 23:00",
			Email:        owner.Email,
			Website:      v1.Website,
			Lat:          v1.Lat,
			Lng:          v1.Lng,
			PriceLevel:   v1.PriceLevel,
			AverageCheck: v1.AverageCheck,
			PhotoURLs:    v1.PhotoURLs,
			Status:       models.AppPublished,
			CreatedAt:    time.Now().UTC(),
			UpdatedAt:    time.Now().UTC(),
		}
	}

	staffHash, err := bcrypt.GenerateFromPassword([]byte("staff123"), bcrypt.DefaultCost)
	if err == nil {
		staff := models.User{
			ID:           demoStaffID,
			Email:        "staff@seatiko.local",
			PasswordHash: string(staffHash),
			FirstName:    "Анна",
			LastName:     "Официант",
			DisplayName:  "Анна (Персонал)",
			Phone:        "+373 68 555 444",
			Locale:       "ru",
			Role:         models.RoleStaff,
			CreatedAt:    time.Now().UTC(),
			UpdatedAt:    time.Now().UTC(),
		}
		s.users[staff.ID] = staff

		s.staffMembers[demoStaffMemberID] = models.StaffMember{
			ID:        demoStaffMemberID,
			VenueID:   "venue-1",
			UserID:    staff.ID,
			Name:      staff.DisplayName,
			Email:     staff.Email,
			Role:      models.StaffRoleWaiter,
			Status:    models.StaffStatusActive,
			OnShift:   true,
			CreatedAt: time.Now().UTC(),
		}

		demoStaffMemberID2 := "staff-member-demo-2"
		s.staffMembers[demoStaffMemberID2] = models.StaffMember{
			ID:        demoStaffMemberID2,
			VenueID:   "venue-1",
			Name:      "Alexandru Rusu",
			Email:     "alex.rusu@seatiko.local",
			Role:      models.StaffRoleWaiter,
			Status:    models.StaffStatusActive,
			OnShift:   false,
			CreatedAt: time.Now().UTC().Add(-24 * time.Hour),
		}

		demoStaffMemberID3 := "staff-member-demo-3"
		s.staffMembers[demoStaffMemberID3] = models.StaffMember{
			ID:        demoStaffMemberID3,
			VenueID:   "venue-1",
			Name:      "Elena Moraru",
			Email:     "elena.moraru@seatiko.local",
			Role:      models.StaffRoleCook,
			Status:    models.StaffStatusActive,
			OnShift:   true,
			CreatedAt: time.Now().UTC().Add(-48 * time.Hour),
		}

		demoStaffMemberID4 := "staff-member-demo-4"
		s.staffMembers[demoStaffMemberID4] = models.StaffMember{
			ID:        demoStaffMemberID4,
			VenueID:   "venue-1",
			Name:      "Mihail Ceban",
			Email:     "mihail.ceban@seatiko.local",
			Role:      models.StaffRoleCook,
			Status:    models.StaffStatusActive,
			OnShift:   false,
			CreatedAt: time.Now().UTC().Add(-72 * time.Hour),
		}

		todayStr := time.Now().UTC().Format("2006-01-02")
		tomorrowStr := time.Now().UTC().Add(24 * time.Hour).Format("2006-01-02")

		s.shifts["shift-demo-1"] = models.WorkShift{
			ID:        "shift-demo-1",
			VenueID:   "venue-1",
			StaffID:   demoStaffMemberID,
			StaffName: staff.DisplayName,
			Role:      models.StaffRoleWaiter,
			Date:      todayStr,
			StartTime: "10:00",
			EndTime:   "22:00",
			Status:    models.ShiftStatusConfirmed,
			Note:      "Основной зал",
			CreatedAt: time.Now().UTC(),
			UpdatedAt: time.Now().UTC(),
		}

		s.shifts["shift-demo-2"] = models.WorkShift{
			ID:        "shift-demo-2",
			VenueID:   "venue-1",
			StaffID:   demoStaffMemberID2,
			StaffName: "Alexandru Rusu",
			Role:      models.StaffRoleWaiter,
			Date:      tomorrowStr,
			StartTime: "14:00",
			EndTime:   "23:00",
			Status:    models.ShiftStatusPending,
			Note:      "Вечерняя смена / терраса",
			CreatedAt: time.Now().UTC(),
			UpdatedAt: time.Now().UTC(),
		}

		s.shifts["shift-demo-3"] = models.WorkShift{
			ID:        "shift-demo-3",
			VenueID:   "venue-1",
			StaffID:   demoStaffMemberID3,
			StaffName: "Elena Moraru",
			Role:      models.StaffRoleCook,
			Date:      todayStr,
			StartTime: "09:00",
			EndTime:   "18:00",
			Status:    models.ShiftStatusConfirmed,
			Note:      "Шеф / горячий цех",
			CreatedAt: time.Now().UTC(),
			UpdatedAt: time.Now().UTC(),
		}

		s.shifts["shift-demo-4"] = models.WorkShift{
			ID:        "shift-demo-4",
			VenueID:   "venue-1",
			StaffID:   demoStaffMemberID4,
			StaffName: "Mihail Ceban",
			Role:      models.StaffRoleCook,
			Date:      tomorrowStr,
			StartTime: "12:00",
			EndTime:   "23:00",
			Status:    models.ShiftStatusPending,
			Note:      "Холодный цех / заготовки",
			CreatedAt: time.Now().UTC(),
			UpdatedAt: time.Now().UTC(),
		}
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
	sort.Slice(out, func(i, j int) bool { return out[i].ID < out[j].ID })
	return out
}

func (s *MemoryStore) ListVenues(cityID string) []models.Venue {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.listVenuesLocked(cityID)
}

func (s *MemoryStore) ListMapVenues(cityID string) ([]models.Venue, map[string]bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	venues := s.listVenuesLocked(cityID)
	bookable := make(map[string]bool)
	for _, table := range s.tables {
		if table.Seats > 0 {
			bookable[table.VenueID] = true
		}
	}
	return venues, bookable
}

func (s *MemoryStore) listVenuesLocked(cityID string) []models.Venue {
	out := make([]models.Venue, 0)
	for _, v := range s.venues {
		if cityID == "" || v.CityID == cityID {
			out = append(out, v)
		}
	}
	return out
}

func (s *MemoryStore) venueFromApplicationLocked(app models.VenueApplication) models.Venue {
	imageURL := ""
	if len(app.PhotoURLs) > 0 {
		imageURL = app.PhotoURLs[0]
	}
	cityID := app.CityID
	if cityID == "" {
		cityID = DefaultCityID
	}
	cuisine := app.Cuisine
	if cuisine == nil {
		cuisine = []string{}
	}
	interval := app.BookingIntervalMin
	if interval == 0 {
		interval = DefaultBookingIntervalMin
	}
	hold := app.HoldMinutes
	if hold == 0 {
		hold = DefaultHoldMinutes
	}
	startBefore := app.SessionStartBeforeMin
	if startBefore == 0 {
		startBefore = DefaultSessionStartBeforeMin
	}
	relBefore := app.ReleaseBeforeMin
	if relBefore == 0 {
		relBefore = DefaultReleaseBeforeMin
	}
	visitDur := app.VisitDurationMin
	if visitDur == 0 {
		visitDur = DefaultVisitDurationMin
	}
	maxVisitDur := app.MaxVisitDurationMin
	if maxVisitDur == 0 {
		maxVisitDur = DefaultMaxVisitDurationMin
	}
	lateArrival := app.MaxLateArrivalMin
	if lateArrival == 0 {
		lateArrival = DefaultMaxLateArrivalMin
	}
	return models.Venue{
		ID:                    app.ID,
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
		PhotoURLs:             app.PhotoURLs,
		Website:               app.Website,
		AlcoholLicense:        false,
		SessionStartBeforeMin: startBefore,
		ReleaseBeforeMin:      relBefore,
		BookingIntervalMin:    interval,
		HoldMinutes:           hold,
		MaxLateArrivalMin:     lateArrival,
		VisitDurationMin:      visitDur,
		MaxVisitDurationMin:   maxVisitDur,
		AllowPreorder:         app.AllowPreorder,
	}
}

func (s *MemoryStore) resolveVenueIDLocked(venueID string) string {
	if app, ok := s.applications[venueID]; ok && app.VenueID != nil && *app.VenueID != "" {
		return *app.VenueID
	}
	return venueID
}

func (s *MemoryStore) GetVenue(id string) (models.Venue, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	v, ok := s.venues[id]
	if ok {
		return v, nil
	}
	if app, ok := s.applications[id]; ok {
		if app.VenueID != nil && *app.VenueID != "" {
			if pv, ok := s.venues[*app.VenueID]; ok {
				return pv, nil
			}
		}
		return s.venueFromApplicationLocked(app), nil
	}
	return models.Venue{}, ErrNotFound
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

func (s *MemoryStore) UpdateEmail(userID, newEmail string) (models.User, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	defer s.persistBestEffortLocked()

	u, ok := s.users[userID]
	if !ok {
		return models.User{}, ErrNotFound
	}
	newEmail = strings.TrimSpace(strings.ToLower(newEmail))
	if _, err := mail.ParseAddress(newEmail); err != nil {
		return models.User{}, ErrBadRequest
	}
	for id, other := range s.users {
		if id != userID && strings.EqualFold(other.Email, newEmail) {
			return models.User{}, ErrEmailTaken
		}
	}
	u.Email = newEmail
	u.UpdatedAt = time.Now().UTC()
	s.users[userID] = u
	return u, nil
}

func (s *MemoryStore) UpdatePassword(userID, oldPassword, newPassword string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	defer s.persistBestEffortLocked()

	u, ok := s.users[userID]
	if !ok {
		return ErrNotFound
	}
	if len(newPassword) < 6 {
		return ErrBadRequest
	}
	if err := bcrypt.CompareHashAndPassword([]byte(u.PasswordHash), []byte(oldPassword)); err != nil {
		return ErrInvalidCreds
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(newPassword), bcrypt.DefaultCost)
	if err != nil {
		return err
	}
	u.PasswordHash = string(hash)
	u.UpdatedAt = time.Now().UTC()
	s.users[userID] = u
	return nil
}

func (s *MemoryStore) CreateReservation(userID, venueID, tableID string, guests int, reservedFor time.Time, source ...string) (models.Reservation, error) {
	return s.CreateReservationWithTables(userID, venueID, []string{tableID}, guests, reservedFor, "", source...)
}

func (s *MemoryStore) CreateReservationWithTables(userID, venueID string, tableIDs []string, guests int, reservedFor time.Time, notes string, source ...string) (models.Reservation, error) {
	return s.CreateReservationWithDuration(userID, venueID, tableIDs, guests, reservedFor, 0, notes, source...)
}

// CreateReservationWithDuration books tables for durationMin minutes (0 = venue default),
// limited to [MinVisitDurationMin, venue max_visit_duration_min].
func (s *MemoryStore) CreateReservationWithDuration(userID, venueID string, tableIDs []string, guests int, reservedFor time.Time, durationMin int, notes string, source ...string) (models.Reservation, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	defer s.persistBestEffortLocked()

	if _, ok := s.users[userID]; !ok {
		return models.Reservation{}, ErrNotFound
	}
	if _, ok := s.venues[venueID]; !ok {
		return models.Reservation{}, ErrNotFound
	}
	if len(tableIDs) == 0 {
		return models.Reservation{}, ErrBadRequest
	}
	if guests < 1 {
		return models.Reservation{}, ErrBadRequest
	}
	venue := s.venues[venueID]
	if durationMin == 0 {
		durationMin = visitMinutes(venue)
	}
	if durationMin < MinVisitDurationMin || durationMin > maxVisitMinutes(venue) {
		return models.Reservation{}, ErrInvalidDuration
	}
	span := time.Duration(durationMin) * time.Minute

	now := time.Now().UTC()

	// Anti-spam check: prevent duplicate simultaneous active bookings
	for _, existing := range s.reservations {
		if existing.UserID == userID &&
			(existing.Status == models.ReservationConfirmed || existing.Status == models.ReservationCheckedIn) &&
			existing.ReservedFor.After(now.Add(-3*time.Hour)) {
			return models.Reservation{}, ErrActiveReservationExists
		}
	}

	tableMap := make(map[string]models.Table, len(tableIDs))
	var tableNumbers []int
	for _, tid := range tableIDs {
		t, ok := s.tables[tid]
		if !ok || t.VenueID != venueID {
			return models.Reservation{}, ErrNotFound
		}
		if s.tableBusyAtLocked(t, reservedFor, span, now) {
			return models.Reservation{}, ErrTableNotFree
		}
		tableMap[tid] = t
		tableNumbers = append(tableNumbers, t.Number)
	}

	primaryTableID := tableIDs[0]
	reservationSource := models.ReservationSourceWeb
	if len(source) > 0 {
		switch strings.ToUpper(source[0]) {
		case models.ReservationSourceAndroid, models.ReservationSourceIOS, models.ReservationSourcePhone, models.ReservationSourceWalkIn:
			reservationSource = strings.ToUpper(source[0])
		}
	}

	id := uuid.NewString()
	res := models.Reservation{
		ID:           id,
		UserID:       userID,
		VenueID:      venueID,
		TableID:      primaryTableID,
		TableNumber:  tableNumbers[0],
		TableIDs:     tableIDs,
		TableNumbers: tableNumbers,
		Guests:       guests,
		ReservedFor:  reservedFor,
		DurationMin:  durationMin,
		Status:       models.ReservationConfirmed,
		Source:       reservationSource,
		Notes:        notes,
		CreatedAt:    now,
		UpdatedAt:    now,
	}

	rf := reservedFor
	for _, tid := range tableIDs {
		t := tableMap[tid]
		switch {
		case t.Status == models.TableFree,
			t.Status == models.TableReserved && (t.ReservedFor == nil || reservedFor.Before(*t.ReservedFor)):
			// The table shows its nearest booking; seated / cleaning tables keep their live state.
			t.Status = models.TableReserved
			t.ReservedFor = &rf
			t.ReservationID = &id
			s.tables[tid] = t
		}
	}

	s.reservations[id] = res
	s.refreshFreeTablesLocked(venueID)
	return res, nil
}

// reservationWindow is the span a reservation blocks the table: from reserved_for
// until a full visit after the (possibly late) announced arrival.
func reservationWindow(r models.Reservation, visit time.Duration) (time.Time, time.Time) {
	start := r.ReservedFor
	from := start
	if r.ExpectedArrival != nil && r.ExpectedArrival.After(from) {
		from = *r.ExpectedArrival
	}
	return start, from.Add(visit)
}

// occupiedUntil estimates when a seated / cleaning table becomes free.
func occupiedUntil(t models.Table, now time.Time, visit time.Duration) time.Time {
	until := now.Add(15 * time.Minute)
	if t.OccupiedSince != nil {
		if end := t.OccupiedSince.Add(visit); end.After(until) {
			until = end
		}
	}
	return until
}

// visitDurationLocked is the venue's default booking length. Callers must hold s.mu.
func (s *MemoryStore) visitDurationLocked(venueID string) time.Duration {
	return time.Duration(visitMinutes(s.venues[venueID])) * time.Minute
}

// reservationDurationLocked is how long a reservation holds its table. Callers must hold s.mu.
func (s *MemoryStore) reservationDurationLocked(r models.Reservation) time.Duration {
	return time.Duration(reservationMinutes(r, s.venues[r.VenueID])) * time.Minute
}

// tableBusyAtLocked reports whether a booking of length span starting at start would
// overlap the table's existing bookings or its current occupancy. Callers must hold s.mu.
func (s *MemoryStore) tableBusyAtLocked(t models.Table, start time.Time, span time.Duration, now time.Time) bool {
	visit := s.visitDurationLocked(t.VenueID)
	end := start.Add(span)
	overlaps := func(from time.Time) bool { return start.Before(from.Add(visit)) && end.After(from) }

	for _, r := range s.reservations {
		if r.Status != models.ReservationConfirmed && r.Status != models.ReservationCheckedIn {
			continue
		}
		uses := r.TableID == t.ID
		for _, tid := range r.TableIDs {
			uses = uses || tid == t.ID
		}
		if !uses {
			continue
		}
		rs, re := reservationWindow(r, s.reservationDurationLocked(r))
		if start.Before(re) && end.After(rs) {
			return true
		}
	}
	switch t.Status {
	case models.TableOccupied, models.TableCleaning:
		return start.Before(occupiedUntil(t, now, visit))
	case models.TableReserved:
		return t.ReservedFor != nil && overlaps(*t.ReservedFor)
	}
	return false
}

func (s *MemoryStore) UpdateReservation(userID, reservationID string, tableIDs []string, guests int, reservedFor time.Time, notes string) (models.Reservation, error) {
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
	if guests < 1 {
		return models.Reservation{}, ErrBadRequest
	}

	if len(tableIDs) == 0 {
		if len(r.TableIDs) > 0 {
			tableIDs = r.TableIDs
		} else {
			tableIDs = []string{r.TableID}
		}
	}

	currentTableSet := map[string]bool{r.TableID: true}
	for _, tid := range r.TableIDs {
		currentTableSet[tid] = true
	}

	var tableNumbers []int
	for _, tid := range tableIDs {
		t, ok := s.tables[tid]
		if !ok || t.VenueID != r.VenueID {
			return models.Reservation{}, ErrNotFound
		}
		if !currentTableSet[tid] && t.Status != models.TableFree {
			return models.Reservation{}, ErrTableNotFree
		}
		tableNumbers = append(tableNumbers, t.Number)
	}

	newTableSet := map[string]bool{}
	for _, tid := range tableIDs {
		newTableSet[tid] = true
	}
	for oldTid := range currentTableSet {
		if !newTableSet[oldTid] {
			if t, ok := s.tables[oldTid]; ok {
				t.Status = models.TableFree
				t.ReservedFor = nil
				t.ReservationID = nil
				s.tables[oldTid] = t
			}
		}
	}

	rf := reservedFor
	for _, tid := range tableIDs {
		if t, ok := s.tables[tid]; ok {
			t.Status = models.TableReserved
			t.ReservedFor = &rf
			t.ReservationID = &r.ID
			s.tables[tid] = t
		}
	}

	r.TableID = tableIDs[0]
	r.TableIDs = tableIDs
	r.TableNumbers = tableNumbers
	r.Guests = guests
	r.ReservedFor = reservedFor
	if notes != "" {
		r.Notes = notes
	}
	r.UpdatedAt = time.Now().UTC()
	s.reservations[reservationID] = r
	s.refreshFreeTablesLocked(r.VenueID)
	return r, nil
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
		limit := time.Duration(maxLateArrivalMinutes(s.venues[r.VenueID])) * time.Minute
		if ea.After(r.ReservedFor.Add(limit)) {
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
		}
	}
	for _, tid := range r.TableIDs {
		if t, ok := s.tables[tid]; ok {
			if t.ReservationID != nil && *t.ReservationID == reservationID {
				t.Status = models.TableFree
				t.ReservedFor = nil
				t.ReservationID = nil
				s.tables[tid] = t
			}
		}
	}
	s.refreshFreeTablesLocked(r.VenueID)
	return r, nil
}

func (s *MemoryStore) DeleteReservation(userID, reservationID string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	defer s.persistBestEffortLocked()

	r, ok := s.reservations[reservationID]
	if !ok {
		return ErrNotFound
	}
	if r.UserID != userID {
		return ErrForbidden
	}

	// Free single table if reserved by this reservation
	if t, ok := s.tables[r.TableID]; ok {
		if t.ReservationID != nil && *t.ReservationID == reservationID {
			t.Status = models.TableFree
			t.ReservedFor = nil
			t.ReservationID = nil
			s.tables[r.TableID] = t
		}
	}
	// Free multiple tables if reserved
	for _, tid := range r.TableIDs {
		if t, ok := s.tables[tid]; ok {
			if t.ReservationID != nil && *t.ReservationID == reservationID {
				t.Status = models.TableFree
				t.ReservedFor = nil
				t.ReservationID = nil
				s.tables[tid] = t
			}
		}
	}
	s.refreshFreeTablesLocked(r.VenueID)

	delete(s.reservations, reservationID)
	return nil
}

func (s *MemoryStore) ClearHistoryReservations(userID string) int {
	s.mu.Lock()
	defer s.mu.Unlock()
	defer s.persistBestEffortLocked()

	cleared := 0
	for id, r := range s.reservations {
		if r.UserID != userID {
			continue
		}
		if r.Status == models.ReservationCancelled || r.Status == models.ReservationCheckedIn || r.ReservedFor.Before(time.Now().Add(-2*time.Hour)) {
			if t, ok := s.tables[r.TableID]; ok && t.ReservationID != nil && *t.ReservationID == id {
				t.Status = models.TableFree
				t.ReservedFor = nil
				t.ReservationID = nil
				s.tables[r.TableID] = t
			}
			for _, tid := range r.TableIDs {
				if t, ok := s.tables[tid]; ok && t.ReservationID != nil && *t.ReservationID == id {
					t.Status = models.TableFree
					t.ReservedFor = nil
					t.ReservationID = nil
					s.tables[tid] = t
				}
			}
			s.refreshFreeTablesLocked(r.VenueID)
			delete(s.reservations, id)
			cleared++
		}
	}
	return cleared
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
		var nums []int
		if table, ok := s.tables[r.TableID]; ok {
			r.TableNumber = table.Number
			nums = append(nums, table.Number)
		}
		for _, tid := range r.TableIDs {
			if tid != r.TableID {
				if t, ok := s.tables[tid]; ok {
					nums = append(nums, t.Number)
				}
			}
		}
		if len(nums) > 0 {
			r.TableNumbers = nums
		}
		out = append(out, r)
	}
	sort.Slice(out, func(i, j int) bool {
		return out[i].ReservedFor.After(out[j].ReservedFor)
	})
	return out
}

func (s *MemoryStore) CreateEventInquiry(userID string, in models.EventInquiry) (models.EventInquiry, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	defer s.persistBestEffortLocked()

	if _, ok := s.users[userID]; !ok {
		return models.EventInquiry{}, ErrNotFound
	}
	venue, ok := s.venues[in.VenueID]
	if !ok {
		return models.EventInquiry{}, ErrNotFound
	}
	if in.GuestCount < 1 {
		return models.EventInquiry{}, ErrBadRequest
	}

	now := time.Now().UTC()
	id := uuid.NewString()

	adminPhone := venue.Phone
	if adminPhone == "" {
		adminPhone = "+373 (231) 2-44-11"
	}
	adminTelegram := "@seatiko_admin"

	inquiry := models.EventInquiry{
		ID:            id,
		UserID:        userID,
		VenueID:       in.VenueID,
		VenueName:     venue.Name,
		EventType:     in.EventType,
		GuestCount:    in.GuestCount,
		PreferredDate: in.PreferredDate,
		ContactMethod: in.ContactMethod,
		ContactPhone:  in.ContactPhone,
		ContactName:   in.ContactName,
		Notes:         in.Notes,
		Status:        "PENDING",
		AdminPhone:    adminPhone,
		AdminTelegram: adminTelegram,
		CreatedAt:     now,
		UpdatedAt:     now,
	}

	s.eventInquiries[id] = inquiry
	return inquiry, nil
}

func (s *MemoryStore) ListEventInquiries(userID string) []models.EventInquiry {
	s.mu.RLock()
	defer s.mu.RUnlock()

	out := make([]models.EventInquiry, 0)
	for _, inq := range s.eventInquiries {
		if inq.UserID == userID {
			if venue, ok := s.venues[inq.VenueID]; ok {
				inq.VenueName = venue.Name
			}
			out = append(out, inq)
		}
	}
	sort.Slice(out, func(i, j int) bool {
		return out[i].CreatedAt.After(out[j].CreatedAt)
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
	sortMenu(out)
	return out, nil
}

// sortMenu orders dishes by their seeded position; dishes added later by the
// owner (no position) go after the seeded ones, by id for a stable order.
func sortMenu(items []models.MenuItem) {
	sort.SliceStable(items, func(i, j int) bool {
		pi, pj := items[i].Position, items[j].Position
		if (pi == 0) != (pj == 0) {
			return pj == 0
		}
		if pi != pj {
			return pi < pj
		}
		return items[i].ID < items[j].ID
	})
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

	visit := s.visitDurationLocked(venueID)
	now := time.Now().UTC()
	out := make([]models.VenueScheduleSlot, 0)

	for _, reservation := range s.reservations {
		if reservation.VenueID != venueID {
			continue
		}
		if reservation.Status == models.ReservationCancelled || reservation.Status == models.ReservationNoShow {
			continue
		}
		table := s.tables[reservation.TableID]
		start, end := reservationWindow(reservation, s.reservationDurationLocked(reservation))
		out = append(out, models.VenueScheduleSlot{
			ID:          reservation.ID,
			TableID:     reservation.TableID,
			TableNumber: table.Number,
			StartsAt:    start,
			EndsAt:      end,
			Kind:        "RESERVATION",
		})
	}

	// Live table states the guest sees on the floor must also appear on the board:
	// a reservation whose record is gone, and guests seated right now.
	for _, table := range s.tables {
		if table.VenueID != venueID || table.Status != models.TableReserved || table.ReservedFor == nil {
			continue
		}
		start := table.ReservedFor.UTC()
		covered := false
		for _, slot := range out {
			if slot.TableID == table.ID && slot.StartsAt.Equal(start) {
				covered = true
				break
			}
		}
		if covered {
			continue
		}
		out = append(out, models.VenueScheduleSlot{
			ID:          "res-" + table.ID,
			TableID:     table.ID,
			TableNumber: table.Number,
			StartsAt:    start,
			EndsAt:      start.Add(visit),
			Kind:        "RESERVATION",
		})
	}

	for _, table := range s.tables {
		if table.VenueID != venueID || table.Status != models.TableOccupied {
			continue
		}
		end := occupiedUntil(table, now, visit)
		start := end.Add(-visit)
		if table.OccupiedSince != nil && table.OccupiedSince.Before(start) {
			start = table.OccupiedSince.UTC()
		}
		// Seated long ago: show the block for the current visit, not since an old marker.
		if start.Before(now.Add(-12 * time.Hour)) {
			start = now.Add(-visit)
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
	if patch.CityID != nil && *patch.CityID != app.CityID {
		if city, exists := s.cities[*patch.CityID]; !exists || city.Country != "MD" {
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
	coordinatesValid := MoldovaBounds.Contains(app.Lat, app.Lng)
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
	bookingInterval := app.BookingIntervalMin
	if bookingInterval == 0 {
		bookingInterval = DefaultBookingIntervalMin
	}
	holdMinutes := app.HoldMinutes
	if holdMinutes == 0 {
		holdMinutes = DefaultHoldMinutes
	}
	sessionStartBefore := app.SessionStartBeforeMin
	if sessionStartBefore == 0 {
		sessionStartBefore = DefaultSessionStartBeforeMin
	}
	releaseBefore := app.ReleaseBeforeMin
	if releaseBefore == 0 {
		releaseBefore = DefaultReleaseBeforeMin
	}
	visitDuration := app.VisitDurationMin
	if visitDuration == 0 {
		visitDuration = DefaultVisitDurationMin
	}
	maxVisitDuration := app.MaxVisitDurationMin
	if maxVisitDuration == 0 {
		maxVisitDuration = DefaultMaxVisitDurationMin
	}
	maxLateArrival := app.MaxLateArrivalMin
	if maxLateArrival == 0 {
		maxLateArrival = DefaultMaxLateArrivalMin
	}
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
		SessionStartBeforeMin: sessionStartBefore,
		ReleaseBeforeMin:      releaseBefore,
		BookingIntervalMin:    bookingInterval,
		HoldMinutes:           holdMinutes,
		MaxLateArrivalMin:     maxLateArrival,
		VisitDurationMin:      visitDuration,
		MaxVisitDurationMin:   maxVisitDuration,
		AllowPreorder:         app.AllowPreorder,
	}
	s.venues[venueID] = venue

	// If the owner configured tables for this application during onboarding, migrate them
	hasExistingTables := false
	for _, t := range s.tables {
		if t.VenueID == id {
			hasExistingTables = true
			break
		}
	}
	if hasExistingTables {
		for tID, t := range s.tables {
			if t.VenueID == id {
				t.VenueID = venueID
				t.QRToken = qr.Sign(s.qrSecret, venueID, t.ID)
				s.tables[tID] = t
			}
		}
	} else {
		// Start every published restaurant without pre-set tables with an editable, booking-ready layout
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
	}
	s.refreshFreeTablesLocked(venueID)

	// Migrate any menu items created under this application during onboarding
	for mID, item := range s.menuItems {
		if item.VenueID == id {
			item.VenueID = venueID
			s.menuItems[mID] = item
		}
	}

	// Migrate any staff members invited under this application during onboarding
	for sID, member := range s.staffMembers {
		if member.VenueID == id {
			member.VenueID = venueID
			s.staffMembers[sID] = member
		}
	}

	// Migrate any work shifts scheduled under this application during onboarding
	for shID, shift := range s.shifts {
		if shift.VenueID == id {
			shift.VenueID = venueID
			s.shifts[shID] = shift
		}
	}

	now := time.Now().UTC()
	app.Status = models.AppPublished
	app.VenueID = &venueID
	app.UpdatedAt = now
	s.applications[id] = app
	s.recordActivityLocked(id, adminID, "APPLICATION_PUBLISHED", nil, "")
	return app, nil
}
