package store

import (
	"log"
	"strings"
	"time"

	"github.com/seatiko/api/internal/models"
	"golang.org/x/crypto/bcrypt"
)

// demoSeedVersion is bumped when seeded venues, floor layouts, staff, or bookings expand,
// so existing persisted snapshots backfill the new test data once without overwriting edits.
const demoSeedVersion = 2

func ptrTime(t time.Time) *time.Time { return &t }
func ptrStr(s string) *string       { return &s }

// seedExtendedDemoLocked adds rich multi-restaurant, multi-zone floor plans,
// staff rosters, shifts, diverse reservations, kitchen orders, waiter calls,
// waitlist entries, and event inquiries on top of the base seed.
func (s *MemoryStore) seedExtendedDemoLocked() {
	balti := s.cities[DefaultCityID]
	now := time.Now()
	today := now.In(VenueLocation)
	localSlot := func(dayOffset, hour, minute int) time.Time {
		return time.Date(today.Year(), today.Month(), today.Day()+dayOffset, hour, minute, 0, 0, VenueLocation).UTC()
	}

	// 1. Enrich existing venues 4..10 with multi-photo galleries & realistic reviews.
	enrichments := map[string]struct {
		photos  []string
		reviews []models.VenueReview
	}{
		"venue-4": {
			photos: []string{
				"https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=1200&q=80",
				"https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&w=1200&q=80",
				"https://images.unsplash.com/photo-1621996346565-e3dbc646d9a9?auto=format&fit=crop&w=1200&q=80",
			},
			reviews: []models.VenueReview{
				{Author: "Cristina D.", Rating: 5, Text: "Пицца на дровах и карбонара как в Неаполе. Уютная терраса.", Relative: "4 дня назад", Source: "google"},
				{Author: "Vlad M.", Rating: 5, Text: "Отличное обслуживание и быстрая подача для компании.", Relative: "2 недели назад", Source: "google"},
			},
		},
		"venue-5": {
			photos: []string{
				"https://images.unsplash.com/photo-1514933651103-005eec06c04b?auto=format&fit=crop&w=1200&q=80",
				"https://images.unsplash.com/photo-1608270586620-248524c67de9?auto=format&fit=crop&w=1200&q=80",
				"https://images.unsplash.com/photo-1558030006-450675393462?auto=format&fit=crop&w=1200&q=80",
			},
			reviews: []models.VenueReview{
				{Author: "Sergiu T.", Rating: 5, Text: "Лучший крафт в Бельцах и рёбра BBQ просто тают.", Relative: "3 дня назад", Source: "google"},
				{Author: "Maxim K.", Rating: 5, Text: "Живой звук по пятницам и удобный план столов.", Relative: "неделю назад", Source: "google"},
			},
		},
		"venue-6": {
			photos: []string{
				"https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=1200&q=80",
				"https://images.unsplash.com/photo-1604908176997-125f25cc6f3d?auto=format&fit=crop&w=1200&q=80",
				"https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=1200&q=80",
			},
			reviews: []models.VenueReview{
				{Author: "Tatiana B.", Rating: 5, Text: "Настоящая зама и сармале в тихом зелёном саду.", Relative: "6 дней назад", Source: "google"},
			},
		},
		"venue-7": {
			photos: []string{
				"https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=1200&q=80",
				"https://images.unsplash.com/photo-1551782450-a2132b4ba21d?auto=format&fit=crop&w=1200&q=80",
				"https://images.unsplash.com/photo-1514362545857-3bc16c4c7d1b?auto=format&fit=crop&w=1200&q=80",
			},
			reviews: []models.VenueReview{
				{Author: "Denis G.", Rating: 5, Text: "Бургер Лофт и авторские коктейли на высоте.", Relative: "неделю назад", Source: "google"},
			},
		},
		"venue-8": {
			photos: []string{
				"https://images.unsplash.com/photo-1550966871-3ed3cdb5ed0c?auto=format&fit=crop&w=1200&q=80",
				"https://images.unsplash.com/photo-1514362545857-3bc16c4c7d1b?auto=format&fit=crop&w=1200&q=80",
				"https://images.unsplash.com/photo-1551024506-0bccd828d307?auto=format&fit=crop&w=1200&q=80",
			},
			reviews: []models.VenueReview{
				{Author: "Olga N.", Rating: 5, Text: "Спокойный лаунж, вкусный лосось и отличные десерты.", Relative: "10 дней назад", Source: "google"},
			},
		},
		"venue-9": {
			photos: []string{
				"https://images.unsplash.com/photo-1510812431401-41d2bd2722f3?auto=format&fit=crop&w=1200&q=80",
				"https://images.unsplash.com/photo-1541529086526-db283c563270?auto=format&fit=crop&w=1200&q=80",
				"https://images.unsplash.com/photo-1486297678162-eb2a19b0a32d?auto=format&fit=crop&w=1200&q=80",
			},
			reviews: []models.VenueReview{
				{Author: "Victor R.", Rating: 5, Text: "Потрясающий выбор молдавских вин и сомелье.", Relative: "5 дней назад", Source: "google"},
			},
		},
		"venue-10": {
			photos: []string{
				"https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&w=1200&q=80",
				"https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?auto=format&fit=crop&w=1200&q=80",
				"https://images.unsplash.com/photo-1563805042-7684c019e1cb?auto=format&fit=crop&w=1200&q=80",
			},
			reviews: []models.VenueReview{
				{Author: "Ana S.", Rating: 4, Text: "Удобно приходить всей семьёй с детьми.", Relative: "неделю назад", Source: "google"},
			},
		},
	}
	for id, extra := range enrichments {
		if v, ok := s.venues[id]; ok {
			if len(v.PhotoURLs) < 2 {
				v.PhotoURLs = extra.photos
			}
			if len(v.Reviews) == 0 {
				v.Reviews = extra.reviews
			}
			s.venues[id] = v
		}
	}

	// 2. Add 4 new distinct restaurants in Bălți (venue-11 .. venue-14).
	extraVenues := []models.Venue{
		{
			ID: "venue-11", CityID: balti.ID,
			Name: ls("Sakura Sushi & Ramen", "Sakura Sushi & Ramen", "Sakura Sushi & Ramen"),
			Description: ls(
				"Авторские роллы, 12-часовой рамен тонкоцу, поке и открытый суши-бар",
				"Signature sushi rolls, 12-hour tonkotsu ramen, bowls and open sushi bar",
				"Rulouri de autor, ramen tonkotsu fiert 12 ore, bowl-uri și sushi bar deschis",
			),
			Cuisine: []string{"japanese", "asian", "seafood"}, Rating: 4.8, ReviewCount: 176, PriceLevel: 2,
			Address:      ls("ул. Пушкина 24", "Strada Pușkin 24", "Strada Pușkin 24"),
			Lat:          47.7611, Lng: 27.9234, AverageCheck: 290, OpenNow: true,
			HoursText:    seedVenueHours["venue-11"],
			ImageURL:     "https://images.unsplash.com/photo-1579871494447-9811cf80d66c?auto=format&fit=crop&w=1200&q=80",
			PhotoURLs: []string{
				"https://images.unsplash.com/photo-1579871494447-9811cf80d66c?auto=format&fit=crop&w=1200&q=80",
				"https://images.unsplash.com/photo-1569718212165-3a8278d5f624?auto=format&fit=crop&w=1200&q=80",
				"https://images.unsplash.com/photo-1553621042-f6e147245754?auto=format&fit=crop&w=1200&q=80",
			},
			Reviews: []models.VenueReview{
				{Author: "Alina K.", Rating: 5, Text: "Очень свежая Филадельфия и насыщенный тонкоцу рамен.", Relative: "3 дня назад", Source: "google"},
				{Author: "Radu P.", Rating: 5, Text: "Посадка у суши-бара топ, видно как крутят роллы.", Relative: "2 недели назад", Source: "google"},
			},
			AlcoholLicense:        true,
			SessionStartBeforeMin: 15, ReleaseBeforeMin: 10, BookingIntervalMin: 30,
			HoldMinutes: 15, VisitDurationMin: 90, MaxVisitDurationMin: 180, AllowPreorder: true,
		},
		{
			ID: "venue-12", CityID: balti.ID,
			Name: ls("Porto Mare Seafood & Grill", "Porto Mare Seafood & Grill", "Porto Mare Seafood & Grill"),
			Description: ls(
				"Средиземноморская кухня, свежие морепродукты, сибас на углях и белые вина",
				"Mediterranean fine dining, fresh seafood, charcoal-grilled sea bass and white wines",
				"Bucătărie mediteraneană, fructe de mare proaspete, lavrac la cărbuni și vinuri albe",
			),
			Cuisine: []string{"seafood", "mediterranean", "grill"}, Rating: 4.9, ReviewCount: 134, PriceLevel: 3,
			Address:      ls("ул. 31 Августа 1989, 20B", "Strada 31 August 1989 20B", "Strada 31 August 1989 20B"),
			Lat:          47.7579, Lng: 27.9215, AverageCheck: 420, OpenNow: true,
			HoursText:    seedVenueHours["venue-12"],
			ImageURL:     "https://images.unsplash.com/photo-1559339352-11d035aa65de?auto=format&fit=crop&w=1200&q=80",
			PhotoURLs: []string{
				"https://images.unsplash.com/photo-1559339352-11d035aa65de?auto=format&fit=crop&w=1200&q=80",
				"https://images.unsplash.com/photo-1467003909585-2f8a72700288?auto=format&fit=crop&w=1200&q=80",
				"https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=1200&q=80",
			},
			Reviews: []models.VenueReview{
				{Author: "Natalia L.", Rating: 5, Text: "Лучшие мидии и осьминог в городе, идеальное место для свидания.", Relative: "5 дней назад", Source: "google"},
				{Author: "Igor S.", Rating: 5, Text: "Сибас на мангале и Совиньон Блан — выше всяких похвал.", Relative: "месяц назад", Source: "google"},
			},
			AlcoholLicense:        true,
			SessionStartBeforeMin: 20, ReleaseBeforeMin: 15, BookingIntervalMin: 30,
			HoldMinutes: 20, VisitDurationMin: 120, MaxVisitDurationMin: 210, AllowPreorder: true,
		},
		{
			ID: "venue-13", CityID: balti.ID,
			Name: ls("Brioche & Matcha Bakery", "Brioche & Matcha Bakery", "Brioche & Matcha Bakery"),
			Description: ls(
				"Французская выпечка на сливочном масле, утренние бранчи, баскский чизкейк и спешелти кофе",
				"Artisan butter pastries, all-day brunch, Basque cheesecake and specialty coffee & matcha",
				"Patiserie artizanală cu unt, brunch toată ziua, cheesecake basc, cafea de specialitate și matcha",
			),
			Cuisine: []string{"bakery", "cafe_sweets", "cafe"}, Rating: 4.7, ReviewCount: 209, PriceLevel: 1,
			Address:      ls("ул. Мира 14", "Strada Păcii 14", "Strada Păcii 14"),
			Lat:          47.7629, Lng: 27.9248, AverageCheck: 145, OpenNow: true,
			HoursText:    seedVenueHours["venue-13"],
			ImageURL:     "https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&w=1200&q=80",
			PhotoURLs: []string{
				"https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&w=1200&q=80",
				"https://images.unsplash.com/photo-1554118811-1e0d58224f24?auto=format&fit=crop&w=1200&q=80",
				"https://images.unsplash.com/photo-1533134242443-d4fd215305ad?auto=format&fit=crop&w=1200&q=80",
			},
			Reviews: []models.VenueReview{
				{Author: "Daria M.", Rating: 5, Text: "Фисташковый круассан и матча на овсяном — лучший завтрак.", Relative: "2 дня назад", Source: "google"},
			},
			AlcoholLicense:        false,
			SessionStartBeforeMin: 10, ReleaseBeforeMin: 10, BookingIntervalMin: 30,
			HoldMinutes: 15, VisitDurationMin: 60, MaxVisitDurationMin: 150, AllowPreorder: true,
		},
		{
			ID: "venue-14", CityID: balti.ID,
			Name: ls("Casa Rustică Grill & Terrace", "Casa Rustică Grill & Terrace", "Casa Rustică Grill & Terrace"),
			Description: ls(
				"Открытый мангал-двор, молдавский гратар, речная форель и уютные садовые беседки для компаний",
				"Open courtyard charcoal grill, Moldovan specialties, roasted river trout and garden tables",
				"Grătar în aer liber pe cărbuni, specialități moldovenești, păstrăv și mese în grădină",
			),
			Cuisine: []string{"grill", "moldovan", "european"}, Rating: 4.6, ReviewCount: 158, PriceLevel: 2,
			Address:      ls("ул. Штефан чел Маре 82", "Strada Ștefan cel Mare 82", "Strada Ștefan cel Mare 82"),
			Lat:          47.7642, Lng: 27.9312, AverageCheck: 270, OpenNow: true,
			HoursText:    seedVenueHours["venue-14"],
			ImageURL:     "https://images.unsplash.com/photo-1555939594-58d7cb561ad1?auto=format&fit=crop&w=1200&q=80",
			PhotoURLs: []string{
				"https://images.unsplash.com/photo-1555939594-58d7cb561ad1?auto=format&fit=crop&w=1200&q=80",
				"https://images.unsplash.com/photo-1558030006-450675393462?auto=format&fit=crop&w=1200&q=80",
				"https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=1200&q=80",
			},
			Reviews: []models.VenueReview{
				{Author: "Mihai V.", Rating: 5, Text: "Отличный гриль-сет для компании и просторный зелёный сад.", Relative: "неделю назад", Source: "google"},
			},
			AlcoholLicense:        true,
			SessionStartBeforeMin: 15, ReleaseBeforeMin: 10, BookingIntervalMin: 30,
			HoldMinutes: 15, VisitDurationMin: 120, MaxVisitDurationMin: 240, AllowPreorder: true,
		},
	}
	for _, v := range extraVenues {
		if _, exists := s.venues[v.ID]; !exists {
			s.venues[v.ID] = v
		}
	}

	// Ensure all menu items for seeded venues exist cleanly (especially new venues 11..14).
	for _, m := range demoMenu() {
		if _, exists := s.menuItems[m.ID]; !exists {
			s.menuItems[m.ID] = m
		}
	}

	// Update curated holiday collections to include new venues.
	if c, ok := s.collections["col-date-night"]; ok {
		c.VenueIDs = []string{"venue-3", "venue-11", "venue-12"}
		s.collections["col-date-night"] = c
	}
	if c, ok := s.collections["col-family"]; ok {
		c.VenueIDs = []string{"venue-1", "venue-2", "venue-4", "venue-10", "venue-14"}
		s.collections["col-family"] = c
	}
	if c, ok := s.collections["col-easter"]; ok {
		c.VenueIDs = []string{"venue-1", "venue-2", "venue-6", "venue-14"}
		s.collections["col-easter"] = c
	}

	// 3. Refine table coordinates on base tables t1..t15 for clean spacing & add rich realistic
	// multi-zone floor layouts across ALL bookable venues (leaving venue-9 tableless for tests).
	refinedBaseCoords := map[string][2]float64{
		"t1": {0.16, 0.36}, "t2": {0.42, 0.32}, "t3": {0.68, 0.32},
		"t4": {0.24, 0.42}, "t5": {0.56, 0.36},
		"t6": {0.20, 0.38}, "t7": {0.48, 0.38},
		"t8": {0.22, 0.44}, "t9": {0.52, 0.44}, "t10": {0.80, 0.44},
		"t11": {0.26, 0.36}, "t12": {0.58, 0.36},
		"t13": {0.24, 0.44}, "t14": {0.54, 0.44}, "t15": {0.50, 0.46},
	}
	for id, coords := range refinedBaseCoords {
		if t, ok := s.tables[id]; ok {
			t.X, t.Y = coords[0], coords[1]
			s.tables[id] = t
		}
	}

	occupiedLate := now.Add(-25 * time.Minute)
	extraTables := []models.Table{
		// Venue 1 (La Plăcinte): total 12 tables across hall (7), terrace (3), garden (2)
		{ID: "t-v1-6", VenueID: "venue-1", Number: 6, Seats: 2, Status: models.TableFree, X: 0.16, Y: 0.66, Zone: "hall"},
		{ID: "t-v1-7", VenueID: "venue-1", Number: 7, Seats: 4, Status: models.TableFree, X: 0.42, Y: 0.64, Zone: "hall"},
		{ID: "t-v1-8", VenueID: "venue-1", Number: 8, Seats: 6, Status: models.TableFree, X: 0.68, Y: 0.64, Zone: "hall"},
		{ID: "t-v1-9", VenueID: "venue-1", Number: 9, Seats: 8, Status: models.TableFree, X: 0.85, Y: 0.48, Zone: "hall"},
		{ID: "t-v1-10", VenueID: "venue-1", Number: 10, Seats: 4, Status: models.TableFree, X: 0.78, Y: 0.60, Zone: "terrace"},
		{ID: "t-v1-11", VenueID: "venue-1", Number: 11, Seats: 4, Status: models.TableFree, X: 0.32, Y: 0.50, Zone: "garden"},
		{ID: "t-v1-12", VenueID: "venue-1", Number: 12, Seats: 6, Status: models.TableFree, X: 0.68, Y: 0.50, Zone: "garden"},

		// Venue 2 (Cafe Central): total 10 tables across hall (4), street (4), bar (2)
		{ID: "t-v2-11", VenueID: "venue-2", Number: 6, Seats: 4, Status: models.TableFree, X: 0.24, Y: 0.68, Zone: "hall"},
		{ID: "t-v2-12", VenueID: "venue-2", Number: 7, Seats: 4, Status: models.TableFree, X: 0.74, Y: 0.54, Zone: "hall"},
		{ID: "t-v2-13", VenueID: "venue-2", Number: 8, Seats: 2, Status: models.TableFree, X: 0.48, Y: 0.72, Zone: "street"},
		{ID: "t-v2-14", VenueID: "venue-2", Number: 9, Seats: 2, Status: models.TableFree, X: 0.34, Y: 0.44, Zone: "bar"},
		{ID: "t-v2-15", VenueID: "venue-2", Number: 10, Seats: 2, Status: models.TableFree, X: 0.66, Y: 0.44, Zone: "bar"},

		// Venue 3 (Steak House Balti): total 10 tables across hall (5), street (3), terrace (2)
		{ID: "t-v3-6", VenueID: "venue-3", Number: 6, Seats: 4, Status: models.TableFree, X: 0.24, Y: 0.66, Zone: "hall"},
		{ID: "t-v3-7", VenueID: "venue-3", Number: 7, Seats: 6, Status: models.TableFree, X: 0.56, Y: 0.66, Zone: "hall"},
		{ID: "t-v3-8", VenueID: "venue-3", Number: 8, Seats: 8, Status: models.TableFree, X: 0.83, Y: 0.50, Zone: "hall"},
		{ID: "t-v3-9", VenueID: "venue-3", Number: 9, Seats: 4, Status: models.TableFree, X: 0.78, Y: 0.56, Zone: "street"},
		{ID: "t-v3-10", VenueID: "venue-3", Number: 10, Seats: 4, Status: models.TableFree, X: 0.26, Y: 0.46, Zone: "terrace"},

		// Venue 4 (Oliva): 11 tables across hall (5), terrace (4), bar (2)
		{ID: "t-v4-1", VenueID: "venue-4", Number: 1, Seats: 2, Status: models.TableFree, X: 0.16, Y: 0.38, Zone: "hall"},
		{ID: "t-v4-2", VenueID: "venue-4", Number: 2, Seats: 4, Status: models.TableFree, X: 0.42, Y: 0.34, Zone: "hall"},
		{ID: "t-v4-3", VenueID: "venue-4", Number: 3, Seats: 4, Status: models.TableOccupied, OccupiedSince: &occupiedLate, X: 0.68, Y: 0.34, Zone: "hall"},
		{ID: "t-v4-4", VenueID: "venue-4", Number: 4, Seats: 6, Status: models.TableFree, X: 0.28, Y: 0.66, Zone: "hall"},
		{ID: "t-v4-5", VenueID: "venue-4", Number: 5, Seats: 8, Status: models.TableFree, X: 0.74, Y: 0.64, Zone: "hall"},
		{ID: "t-v4-6", VenueID: "venue-4", Number: 6, Seats: 2, Status: models.TableFree, X: 0.22, Y: 0.36, Zone: "terrace"},
		{ID: "t-v4-7", VenueID: "venue-4", Number: 7, Seats: 4, Status: models.TableFree, X: 0.50, Y: 0.36, Zone: "terrace"},
		{ID: "t-v4-8", VenueID: "venue-4", Number: 8, Seats: 4, Status: models.TableFree, X: 0.78, Y: 0.38, Zone: "terrace"},
		{ID: "t-v4-9", VenueID: "venue-4", Number: 9, Seats: 6, Status: models.TableFree, X: 0.50, Y: 0.68, Zone: "terrace"},
		{ID: "t-v4-10", VenueID: "venue-4", Number: 10, Seats: 2, Status: models.TableFree, X: 0.32, Y: 0.48, Zone: "bar"},
		{ID: "t-v4-11", VenueID: "venue-4", Number: 11, Seats: 2, Status: models.TableFree, X: 0.68, Y: 0.48, Zone: "bar"},

		// Venue 5 (Beermaster Pub): 10 tables across hall (5), bar (3), terrace (2)
		{ID: "t-v5-1", VenueID: "venue-5", Number: 1, Seats: 4, Status: models.TableFree, X: 0.20, Y: 0.36, Zone: "hall"},
		{ID: "t-v5-2", VenueID: "venue-5", Number: 2, Seats: 4, Status: models.TableOccupied, OccupiedSince: &occupiedLate, X: 0.48, Y: 0.36, Zone: "hall"},
		{ID: "t-v5-3", VenueID: "venue-5", Number: 3, Seats: 6, Status: models.TableFree, X: 0.78, Y: 0.38, Zone: "hall"},
		{ID: "t-v5-4", VenueID: "venue-5", Number: 4, Seats: 6, Status: models.TableFree, X: 0.24, Y: 0.68, Zone: "hall"},
		{ID: "t-v5-5", VenueID: "venue-5", Number: 5, Seats: 8, Status: models.TableFree, X: 0.72, Y: 0.68, Zone: "hall"},
		{ID: "t-v5-6", VenueID: "venue-5", Number: 6, Seats: 2, Status: models.TableFree, X: 0.22, Y: 0.44, Zone: "bar"},
		{ID: "t-v5-7", VenueID: "venue-5", Number: 7, Seats: 2, Status: models.TableFree, X: 0.50, Y: 0.44, Zone: "bar"},
		{ID: "t-v5-8", VenueID: "venue-5", Number: 8, Seats: 4, Status: models.TableFree, X: 0.78, Y: 0.44, Zone: "bar"},
		{ID: "t-v5-9", VenueID: "venue-5", Number: 9, Seats: 4, Status: models.TableFree, X: 0.32, Y: 0.50, Zone: "terrace"},
		{ID: "t-v5-10", VenueID: "venue-5", Number: 10, Seats: 6, Status: models.TableFree, X: 0.68, Y: 0.50, Zone: "terrace"},

		// Venue 6 (Restaurant Noroc): 9 tables across hall (4), garden (3), terrace (2)
		{ID: "t-v6-1", VenueID: "venue-6", Number: 1, Seats: 4, Status: models.TableFree, X: 0.24, Y: 0.36, Zone: "hall"},
		{ID: "t-v6-2", VenueID: "venue-6", Number: 2, Seats: 4, Status: models.TableFree, X: 0.64, Y: 0.36, Zone: "hall"},
		{ID: "t-v6-3", VenueID: "venue-6", Number: 3, Seats: 6, Status: models.TableFree, X: 0.24, Y: 0.66, Zone: "hall"},
		{ID: "t-v6-4", VenueID: "venue-6", Number: 4, Seats: 8, Status: models.TableFree, X: 0.68, Y: 0.66, Zone: "hall"},
		{ID: "t-v6-5", VenueID: "venue-6", Number: 5, Seats: 4, Status: models.TableFree, X: 0.24, Y: 0.46, Zone: "garden"},
		{ID: "t-v6-6", VenueID: "venue-6", Number: 6, Seats: 6, Status: models.TableFree, X: 0.54, Y: 0.46, Zone: "garden"},
		{ID: "t-v6-7", VenueID: "venue-6", Number: 7, Seats: 6, Status: models.TableFree, X: 0.82, Y: 0.46, Zone: "garden"},
		{ID: "t-v6-8", VenueID: "venue-6", Number: 8, Seats: 2, Status: models.TableFree, X: 0.32, Y: 0.48, Zone: "terrace"},
		{ID: "t-v6-9", VenueID: "venue-6", Number: 9, Seats: 4, Status: models.TableFree, X: 0.68, Y: 0.48, Zone: "terrace"},

		// Venue 7 (Loft Burger Bar): 8 tables across hall (4), bar (2), street (2)
		{ID: "t-v7-1", VenueID: "venue-7", Number: 1, Seats: 2, Status: models.TableFree, X: 0.22, Y: 0.36, Zone: "hall"},
		{ID: "t-v7-2", VenueID: "venue-7", Number: 2, Seats: 4, Status: models.TableFree, X: 0.58, Y: 0.36, Zone: "hall"},
		{ID: "t-v7-3", VenueID: "venue-7", Number: 3, Seats: 2, Status: models.TableFree, X: 0.22, Y: 0.66, Zone: "hall"},
		{ID: "t-v7-4", VenueID: "venue-7", Number: 4, Seats: 4, Status: models.TableFree, X: 0.60, Y: 0.66, Zone: "hall"},
		{ID: "t-v7-5", VenueID: "venue-7", Number: 5, Seats: 2, Status: models.TableFree, X: 0.34, Y: 0.46, Zone: "bar"},
		{ID: "t-v7-6", VenueID: "venue-7", Number: 6, Seats: 4, Status: models.TableFree, X: 0.68, Y: 0.46, Zone: "bar"},
		{ID: "t-v7-7", VenueID: "venue-7", Number: 7, Seats: 4, Status: models.TableFree, X: 0.32, Y: 0.50, Zone: "street"},
		{ID: "t-v7-8", VenueID: "venue-7", Number: 8, Seats: 4, Status: models.TableFree, X: 0.68, Y: 0.50, Zone: "street"},

		// Venue 8 (Oscar Lounge): 9 tables across hall (4), terrace (3), bar (2)
		{ID: "t-v8-1", VenueID: "venue-8", Number: 1, Seats: 2, Status: models.TableFree, X: 0.20, Y: 0.36, Zone: "hall"},
		{ID: "t-v8-2", VenueID: "venue-8", Number: 2, Seats: 4, Status: models.TableFree, X: 0.52, Y: 0.36, Zone: "hall"},
		{ID: "t-v8-3", VenueID: "venue-8", Number: 3, Seats: 4, Status: models.TableFree, X: 0.26, Y: 0.66, Zone: "hall"},
		{ID: "t-v8-4", VenueID: "venue-8", Number: 4, Seats: 6, Status: models.TableFree, X: 0.68, Y: 0.66, Zone: "hall"},
		{ID: "t-v8-5", VenueID: "venue-8", Number: 5, Seats: 2, Status: models.TableFree, X: 0.24, Y: 0.46, Zone: "terrace"},
		{ID: "t-v8-6", VenueID: "venue-8", Number: 6, Seats: 4, Status: models.TableFree, X: 0.52, Y: 0.46, Zone: "terrace"},
		{ID: "t-v8-7", VenueID: "venue-8", Number: 7, Seats: 6, Status: models.TableFree, X: 0.80, Y: 0.46, Zone: "terrace"},
		{ID: "t-v8-8", VenueID: "venue-8", Number: 8, Seats: 2, Status: models.TableFree, X: 0.34, Y: 0.48, Zone: "bar"},
		{ID: "t-v8-9", VenueID: "venue-8", Number: 9, Seats: 4, Status: models.TableFree, X: 0.68, Y: 0.48, Zone: "bar"},

		// Venue 10 (Andy's): 10 tables across hall (5), terrace (3), street (2)
		{ID: "t-v10-1", VenueID: "venue-10", Number: 1, Seats: 4, Status: models.TableFree, X: 0.18, Y: 0.34, Zone: "hall"},
		{ID: "t-v10-2", VenueID: "venue-10", Number: 2, Seats: 4, Status: models.TableFree, X: 0.46, Y: 0.34, Zone: "hall"},
		{ID: "t-v10-3", VenueID: "venue-10", Number: 3, Seats: 4, Status: models.TableFree, X: 0.74, Y: 0.34, Zone: "hall"},
		{ID: "t-v10-4", VenueID: "venue-10", Number: 4, Seats: 6, Status: models.TableFree, X: 0.28, Y: 0.64, Zone: "hall"},
		{ID: "t-v10-5", VenueID: "venue-10", Number: 5, Seats: 8, Status: models.TableFree, X: 0.68, Y: 0.64, Zone: "hall"},
		{ID: "t-v10-6", VenueID: "venue-10", Number: 6, Seats: 4, Status: models.TableFree, X: 0.24, Y: 0.46, Zone: "terrace"},
		{ID: "t-v10-7", VenueID: "venue-10", Number: 7, Seats: 4, Status: models.TableFree, X: 0.52, Y: 0.46, Zone: "terrace"},
		{ID: "t-v10-8", VenueID: "venue-10", Number: 8, Seats: 6, Status: models.TableFree, X: 0.80, Y: 0.46, Zone: "terrace"},
		{ID: "t-v10-9", VenueID: "venue-10", Number: 9, Seats: 2, Status: models.TableFree, X: 0.32, Y: 0.50, Zone: "street"},
		{ID: "t-v10-10", VenueID: "venue-10", Number: 10, Seats: 4, Status: models.TableFree, X: 0.68, Y: 0.50, Zone: "street"},

		// Venue 11 (Sakura Sushi & Ramen): 9 tables across hall (4), bar (3), terrace (2)
		{ID: "t-v11-1", VenueID: "venue-11", Number: 1, Seats: 2, Status: models.TableFree, X: 0.20, Y: 0.36, Zone: "hall"},
		{ID: "t-v11-2", VenueID: "venue-11", Number: 2, Seats: 2, Status: models.TableFree, X: 0.20, Y: 0.66, Zone: "hall"},
		{ID: "t-v11-3", VenueID: "venue-11", Number: 3, Seats: 4, Status: models.TableFree, X: 0.52, Y: 0.36, Zone: "hall"},
		{ID: "t-v11-4", VenueID: "venue-11", Number: 4, Seats: 4, Status: models.TableFree, X: 0.60, Y: 0.66, Zone: "hall"},
		{ID: "t-v11-5", VenueID: "venue-11", Number: 5, Seats: 2, Status: models.TableFree, X: 0.24, Y: 0.44, Zone: "bar"},
		{ID: "t-v11-6", VenueID: "venue-11", Number: 6, Seats: 2, Status: models.TableFree, X: 0.52, Y: 0.44, Zone: "bar"},
		{ID: "t-v11-7", VenueID: "venue-11", Number: 7, Seats: 2, Status: models.TableFree, X: 0.78, Y: 0.44, Zone: "bar"},
		{ID: "t-v11-8", VenueID: "venue-11", Number: 8, Seats: 4, Status: models.TableFree, X: 0.32, Y: 0.48, Zone: "terrace"},
		{ID: "t-v11-9", VenueID: "venue-11", Number: 9, Seats: 6, Status: models.TableFree, X: 0.68, Y: 0.48, Zone: "terrace"},

		// Venue 12 (Porto Mare Seafood & Grill): 9 tables across hall (5), terrace (4)
		{ID: "t-v12-1", VenueID: "venue-12", Number: 1, Seats: 2, Status: models.TableFree, X: 0.18, Y: 0.36, Zone: "hall"},
		{ID: "t-v12-2", VenueID: "venue-12", Number: 2, Seats: 4, Status: models.TableFree, X: 0.46, Y: 0.34, Zone: "hall"},
		{ID: "t-v12-3", VenueID: "venue-12", Number: 3, Seats: 4, Status: models.TableFree, X: 0.74, Y: 0.36, Zone: "hall"},
		{ID: "t-v12-4", VenueID: "venue-12", Number: 4, Seats: 6, Status: models.TableFree, X: 0.28, Y: 0.66, Zone: "hall"},
		{ID: "t-v12-5", VenueID: "venue-12", Number: 5, Seats: 8, Status: models.TableFree, X: 0.70, Y: 0.66, Zone: "hall"},
		{ID: "t-v12-6", VenueID: "venue-12", Number: 6, Seats: 2, Status: models.TableFree, X: 0.22, Y: 0.36, Zone: "terrace"},
		{ID: "t-v12-7", VenueID: "venue-12", Number: 7, Seats: 4, Status: models.TableFree, X: 0.60, Y: 0.36, Zone: "terrace"},
		{ID: "t-v12-8", VenueID: "venue-12", Number: 8, Seats: 4, Status: models.TableFree, X: 0.28, Y: 0.66, Zone: "terrace"},
		{ID: "t-v12-9", VenueID: "venue-12", Number: 9, Seats: 6, Status: models.TableFree, X: 0.68, Y: 0.66, Zone: "terrace"},

		// Venue 13 (Brioche & Matcha Bakery): 7 tables across hall (3), street (3), terrace (1)
		{ID: "t-v13-1", VenueID: "venue-13", Number: 1, Seats: 2, Status: models.TableFree, X: 0.22, Y: 0.38, Zone: "hall"},
		{ID: "t-v13-2", VenueID: "venue-13", Number: 2, Seats: 2, Status: models.TableFree, X: 0.22, Y: 0.66, Zone: "hall"},
		{ID: "t-v13-3", VenueID: "venue-13", Number: 3, Seats: 4, Status: models.TableFree, X: 0.62, Y: 0.50, Zone: "hall"},
		{ID: "t-v13-4", VenueID: "venue-13", Number: 4, Seats: 2, Status: models.TableFree, X: 0.24, Y: 0.46, Zone: "street"},
		{ID: "t-v13-5", VenueID: "venue-13", Number: 5, Seats: 2, Status: models.TableFree, X: 0.52, Y: 0.46, Zone: "street"},
		{ID: "t-v13-6", VenueID: "venue-13", Number: 6, Seats: 4, Status: models.TableFree, X: 0.78, Y: 0.46, Zone: "street"},
		{ID: "t-v13-7", VenueID: "venue-13", Number: 7, Seats: 4, Status: models.TableFree, X: 0.50, Y: 0.48, Zone: "terrace"},

		// Venue 14 (Casa Rustică Grill & Terrace): 10 tables across hall (4), garden (3), terrace (3)
		{ID: "t-v14-1", VenueID: "venue-14", Number: 1, Seats: 4, Status: models.TableFree, X: 0.22, Y: 0.36, Zone: "hall"},
		{ID: "t-v14-2", VenueID: "venue-14", Number: 2, Seats: 4, Status: models.TableFree, X: 0.60, Y: 0.36, Zone: "hall"},
		{ID: "t-v14-3", VenueID: "venue-14", Number: 3, Seats: 6, Status: models.TableFree, X: 0.26, Y: 0.66, Zone: "hall"},
		{ID: "t-v14-4", VenueID: "venue-14", Number: 4, Seats: 8, Status: models.TableFree, X: 0.70, Y: 0.66, Zone: "hall"},
		{ID: "t-v14-5", VenueID: "venue-14", Number: 5, Seats: 4, Status: models.TableFree, X: 0.22, Y: 0.48, Zone: "garden"},
		{ID: "t-v14-6", VenueID: "venue-14", Number: 6, Seats: 6, Status: models.TableFree, X: 0.52, Y: 0.48, Zone: "garden"},
		{ID: "t-v14-7", VenueID: "venue-14", Number: 7, Seats: 6, Status: models.TableFree, X: 0.80, Y: 0.48, Zone: "garden"},
		{ID: "t-v14-8", VenueID: "venue-14", Number: 8, Seats: 2, Status: models.TableFree, X: 0.24, Y: 0.46, Zone: "terrace"},
		{ID: "t-v14-9", VenueID: "venue-14", Number: 9, Seats: 4, Status: models.TableFree, X: 0.52, Y: 0.46, Zone: "terrace"},
		{ID: "t-v14-10", VenueID: "venue-14", Number: 10, Seats: 4, Status: models.TableFree, X: 0.78, Y: 0.46, Zone: "terrace"},
	}
	for _, t := range extraTables {
		if _, exists := s.tables[t.ID]; !exists {
			s.tables[t.ID] = t
		}
	}

	// 4. Multi-venue published applications for owner@seatiko.local (Oliva & Sakura Sushi).
	extraApps := []struct {
		appID   string
		venueID string
	}{
		{"app-demo-owner-2", "venue-4"},
		{"app-demo-owner-3", "venue-11"},
	}
	for _, item := range extraApps {
		if _, exists := s.applications[item.appID]; !exists {
			if v, ok := s.venues[item.venueID]; ok {
				vid := item.venueID
				s.applications[item.appID] = models.VenueApplication{
					ID:            item.appID,
					OwnerUserID:   demoOwnerID,
					VenueID:       &vid,
					CityID:        v.CityID,
					Name:          v.Name,
					Description:   v.Description,
					Address:       v.Address,
					Cuisine:       v.Cuisine,
					Phone:         "+373 69 987 654",
					HoursText:     v.HoursText,
					Email:         "owner@seatiko.local",
					Lat:           v.Lat,
					Lng:           v.Lng,
					PriceLevel:    v.PriceLevel,
					AverageCheck:  v.AverageCheck,
					PhotoURLs:     v.PhotoURLs,
					AllowPreorder: v.AllowPreorder,
					Status:        models.AppPublished,
					CreatedAt:     now.Add(-14 * 24 * time.Hour).UTC(),
					UpdatedAt:     now.UTC(),
				}
			}
		}
	}

	// 5. Additional demo guest accounts for varied reservations.
	guestPassHash, err1 := bcrypt.GenerateFromPassword([]byte("guest123"), bcrypt.DefaultCost)
	staffPassHash, err2 := bcrypt.GenerateFromPassword([]byte("staff123"), bcrypt.DefaultCost)
	if err1 == nil {
		extraGuests := []models.User{
			{ID: "user-demo-guest-2", Email: "maria.popescu@seatiko.local", PasswordHash: string(guestPassHash), FirstName: "Maria", LastName: "Popescu", DisplayName: "Maria Popescu", Phone: "+373 69 112 233", Locale: "ro", Role: models.RoleGuest, CreatedAt: now.UTC(), UpdatedAt: now.UTC()},
			{ID: "user-demo-guest-3", Email: "victor.rosca@seatiko.local", PasswordHash: string(guestPassHash), FirstName: "Victor", LastName: "Roșca", DisplayName: "Victor Roșca", Phone: "+373 68 445 566", Locale: "ro", Role: models.RoleGuest, CreatedAt: now.UTC(), UpdatedAt: now.UTC()},
			{ID: "user-demo-guest-4", Email: "elena.dima@seatiko.local", PasswordHash: string(guestPassHash), FirstName: "Елена", LastName: "Дима", DisplayName: "Елена Дима", Phone: "+373 79 334 455", Locale: "ru", Role: models.RoleGuest, CreatedAt: now.UTC(), UpdatedAt: now.UTC()},
			{ID: "user-demo-guest-5", Email: "dan.turcanu@seatiko.local", PasswordHash: string(guestPassHash), FirstName: "Dan", LastName: "Țurcanu", DisplayName: "Dan Țurcanu", Phone: "+373 69 778 899", Locale: "en", Role: models.RoleGuest, CreatedAt: now.UTC(), UpdatedAt: now.UTC()},
			{ID: "user-demo-guest-6", Email: "olga.cojocaru@seatiko.local", PasswordHash: string(guestPassHash), FirstName: "Ольга", LastName: "Кожокару", DisplayName: "Ольга Кожокару", Phone: "+373 68 901 234", Locale: "ru", Role: models.RoleGuest, CreatedAt: now.UTC(), UpdatedAt: now.UTC()},
			{ID: "user-demo-guest-7", Email: "andrei.botnari@seatiko.local", PasswordHash: string(guestPassHash), FirstName: "Андрей", LastName: "Ботнарь", DisplayName: "Андрей Ботнарь", Phone: "+373 69 554 321", Locale: "ru", Role: models.RoleGuest, CreatedAt: now.UTC(), UpdatedAt: now.UTC()},
		}
		for _, u := range extraGuests {
			if _, exists := s.users[u.ID]; !exists {
				s.users[u.ID] = u
			}
		}
	}
	if err2 == nil {
		extraStaffUsers := []models.User{
			{ID: "user-demo-staff-oliva", Email: "olga.bivol@seatiko.local", PasswordHash: string(staffPassHash), FirstName: "Ольга", LastName: "Бивол", DisplayName: "Ольга Бивол", Phone: "+373 69 321 654", Locale: "ru", Role: models.RoleStaff, CreatedAt: now.UTC(), UpdatedAt: now.UTC()},
			{ID: "user-demo-cook-sakura", Email: "kenji.tanaka@seatiko.local", PasswordHash: string(staffPassHash), FirstName: "Kenji", LastName: "Tanaka", DisplayName: "Kenji Tanaka", Phone: "+373 68 880 112", Locale: "en", Role: models.RoleStaff, CreatedAt: now.UTC(), UpdatedAt: now.UTC()},
		}
		for _, u := range extraStaffUsers {
			if _, exists := s.users[u.ID]; !exists {
				s.users[u.ID] = u
			}
		}
	}

	// 6. More waiters, cooks & managers across venue-1, venue-4 (Oliva), venue-11 (Sakura), venue-2, venue-3.
	extraStaffMembers := []models.StaffMember{
		// Venue 1 (La Plăcinte) extras (+6 staff -> total 15)
		{ID: "staff-member-demo-10", VenueID: "venue-1", Name: "Виктор Панаите", Email: "victor.panaite@seatiko.local", Role: models.StaffRoleWaiter, Status: models.StaffStatusActive, OnShift: true, CreatedAt: now.Add(-60 * time.Hour)},
		{ID: "staff-member-demo-11", VenueID: "venue-1", Name: "Ирина Лупу", Email: "irina.lupu@seatiko.local", Role: models.StaffRoleWaiter, Status: models.StaffStatusActive, OnShift: false, CreatedAt: now.Add(-64 * time.Hour)},
		{ID: "staff-member-demo-12", VenueID: "venue-1", Name: "Кристиан Русу", Email: "cristian.rusu@seatiko.local", Role: models.StaffRoleWaiter, Status: models.StaffStatusInvited, OnShift: false, CreatedAt: now.Add(-12 * time.Hour)},
		{ID: "staff-member-demo-13", VenueID: "venue-1", Name: "Сергей Мокан", Email: "sergey.mokan@seatiko.local", Role: models.StaffRoleCook, Status: models.StaffStatusActive, OnShift: true, CreatedAt: now.Add(-70 * time.Hour)},
		{ID: "staff-member-demo-14", VenueID: "venue-1", Name: "Дойна Берзан", Email: "doina.berzan@seatiko.local", Role: models.StaffRoleWaiter, Status: models.StaffStatusActive, OnShift: true, CreatedAt: now.Add(-90 * time.Hour)},
		{ID: "staff-member-demo-15", VenueID: "venue-1", Name: "Павел Думбрэвяну", Email: "pavel.d@seatiko.local", Role: models.StaffRoleWaiter, Status: models.StaffStatusActive, OnShift: false, CreatedAt: now.Add(-50 * time.Hour)},

		// Venue 4 (Oliva): 8 team members (5 waiters, 3 cooks)
		{ID: "staff-v4-1", VenueID: "venue-4", UserID: "user-demo-staff-oliva", Name: "Ольга Бивол", Email: "olga.bivol@seatiko.local", Role: models.StaffRoleWaiter, Status: models.StaffStatusActive, OnShift: true, CreatedAt: now.Add(-96 * time.Hour)},
		{ID: "staff-v4-2", VenueID: "venue-4", Name: "Ionela Ciobanu", Email: "ionela.oliva@seatiko.local", Role: models.StaffRoleWaiter, Status: models.StaffStatusActive, OnShift: true, CreatedAt: now.Add(-80 * time.Hour)},
		{ID: "staff-v4-3", VenueID: "venue-4", Name: "Максим Савин", Email: "maxim.oliva@seatiko.local", Role: models.StaffRoleWaiter, Status: models.StaffStatusActive, OnShift: false, CreatedAt: now.Add(-72 * time.Hour)},
		{ID: "staff-v4-4", VenueID: "venue-4", Name: "Valeria Grosu", Email: "valeria.oliva@seatiko.local", Role: models.StaffRoleWaiter, Status: models.StaffStatusActive, OnShift: false, CreatedAt: now.Add(-48 * time.Hour)},
		{ID: "staff-v4-5", VenueID: "venue-4", Name: "Никита Ткач", Email: "nikita.oliva@seatiko.local", Role: models.StaffRoleWaiter, Status: models.StaffStatusActive, OnShift: true, CreatedAt: now.Add(-36 * time.Hour)},
		{ID: "staff-v4-6", VenueID: "venue-4", Name: "Marco Bellini", Email: "marco.oliva@seatiko.local", Role: models.StaffRoleCook, Status: models.StaffStatusActive, OnShift: true, CreatedAt: now.Add(-120 * time.Hour)},
		{ID: "staff-v4-7", VenueID: "venue-4", Name: "Андрей Попа", Email: "andrei.oliva@seatiko.local", Role: models.StaffRoleCook, Status: models.StaffStatusActive, OnShift: true, CreatedAt: now.Add(-100 * time.Hour)},
		{ID: "staff-v4-8", VenueID: "venue-4", Name: "Svetlana Donica", Email: "svetlana.oliva@seatiko.local", Role: models.StaffRoleCook, Status: models.StaffStatusActive, OnShift: false, CreatedAt: now.Add(-60 * time.Hour)},

		// Venue 11 (Sakura Sushi & Ramen): 6 team members (3 waiters, 3 cooks)
		{ID: "staff-v11-1", VenueID: "venue-11", UserID: "user-demo-cook-sakura", Name: "Kenji Tanaka", Email: "kenji.tanaka@seatiko.local", Role: models.StaffRoleCook, Status: models.StaffStatusActive, OnShift: true, CreatedAt: now.Add(-90 * time.Hour)},
		{ID: "staff-v11-2", VenueID: "venue-11", Name: "Лилия Назарова", Email: "lilia.sakura@seatiko.local", Role: models.StaffRoleWaiter, Status: models.StaffStatusActive, OnShift: true, CreatedAt: now.Add(-80 * time.Hour)},
		{ID: "staff-v11-3", VenueID: "venue-11", Name: "Vladislav Ioniță", Email: "vlad.sakura@seatiko.local", Role: models.StaffRoleWaiter, Status: models.StaffStatusActive, OnShift: false, CreatedAt: now.Add(-60 * time.Hour)},
		{ID: "staff-v11-4", VenueID: "venue-11", Name: "Диана Бойко", Email: "diana.sakura@seatiko.local", Role: models.StaffRoleWaiter, Status: models.StaffStatusActive, OnShift: true, CreatedAt: now.Add(-40 * time.Hour)},
		{ID: "staff-v11-5", VenueID: "venue-11", Name: "Игорь Киртоакэ", Email: "igor.sakura@seatiko.local", Role: models.StaffRoleCook, Status: models.StaffStatusActive, OnShift: true, CreatedAt: now.Add(-70 * time.Hour)},
		{ID: "staff-v11-6", VenueID: "venue-11", Name: "Алина Житару", Email: "alina.sakura@seatiko.local", Role: models.StaffRoleCook, Status: models.StaffStatusActive, OnShift: false, CreatedAt: now.Add(-30 * time.Hour)},

		// Venue 2 (Cafe Central) & Venue 3 (Steak House)
		{ID: "staff-v2-1", VenueID: "venue-2", Name: "Екатерина Лунгу", Email: "kate.central@seatiko.local", Role: models.StaffRoleWaiter, Status: models.StaffStatusActive, OnShift: true, CreatedAt: now.Add(-72 * time.Hour)},
		{ID: "staff-v2-2", VenueID: "venue-2", Name: "Bogdan Rotaru", Email: "bogdan.central@seatiko.local", Role: models.StaffRoleWaiter, Status: models.StaffStatusActive, OnShift: false, CreatedAt: now.Add(-48 * time.Hour)},
		{ID: "staff-v3-1", VenueID: "venue-3", Name: "Денис Гырбу", Email: "denis.steak@seatiko.local", Role: models.StaffRoleWaiter, Status: models.StaffStatusActive, OnShift: true, CreatedAt: now.Add(-72 * time.Hour)},
		{ID: "staff-v3-2", VenueID: "venue-3", Name: "Олег Кирица", Email: "oleg.steak@seatiko.local", Role: models.StaffRoleCook, Status: models.StaffStatusActive, OnShift: true, CreatedAt: now.Add(-96 * time.Hour)},
	}
	for _, member := range extraStaffMembers {
		if _, exists := s.staffMembers[member.ID]; !exists {
			s.staffMembers[member.ID] = member
		}
	}

	// 7. Full week shifts for venue-1 (extra staff), venue-4 (Oliva), and venue-11 (Sakura).
	dateStr := func(offsetDays int) string {
		return today.AddDate(0, 0, offsetDays).Format("2006-01-02")
	}
	extraShifts := []models.WorkShift{
		// Venue 1 extras (covering days 0..+6 cleanly)
		{ID: "shift-demo-19", VenueID: "venue-1", StaffID: "staff-member-demo-10", StaffName: "Виктор Панаите", Role: models.StaffRoleWaiter, Date: dateStr(0), StartTime: "12:00", EndTime: "23:00", Status: models.ShiftStatusConfirmed, Note: "Терраса и банкетный стол", CreatedAt: now, UpdatedAt: now},
		{ID: "shift-demo-20", VenueID: "venue-1", StaffID: "staff-member-demo-13", StaffName: "Сергей Мокан", Role: models.StaffRoleCook, Date: dateStr(0), StartTime: "11:00", EndTime: "22:00", Status: models.ShiftStatusConfirmed, Note: "Мангал и горячий цех", CreatedAt: now, UpdatedAt: now},
		{ID: "shift-demo-21", VenueID: "venue-1", StaffID: "staff-member-demo-11", StaffName: "Ирина Лупу", Role: models.StaffRoleWaiter, Date: dateStr(1), StartTime: "09:00", EndTime: "18:00", Status: models.ShiftStatusSwapRequested, Reason: "Нужно забрать ребёнка со школы — ищу замену на утро", Note: "Основной зал", CreatedAt: now, UpdatedAt: now},
		{ID: "shift-demo-22", VenueID: "venue-1", StaffID: "staff-member-demo-15", StaffName: "Павел Думбрэвяну", Role: models.StaffRoleWaiter, Date: dateStr(2), StartTime: "12:00", EndTime: "22:00", Status: models.ShiftStatusConfirmed, Note: "Сад и зал", CreatedAt: now, UpdatedAt: now},
		{ID: "shift-demo-23", VenueID: "venue-1", StaffID: "staff-member-demo-10", StaffName: "Виктор Панаите", Role: models.StaffRoleWaiter, Date: dateStr(3), StartTime: "10:00", EndTime: "20:00", Status: models.ShiftStatusConfirmed, Note: "Основной зал", CreatedAt: now, UpdatedAt: now},
		{ID: "shift-demo-24", VenueID: "venue-1", StaffID: "staff-member-demo-13", StaffName: "Сергей Мокан", Role: models.StaffRoleCook, Date: dateStr(4), StartTime: "10:00", EndTime: "22:00", Status: models.ShiftStatusConfirmed, Note: "Горячий цех", CreatedAt: now, UpdatedAt: now},
		{ID: "shift-demo-25", VenueID: "venue-1", StaffID: "staff-member-demo-5", StaffName: "Мария Иванова", Role: models.StaffRoleWaiter, Date: dateStr(4), StartTime: "11:00", EndTime: "22:00", Status: models.ShiftStatusConfirmed, Note: "Утренний и вечерний сервис", CreatedAt: now, UpdatedAt: now},
		{ID: "shift-demo-26", VenueID: "venue-1", StaffID: "staff-member-demo-6", StaffName: "Дмитрий Орлов", Role: models.StaffRoleWaiter, Date: dateStr(5), StartTime: "12:00", EndTime: "23:00", Status: models.ShiftStatusPending, Note: "Пятничный зал", CreatedAt: now, UpdatedAt: now},
		{ID: "shift-demo-27", VenueID: "venue-1", StaffID: "staff-member-demo-9", StaffName: "Наталья Сырбу", Role: models.StaffRoleCook, Date: dateStr(5), StartTime: "08:00", EndTime: "18:00", Status: models.ShiftStatusConfirmed, Note: "Выпечка плацинд", CreatedAt: now, UpdatedAt: now},
		{ID: "shift-demo-28", VenueID: "venue-1", StaffID: "staff-demo-1", StaffName: "Анна Коваленко", Role: models.StaffRoleWaiter, Date: dateStr(6), StartTime: "10:00", EndTime: "22:00", Status: models.ShiftStatusConfirmed, Note: "Старший официант", CreatedAt: now, UpdatedAt: now},

		// Venue 4 (Oliva) full schedule
		{ID: "shift-v4-1", VenueID: "venue-4", StaffID: "staff-v4-1", StaffName: "Ольга Бивол", Role: models.StaffRoleWaiter, Date: dateStr(0), StartTime: "10:00", EndTime: "22:00", Status: models.ShiftStatusConfirmed, Note: "Основной зал", CreatedAt: now, UpdatedAt: now},
		{ID: "shift-v4-2", VenueID: "venue-4", StaffID: "staff-v4-2", StaffName: "Ionela Ciobanu", Role: models.StaffRoleWaiter, Date: dateStr(0), StartTime: "12:00", EndTime: "23:00", Status: models.ShiftStatusConfirmed, Note: "Терраса", CreatedAt: now, UpdatedAt: now},
		{ID: "shift-v4-3", VenueID: "venue-4", StaffID: "staff-v4-6", StaffName: "Marco Bellini", Role: models.StaffRoleCook, Date: dateStr(0), StartTime: "10:00", EndTime: "22:00", Status: models.ShiftStatusConfirmed, Note: "Дровяная печь и пицца", CreatedAt: now, UpdatedAt: now},
		{ID: "shift-v4-4", VenueID: "venue-4", StaffID: "staff-v4-7", StaffName: "Андрей Попа", Role: models.StaffRoleCook, Date: dateStr(0), StartTime: "11:00", EndTime: "23:00", Status: models.ShiftStatusConfirmed, Note: "Паста-станция", CreatedAt: now, UpdatedAt: now},
		{ID: "shift-v4-5", VenueID: "venue-4", StaffID: "staff-v4-3", StaffName: "Максим Савин", Role: models.StaffRoleWaiter, Date: dateStr(1), StartTime: "10:00", EndTime: "22:00", Status: models.ShiftStatusSwapRequested, Reason: "Стоматолог в 16:00, ищу подмену", Note: "Основной зал", CreatedAt: now, UpdatedAt: now},
		{ID: "shift-v4-6", VenueID: "venue-4", StaffID: "staff-v4-5", StaffName: "Никита Ткач", Role: models.StaffRoleWaiter, Date: dateStr(1), StartTime: "12:00", EndTime: "23:00", Status: models.ShiftStatusConfirmed, Note: "Терраса и бар", CreatedAt: now, UpdatedAt: now},
		{ID: "shift-v4-7", VenueID: "venue-4", StaffID: "staff-v4-8", StaffName: "Svetlana Donica", Role: models.StaffRoleCook, Date: dateStr(1), StartTime: "10:00", EndTime: "21:00", Status: models.ShiftStatusPending, Note: "Антипасти и салаты", CreatedAt: now, UpdatedAt: now},
		{ID: "shift-v4-8", VenueID: "venue-4", StaffID: "staff-v4-4", StaffName: "Valeria Grosu", Role: models.StaffRoleWaiter, Date: dateStr(2), StartTime: "11:00", EndTime: "22:00", Status: models.ShiftStatusConfirmed, Note: "Зал", CreatedAt: now, UpdatedAt: now},
		{ID: "shift-v4-9", VenueID: "venue-4", StaffID: "staff-v4-6", StaffName: "Marco Bellini", Role: models.StaffRoleCook, Date: dateStr(2), StartTime: "10:00", EndTime: "22:00", Status: models.ShiftStatusConfirmed, Note: "Дровяная печь", CreatedAt: now, UpdatedAt: now},

		// Venue 11 (Sakura Sushi & Ramen) schedule
		{ID: "shift-v11-1", VenueID: "venue-11", StaffID: "staff-v11-1", StaffName: "Kenji Tanaka", Role: models.StaffRoleCook, Date: dateStr(0), StartTime: "11:00", EndTime: "23:00", Status: models.ShiftStatusConfirmed, Note: "Суши-бар", CreatedAt: now, UpdatedAt: now},
		{ID: "shift-v11-2", VenueID: "venue-11", StaffID: "staff-v11-2", StaffName: "Лилия Назарова", Role: models.StaffRoleWaiter, Date: dateStr(0), StartTime: "11:00", EndTime: "22:00", Status: models.ShiftStatusConfirmed, Note: "Основной зал", CreatedAt: now, UpdatedAt: now},
		{ID: "shift-v11-3", VenueID: "venue-11", StaffID: "staff-v11-4", StaffName: "Диана Бойко", Role: models.StaffRoleWaiter, Date: dateStr(1), StartTime: "12:00", EndTime: "23:00", Status: models.ShiftStatusPending, Note: "Вечерний сервис", CreatedAt: now, UpdatedAt: now},
		{ID: "shift-v11-4", VenueID: "venue-11", StaffID: "staff-v11-5", StaffName: "Игорь Киртоакэ", Role: models.StaffRoleCook, Date: dateStr(1), StartTime: "11:00", EndTime: "22:00", Status: models.ShiftStatusConfirmed, Note: "Рамен-станция", CreatedAt: now, UpdatedAt: now},
	}
	for _, sh := range extraShifts {
		if _, exists := s.shifts[sh.ID]; !exists {
			s.shifts[sh.ID] = sh
		}
	}

	// 8. Diverse reservations across statuses (CONFIRMED, CHECKED_IN, CANCELLED, NO_SHOW),
	// times (past days, today, tonight, upcoming +1..+3 days), party sizes (2..8), and notes.
	// Note: Keep venue-8 tomorrow evening after 20:30 free so TestAvailabilityRespectsHoursLeadAndPartySize passes.
	diverseReservations := []models.Reservation{
		// Venue 1 (La Plăcinte) rich reservations
		{ID: "res-demo-v1-today-13", UserID: "user-demo-guest-2", VenueID: "venue-1", TableID: "t2", Guests: 4, ReservedFor: localSlot(0, 13, 0), DurationMin: 90, Status: models.ReservationCheckedIn, Source: models.ReservationSourceWeb, Notes: "Бизнес-ланч, стол у прохода", ArrivalConfirmedAt: ptrTime(localSlot(0, 12, 55)), CreatedAt: now.Add(-6 * time.Hour), UpdatedAt: now},
		{ID: "res-demo-v1-today-18", UserID: "user-demo-guest-3", VenueID: "venue-1", TableID: "t-v1-8", Guests: 6, ReservedFor: localSlot(0, 18, 0), DurationMin: 120, Status: models.ReservationConfirmed, Source: models.ReservationSourceWeb, Notes: "Семейный ужин, детский стул", CreatedAt: now.Add(-4 * time.Hour), UpdatedAt: now},
		{ID: "res-demo-v1-today-20", UserID: "user-demo-guest-4", VenueID: "venue-1", TableID: "t-v1-9", Guests: 8, ReservedFor: localSlot(0, 20, 0), DurationMin: 150, Status: models.ReservationConfirmed, Source: models.ReservationSourcePhone, Notes: "День рождения, торт принесём заранее", CreatedAt: now.Add(-12 * time.Hour), UpdatedAt: now},
		{ID: "res-demo-v1-tom-13", UserID: "user-demo-guest-5", VenueID: "venue-1", TableID: "t-v1-6", Guests: 2, ReservedFor: localSlot(1, 13, 30), DurationMin: 60, Status: models.ReservationConfirmed, Source: models.ReservationSourceWeb, Notes: "Тихий столик у окна", CreatedAt: now.Add(-3 * time.Hour), UpdatedAt: now},
		{ID: "res-demo-v1-tom-19", UserID: "user-demo-guest-6", VenueID: "venue-1", TableID: "t-v1-11", Guests: 4, ReservedFor: localSlot(1, 19, 0), DurationMin: 120, Status: models.ReservationConfirmed, Source: models.ReservationSourceIOS, Notes: "В саду, если не будет дождя", CreatedAt: now.Add(-5 * time.Hour), UpdatedAt: now},
		{ID: "res-demo-v1-d2-20", UserID: "user-demo-guest-7", VenueID: "venue-1", TableID: "t-v1-12", Guests: 6, ReservedFor: localSlot(2, 20, 0), DurationMin: 120, Status: models.ReservationConfirmed, Source: models.ReservationSourceWeb, Notes: "Встреча выпускников", CreatedAt: now.Add(-2 * time.Hour), UpdatedAt: now},
		{ID: "res-demo-v1-yest-ok", UserID: "user-demo-guest-2", VenueID: "venue-1", TableID: "t-v1-7", Guests: 4, ReservedFor: localSlot(-1, 19, 0), DurationMin: 90, Status: models.ReservationCheckedIn, Source: models.ReservationSourceWeb, Notes: "Подача мамалыги сразу к приходу", ArrivalConfirmedAt: ptrTime(localSlot(-1, 18, 58)), CreatedAt: now.Add(-28 * time.Hour), UpdatedAt: now.Add(-24 * time.Hour)},
		{ID: "res-demo-v1-yest-can", UserID: "user-demo-guest-3", VenueID: "venue-1", TableID: "t5", Guests: 2, ReservedFor: localSlot(-1, 17, 30), DurationMin: 90, Status: models.ReservationCancelled, Source: models.ReservationSourceWeb, Notes: "Перенесли встречу на пятницу", CreatedAt: now.Add(-30 * time.Hour), UpdatedAt: now.Add(-26 * time.Hour)},
		{ID: "res-demo-v1-yest-noshow", UserID: "user-demo-guest-4", VenueID: "venue-1", TableID: "t-v1-10", Guests: 4, ReservedFor: localSlot(-1, 20, 30), DurationMin: 90, Status: models.ReservationNoShow, Source: models.ReservationSourcePhone, Notes: "Гость не ответил на звонок", CreatedAt: now.Add(-36 * time.Hour), UpdatedAt: now.Add(-22 * time.Hour)},

		// Venue 4 (Oliva — also owned by demoOwnerID!)
		{ID: "res-demo-v4-today-18", UserID: "user-demo-guest-5", VenueID: "venue-4", TableID: "t-v4-4", Guests: 5, ReservedFor: localSlot(0, 18, 30), DurationMin: 120, Status: models.ReservationConfirmed, Source: models.ReservationSourceWeb, Notes: "Просьба рядом с розеткой", CreatedAt: now.Add(-5 * time.Hour), UpdatedAt: now},
		{ID: "res-demo-v4-today-19", UserID: "user-demo-guest-6", VenueID: "venue-4", TableID: "t-v4-6", Guests: 2, ReservedFor: localSlot(0, 19, 30), DurationMin: 90, Status: models.ReservationCheckedIn, Source: models.ReservationSourceAndroid, Notes: "Свидание на террасе", ArrivalConfirmedAt: ptrTime(localSlot(0, 19, 25)), CreatedAt: now.Add(-8 * time.Hour), UpdatedAt: now},
		{ID: "res-demo-v4-tom-20", UserID: "user-demo-guest-7", VenueID: "venue-4", TableID: "t-v4-5", Guests: 7, ReservedFor: localSlot(1, 20, 0), DurationMin: 150, Status: models.ReservationConfirmed, Source: models.ReservationSourceWeb, Notes: "Корпоративный ужин команды", CreatedAt: now.Add(-4 * time.Hour), UpdatedAt: now},
		{ID: "res-demo-v4-yest-can", UserID: "user-demo-guest-2", VenueID: "venue-4", TableID: "t-v4-7", Guests: 4, ReservedFor: localSlot(-2, 19, 0), DurationMin: 90, Status: models.ReservationCancelled, Source: models.ReservationSourceWeb, Notes: "Отмена за 3 часа", CreatedAt: now.Add(-52 * time.Hour), UpdatedAt: now.Add(-50 * time.Hour)},

		// Venue 11 (Sakura Sushi & Ramen — also owned by demoOwnerID!)
		{ID: "res-demo-v11-today-19", UserID: "user-demo-guest-3", VenueID: "venue-11", TableID: "t-v11-3", Guests: 4, ReservedFor: localSlot(0, 19, 0), DurationMin: 90, Status: models.ReservationConfirmed, Source: models.ReservationSourceWeb, Notes: "Хотим сет Филадельфия к приходу", CreatedAt: now.Add(-3 * time.Hour), UpdatedAt: now},
		{ID: "res-demo-v11-tom-14", UserID: "user-demo-guest-4", VenueID: "venue-11", TableID: "t-v11-5", Guests: 2, ReservedFor: localSlot(1, 14, 0), DurationMin: 60, Status: models.ReservationConfirmed, Source: models.ReservationSourceWeb, Notes: "Обед у суши-бара", CreatedAt: now.Add(-2 * time.Hour), UpdatedAt: now},

		// Other published Balti venues so public schedule calendars & catalog availability look alive
		{ID: "res-demo-v3-tom-19", UserID: "user-demo-guest-5", VenueID: "venue-3", TableID: "t-v3-7", Guests: 6, ReservedFor: localSlot(1, 19, 30), DurationMin: 120, Status: models.ReservationConfirmed, Source: models.ReservationSourceWeb, Notes: "Ужин со стейками Рибай", CreatedAt: now.Add(-6 * time.Hour), UpdatedAt: now},
		{ID: "res-demo-v5-tom-20", UserID: "user-demo-guest-6", VenueID: "venue-5", TableID: "t-v5-5", Guests: 8, ReservedFor: localSlot(1, 20, 0), DurationMin: 150, Status: models.ReservationConfirmed, Source: models.ReservationSourcePhone, Notes: "Большая компания на крафтовое пиво", CreatedAt: now.Add(-4 * time.Hour), UpdatedAt: now},
		{ID: "res-demo-v6-d2-14", UserID: "user-demo-guest-7", VenueID: "venue-6", TableID: "t-v6-6", Guests: 6, ReservedFor: localSlot(2, 14, 0), DurationMin: 120, Status: models.ReservationConfirmed, Source: models.ReservationSourceWeb, Notes: "Стол в саду, традиционная кухня", CreatedAt: now.Add(-2 * time.Hour), UpdatedAt: now},
		{ID: "res-demo-v12-tom-20", UserID: "user-demo-guest-2", VenueID: "venue-12", TableID: "t-v12-4", Guests: 6, ReservedFor: localSlot(1, 20, 0), DurationMin: 120, Status: models.ReservationConfirmed, Source: models.ReservationSourceWeb, Notes: "Сибас на углях и белое вино", CreatedAt: now.Add(-3 * time.Hour), UpdatedAt: now},
		{ID: "res-demo-v13-tom-10", UserID: "user-demo-guest-3", VenueID: "venue-13", TableID: "t-v13-3", Guests: 3, ReservedFor: localSlot(1, 10, 30), DurationMin: 60, Status: models.ReservationConfirmed, Source: models.ReservationSourceWeb, Notes: "Утренний бранч и матча", CreatedAt: now.Add(-1 * time.Hour), UpdatedAt: now},
		{ID: "res-demo-v14-d2-18", UserID: "user-demo-guest-4", VenueID: "venue-14", TableID: "t-v14-6", Guests: 6, ReservedFor: localSlot(2, 18, 30), DurationMin: 120, Status: models.ReservationConfirmed, Source: models.ReservationSourceWeb, Notes: "Беседка в саду на компанию", CreatedAt: now.Add(-2 * time.Hour), UpdatedAt: now},
	}
	for _, r := range diverseReservations {
		if _, exists := s.reservations[r.ID]; !exists {
			s.reservations[r.ID] = r
		}
	}

	// 9. Active dining sessions, kitchen/bar orders, and waiter calls for /staff portal.
	if _, exists := s.sessions["sess-demo-v1-t3"]; !exists {
		s.sessions["sess-demo-v1-t3"] = models.Session{
			ID: "sess-demo-v1-t3", UserID: "user-demo-guest-2", VenueID: "venue-1", TableID: "t3",
			Status: models.SessionActive, StartedAt: now.Add(-38 * time.Minute).UTC(),
		}
	}
	if _, exists := s.sessions["sess-demo-v4-t3"]; !exists {
		s.sessions["sess-demo-v4-t3"] = models.Session{
			ID: "sess-demo-v4-t3", UserID: "user-demo-guest-6", VenueID: "venue-4", TableID: "t-v4-3",
			Status: models.SessionActive, StartedAt: now.Add(-25 * time.Minute).UTC(),
		}
	}

	demoOrders := []models.Order{
		{
			ID: "order-demo-v1-1", SessionID: "sess-demo-v1-t3", UserID: "user-demo-guest-2", VenueID: "venue-1",
			VenueName: s.venues["venue-1"].Name,
			Items: []models.OrderItem{
				{MenuItemID: "m1", Name: ls("Плацинда с брынзой", "Cheese plăcintă", "Plăcintă cu brânză"), Qty: 2, Price: 45},
				{MenuItemID: "m-v1-03", Name: ls("Зама с домашней лапшой", "Zeamă with homemade noodles", "Zeamă cu tăiței de casă"), Qty: 2, Price: 60},
				{MenuItemID: "m-v1-09", Name: ls("Токитурэ по-молдавски", "Moldovan tochitură", "Tochitură moldovenească"), Qty: 1, Price: 145},
			},
			Status: models.OrderPreparing, Total: 355, CheckNumber: "CHK-1042",
			CreatedAt: now.Add(-20 * time.Minute).UTC(), UpdatedAt: now.Add(-12 * time.Minute).UTC(),
		},
		{
			ID: "order-demo-v1-2", SessionID: "sess-demo-v1-t3", UserID: "user-demo-guest-2", VenueID: "venue-1",
			VenueName: s.venues["venue-1"].Name,
			Items: []models.OrderItem{
				{MenuItemID: "m-v1-10", Name: ls("Папанаши", "Papanași", "Papanași"), Qty: 2, Price: 70},
				{MenuItemID: "m-v1-12", Name: ls("Травяной чай с мёдом", "Herbal tea with honey", "Ceai din plante cu miere"), Qty: 1, Price: 30},
			},
			Status: models.OrderSubmitted, Total: 170, CheckNumber: "CHK-1043",
			CreatedAt: now.Add(-4 * time.Minute).UTC(), UpdatedAt: now.Add(-4 * time.Minute).UTC(),
		},
		{
			ID: "order-demo-v4-1", SessionID: "sess-demo-v4-t3", UserID: "user-demo-guest-6", VenueID: "venue-4",
			VenueName: s.venues["venue-4"].Name,
			Items: []models.OrderItem{
				{MenuItemID: "m-v4-09", Name: ls("Маргарита", "Margherita", "Margherita"), Qty: 1, Price: 105},
				{MenuItemID: "m-v4-05", Name: ls("Спагетти карбонара", "Spaghetti carbonara", "Spaghetti carbonara"), Qty: 1, Price: 125},
				{MenuItemID: "m-v4-15", Name: ls("Лимонад с базиликом и лаймом", "Basil and lime lemonade", "Limonadă cu busuioc și lime"), Qty: 2, Price: 45},
			},
			Status: models.OrderReady, Total: 320, CheckNumber: "CHK-2011",
			CreatedAt: now.Add(-18 * time.Minute).UTC(), UpdatedAt: now.Add(-2 * time.Minute).UTC(),
		},
	}
	for _, ord := range demoOrders {
		if _, exists := s.orders[ord.ID]; !exists {
			s.orders[ord.ID] = ord
		}
	}

	demoCalls := []models.WaiterCall{
		{ID: "call-demo-v1-1", SessionID: "sess-demo-v1-t3", VenueID: "venue-1", TableID: "t3", Reason: models.WaiterBill, Status: models.WaiterPending, CreatedAt: now.Add(-3 * time.Minute).UTC()},
		{ID: "call-demo-v4-1", SessionID: "sess-demo-v4-t3", VenueID: "venue-4", TableID: "t-v4-3", Reason: models.WaiterQuestion, Status: models.WaiterAccepted, CreatedAt: now.Add(-7 * time.Minute).UTC()},
	}
	for _, call := range demoCalls {
		if _, exists := s.waiterCalls[call.ID]; !exists {
			s.waiterCalls[call.ID] = call
		}
	}

	// 10. Waitlist entries on venue-3, venue-4, venue-5 (never venue-1 so waitlist_test.go assertions remain exact).
	demoWaitlist := []models.WaitlistEntry{
		{ID: "wl-demo-1", VenueID: "venue-4", UserID: "user-demo-guest-5", GuestName: "Dan Țurcanu", Phone: "+373 69 778 899", Guests: 2, Zone: "terrace", Note: "Ждём стол на террасе", Status: models.WaitlistWaiting, Source: models.WaitlistSourceWeb, CreatedAt: now.Add(-12 * time.Minute).UTC()},
		{ID: "wl-demo-2", VenueID: "venue-4", UserID: "user-demo-guest-7", GuestName: "Андрей Ботнарь", Phone: "+373 69 554 321", Guests: 4, Zone: "hall", Note: "В зале некурящих", Status: models.WaitlistWaiting, Source: models.WaitlistSourceHost, CreatedAt: now.Add(-6 * time.Minute).UTC()},
		{ID: "wl-demo-3", VenueID: "venue-3", UserID: "user-demo-guest-3", GuestName: "Victor Roșca", Phone: "+373 68 445 566", Guests: 2, Zone: "hall", Note: "У окна", Status: models.WaitlistWaiting, Source: models.WaitlistSourceIOS, CreatedAt: now.Add(-9 * time.Minute).UTC()},
	}
	for _, w := range demoWaitlist {
		if _, exists := s.waitlist[w.ID]; !exists {
			s.waitlist[w.ID] = w
		}
	}

	// 11. Event inquiries across venues.
	demoInquiries := []models.EventInquiry{
		{
			ID: "inq-demo-oliva", UserID: "user-demo-guest-6", VenueID: "venue-4", VenueName: s.venues["venue-4"].Name,
			EventType: "corporate", GuestCount: 18, PreferredDate: localSlot(7, 19, 0),
			ContactMethod: "call", ContactPhone: "+373 68 901 234", ContactName: "Ольга Кожокару",
			Notes: "Корпоративный ужин IT-команды, пицца-сеты и безалкогольные коктейли", Status: "CONTACTED",
			AdminPhone: "+373 (231) 2-44-11", AdminTelegram: "@seatiko_admin", CreatedAt: now.Add(-18 * time.Hour).UTC(), UpdatedAt: now.Add(-10 * time.Hour).UTC(),
		},
		{
			ID: "inq-demo-portomare", UserID: "user-demo-guest-2", VenueID: "venue-12", VenueName: s.venues["venue-12"].Name,
			EventType: "banquet", GuestCount: 24, PreferredDate: localSlot(10, 18, 30),
			ContactMethod: "chat", ContactPhone: "+373 69 112 233", ContactName: "Maria Popescu",
			Notes: "Семейный юбилей на террасе с рыбным меню", Status: "PENDING",
			AdminPhone: "+373 (231) 2-44-11", AdminTelegram: "@seatiko_admin", CreatedAt: now.Add(-4 * time.Hour).UTC(), UpdatedAt: now.Add(-4 * time.Hour).UTC(),
		},
	}
	for _, inq := range demoInquiries {
		if _, exists := s.eventInquiries[inq.ID]; !exists {
			s.eventInquiries[inq.ID] = inq
		}
	}

	for venueID := range s.venues {
		s.refreshFreeTablesLocked(venueID)
	}
}

// ensureExtendedDemoSeedLocked runs once per demoSeedVersion on loaded snapshots
// so existing persistent state picks up new test venues, floor plans, staff, and bookings.
func (s *MemoryStore) ensureExtendedDemoSeedLocked() {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.demoSeedVer >= demoSeedVersion {
		return
	}
	// If legacy snapshot already had old sparse coordinates for t1..t15, refresh only unmoved coords.
	s.seedExtendedDemoLocked()
	// Also normalize any old coordinates on t1..t15 cleanly if they match the original flat line.
	flatCoords := map[string][2]float64{
		"t1": {0.2, 0.3}, "t2": {0.5, 0.3}, "t3": {0.8, 0.3}, "t4": {0.35, 0.65}, "t5": {0.65, 0.65},
		"t6": {0.3, 0.4}, "t7": {0.6, 0.4}, "t8": {0.45, 0.7}, "t9": {0.75, 0.7}, "t10": {0.2, 0.75},
		"t11": {0.4, 0.5}, "t12": {0.7, 0.5}, "t13": {0.28, 0.35}, "t14": {0.55, 0.4}, "t15": {0.78, 0.62},
	}
	refined := map[string][2]float64{
		"t1": {0.16, 0.36}, "t2": {0.42, 0.32}, "t3": {0.68, 0.32}, "t4": {0.24, 0.42}, "t5": {0.56, 0.36},
		"t6": {0.20, 0.38}, "t7": {0.48, 0.38}, "t8": {0.22, 0.44}, "t9": {0.52, 0.44}, "t10": {0.80, 0.44},
		"t11": {0.26, 0.36}, "t12": {0.58, 0.36}, "t13": {0.24, 0.44}, "t14": {0.54, 0.44}, "t15": {0.50, 0.46},
	}
	for id, old := range flatCoords {
		if t, ok := s.tables[id]; ok && t.X == old[0] && t.Y == old[1] {
			next := refined[id]
			t.X, t.Y = next[0], next[1]
			s.tables[id] = t
		}
	}
	// Make sure user-demo-guest-* display names don't interfere with owner search
	for id := range s.users {
		if strings.HasPrefix(id, "user-demo-guest-") && s.users[id].Role == "" {
			u := s.users[id]
			u.Role = models.RoleGuest
			s.users[id] = u
		}
	}
	s.demoSeedVer = demoSeedVersion
	log.Printf("backfilled extended demo seed v%d (%d venues, %d tables, %d menu items, %d shifts)",
		demoSeedVersion, len(s.venues), len(s.tables), len(s.menuItems), len(s.shifts))
	s.persistBestEffortLocked()
}

