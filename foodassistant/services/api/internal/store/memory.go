package store

import (
	"errors"
	"sync"
	"time"

	"github.com/foodassistant/api/internal/models"
	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"
)

var (
	ErrNotFound      = errors.New("not found")
	ErrEmailTaken    = errors.New("email already registered")
	ErrInvalidCreds  = errors.New("invalid credentials")
)

type MemoryStore struct {
	mu     sync.RWMutex
	cities map[string]models.City
	venues map[string]models.Venue
	tables map[string]models.Table
	users  map[string]models.User
}

func NewMemory() *MemoryStore {
	s := &MemoryStore{
		cities: make(map[string]models.City),
		venues: make(map[string]models.Venue),
		tables: make(map[string]models.Table),
		users:  make(map[string]models.User),
	}
	s.seed()
	return s
}

func (s *MemoryStore) seed() {
	balti := models.City{
		ID:   "city-balti",
		Slug: "balti",
		Name: models.LocalizedString{RU: "Бельцы", EN: "Bălți", RO: "Bălți"},
		Available: true,
		Country:   "MD",
	}
	s.cities[balti.ID] = balti
	s.cities["city-chisinau"] = models.City{
		ID: "city-chisinau", Slug: "chisinau",
		Name: models.LocalizedString{RU: "Кишинёв", EN: "Chișinău", RO: "Chișinău"},
		Available: false, Country: "MD",
	}
	s.cities["city-cahul"] = models.City{
		ID: "city-cahul", Slug: "cahul",
		Name: models.LocalizedString{RU: "Кагул", EN: "Cahul", RO: "Cahul"},
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
			Address: models.LocalizedString{RU: "ул. Независимости 45", EN: "Independenței 45", RO: "Independenței 45"},
			Lat: 47.7617, Lng: 27.9288, AverageCheck: 250, OpenNow: true, FreeTables: 3,
			ImageURL: "/images/venues/la-placinte.jpg", AlcoholLicense: true,
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
			Address: models.LocalizedString{RU: "пл. Василия Лупу 1", EN: "Vasile Lupu Sq 1", RO: "Piața Vasile Lupu 1"},
			Lat: 47.7631, Lng: 27.9299, AverageCheck: 180, OpenNow: true, FreeTables: 5,
			ImageURL: "/images/venues/cafe-central.jpg", AlcoholLicense: false,
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
			Address: models.LocalizedString{RU: "ул. Штефана чел Маре 12", EN: "Ștefan cel Mare 12", RO: "Ștefan cel Mare 12"},
			Lat: 47.7598, Lng: 27.9255, AverageCheck: 450, OpenNow: true, FreeTables: 1,
			ImageURL: "/images/venues/steak-house.jpg", AlcoholLicense: true,
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
		{ID: "t8", VenueID: "venue-3", Number: 1, Seats: 4, Status: models.TableOccupied, OccupiedSince: &occupied, X: 0.4, Y: 0.5},
		{ID: "t9", VenueID: "venue-3", Number: 2, Seats: 2, Status: models.TableFree, X: 0.7, Y: 0.5},
	}
	for _, t := range tables {
		s.tables[t.ID] = t
	}
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
		if u.Email == email {
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

	u := models.User{
		ID:           uuid.NewString(),
		Email:        email,
		PasswordHash: string(hash),
		FirstName:    firstName,
		LastName:     lastName,
		DisplayName:  firstName,
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
		if u.Email == email {
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
