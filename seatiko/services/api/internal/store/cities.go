package store

import "github.com/seatiko/api/internal/models"

const DefaultCityID = "city-balti"

var MoldovaBounds = models.MapBounds{South: 45.45, West: 26.60, North: 48.55, East: 30.20}

func moldovaCity(slug, ru, ro string, south, west, north, east float64) models.City {
	return models.City{
		ID: "city-" + slug, Slug: slug, Name: models.LocalizedString{RU: ru, EN: ro, RO: ro},
		Available: slug == "balti", Country: "MD",
		Center: models.Coordinates{Lat: (south + north) / 2, Lng: (west + east) / 2},
		Bounds: models.MapBounds{South: south, West: west, North: north, East: east},
	}
}

func moldovaCities() []models.City {
	return []models.City{
		moldovaCity("balti", "Бельцы", "Bălți", 47.70, 27.84, 47.82, 28.02),
		moldovaCity("chisinau", "Кишинёв", "Chișinău", 46.92, 28.72, 47.12, 29.02),
		moldovaCity("cahul", "Кагул", "Cahul", 45.86, 28.14, 45.96, 28.26),
		moldovaCity("orhei", "Оргеев", "Orhei", 47.34, 28.76, 47.44, 28.89),
		moldovaCity("soroca", "Сороки", "Soroca", 48.11, 28.24, 48.21, 28.35),
		moldovaCity("ungheni", "Унгены", "Ungheni", 47.16, 27.76, 47.27, 27.88),
		moldovaCity("comrat", "Комрат", "Comrat", 46.25, 28.60, 46.34, 28.73),
		moldovaCity("edinet", "Единцы", "Edineț", 48.13, 27.24, 48.21, 27.36),
		moldovaCity("tiraspol", "Тирасполь", "Tiraspol", 46.80, 29.53, 46.90, 29.69),
	}
}

func (s *MemoryStore) GetCity(id string) (models.City, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	city, ok := s.cities[id]
	if !ok {
		return models.City{}, ErrNotFound
	}
	return city, nil
}
