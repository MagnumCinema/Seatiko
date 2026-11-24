package store

import (
	"math"
	"regexp"
	"sort"
	"strconv"
	"time"
	_ "time/tzdata" // the runtime image has no zoneinfo; venue hours are Moldova local time

	"github.com/seatiko/api/internal/models"
)

// MinBookingLeadMin: a guest cannot book a start sooner than this from now.
// Mirrors MIN_LEAD_MIN in apps/web/src/lib/booking-slots.ts.
const MinBookingLeadMin = 15

// DefaultAvailabilityWindowMin is how far from the wanted time a free start still matches.
const DefaultAvailabilityWindowMin = 90

// VenueLocation is the time zone of venue opening hours (pilot: Moldova only).
var VenueLocation = loadVenueLocation()

func loadVenueLocation() *time.Location {
	loc, err := time.LoadLocation("Europe/Chisinau")
	if err != nil {
		return time.FixedZone("EET", 2*60*60)
	}
	return loc
}

// OpeningHours are minutes from local midnight; CloseMin may exceed 24h for venues open past midnight.
type OpeningHours struct {
	OpenMin  int
	CloseMin int
}

// DefaultOpeningHours apply when a venue has no parsable hours line.
var DefaultOpeningHours = OpeningHours{OpenMin: 10 * 60, CloseMin: 23 * 60}

var hoursPattern = regexp.MustCompile(`(\d{1,2}):(\d{2})\s*[–-]\s*(\d{1,2}):(\d{2})`)

// ParseOpeningHours reads "Пн–Вс 10:00–22:00" / "Mon–Sun 12:00–01:00".
// Mirrors parseOpeningHours in apps/web/src/lib/booking-slots.ts.
func ParseOpeningHours(text string) OpeningHours {
	m := hoursPattern.FindStringSubmatch(text)
	if m == nil {
		return DefaultOpeningHours
	}
	num := func(s string) int { n, _ := strconv.Atoi(s); return n }
	open := num(m[1])*60 + num(m[2])
	close := num(m[3])*60 + num(m[4])
	if open >= 24*60 || close > 24*60 {
		return DefaultOpeningHours
	}
	if close <= open {
		close += 24 * 60
	}
	return OpeningHours{OpenMin: open, CloseMin: close}
}

// bookingDurationOptions are the booking lengths offered to guests: the venue
// default plus half-hour steps from 1 h to the venue max. Mirrors durationOptions
// in apps/web/src/lib/venue-rules.ts.
func bookingDurationOptions(v models.Venue) []int {
	max := maxVisitMinutes(v)
	set := map[int]struct{}{visitMinutes(v): {}}
	for min := 60; min <= max; min += 30 {
		set[min] = struct{}{}
	}
	out := make([]int, 0, len(set))
	for min := range set {
		if min >= MinVisitDurationMin && min <= max {
			out = append(out, min)
		}
	}
	sort.Ints(out)
	return out
}

// venueBookingDuration is the longest length the venue offers that does not exceed
// the requested one (0 = venue default). Mirrors venueDuration in venue-availability.ts.
func venueBookingDuration(v models.Venue, requested int) int {
	if requested <= 0 {
		return visitMinutes(v)
	}
	options := bookingDurationOptions(v)
	best := 0
	for _, min := range options {
		if min <= requested {
			best = min
		}
	}
	if best > 0 {
		return best
	}
	if len(options) > 0 {
		return options[0]
	}
	return visitMinutes(v)
}

// AvailabilityQuery asks for free tables across a city's venues.
type AvailabilityQuery struct {
	CityID string // "" = every city
	// Day is any instant inside the wanted local day (VenueLocation).
	Day time.Time
	// Target is the wanted start; nil = as soon as possible that day.
	Target      *time.Time
	Guests      int
	DurationMin int // 0 = each venue's default
	WindowMin   int
	Limit       int
	Now         time.Time
}

// SearchAvailability returns, for every venue in the city, the free booking starts
// around the wanted time and the smallest table that fits for each. Free means
// CreateReservationWithDuration would accept that table at that start, the start is
// inside opening hours and at least MinBookingLeadMin from now.
// Sorted: exact match, then closest start, then rating.
func (s *MemoryStore) SearchAvailability(q AvailabilityQuery) []models.VenueAvailability {
	if q.Limit <= 0 {
		q.Limit = 4
	}
	if q.WindowMin <= 0 {
		q.WindowMin = DefaultAvailabilityWindowMin
	}
	if q.Now.IsZero() {
		q.Now = time.Now()
	}
	q.Now = q.Now.UTC()

	s.mu.RLock()
	defer s.mu.RUnlock()

	tablesByVenue := make(map[string][]models.Table)
	for _, t := range s.tables {
		tablesByVenue[t.VenueID] = append(tablesByVenue[t.VenueID], t)
	}

	type ranked struct {
		result models.VenueAvailability
		rank   float64
		rating float64
	}
	results := make([]ranked, 0)
	for _, v := range s.listVenuesLocked(q.CityID) {
		result := s.venueAvailabilityLocked(v, tablesByVenue[v.ID], q)
		results = append(results, ranked{result: result, rank: availabilityRank(result, q.Target), rating: v.Rating})
	}
	sort.SliceStable(results, func(i, j int) bool {
		a, b := results[i], results[j]
		if a.rank != b.rank {
			return a.rank < b.rank
		}
		if a.rating != b.rating {
			return a.rating > b.rating
		}
		return a.result.VenueID < b.result.VenueID
	})
	out := make([]models.VenueAvailability, len(results))
	for i, r := range results {
		out[i] = r.result
	}
	return out
}

// venueAvailabilityLocked computes one venue's free starts. Callers must hold s.mu.
func (s *MemoryStore) venueAvailabilityLocked(v models.Venue, tables []models.Table, q AvailabilityQuery) models.VenueAvailability {
	durationMin := venueBookingDuration(v, q.DurationMin)
	result := models.VenueAvailability{
		VenueID:     v.ID,
		DurationMin: durationMin,
		Slots:       []models.AvailabilitySlot{},
	}

	candidates := make([]models.Table, 0, len(tables))
	for _, t := range tables {
		if t.Seats >= q.Guests {
			candidates = append(candidates, t)
		}
	}
	if len(candidates) == 0 {
		return result
	}
	result.Fits = true
	// Smallest table that fits first, to keep big tables for big parties.
	sort.Slice(candidates, func(i, j int) bool {
		if candidates[i].Seats != candidates[j].Seats {
			return candidates[i].Seats < candidates[j].Seats
		}
		return candidates[i].Number < candidates[j].Number
	})

	free := s.freeStartsLocked(v, candidates, q.Day, durationMin, q.Now)
	if q.Target == nil {
		result.Slots = firstSlots(free, q.Limit)
		return result
	}

	target := q.Target.UTC()
	window := time.Duration(q.WindowMin) * time.Minute
	near := make([]models.AvailabilitySlot, 0)
	for _, slot := range free {
		if absDuration(slot.StartsAt.Sub(target)) <= window {
			near = append(near, slot)
		}
	}
	sort.SliceStable(near, func(i, j int) bool {
		gi, gj := absDuration(near[i].StartsAt.Sub(target)), absDuration(near[j].StartsAt.Sub(target))
		if gi != gj {
			return gi < gj
		}
		return near[i].StartsAt.Before(near[j].StartsAt)
	})
	near = firstSlots(near, q.Limit)
	sort.SliceStable(near, func(i, j int) bool { return near[i].StartsAt.Before(near[j].StartsAt) })
	result.Slots = near
	for _, slot := range near {
		if slot.StartsAt.Equal(target) {
			result.Exact = true
		}
	}
	if len(near) == 0 {
		result.LaterToday = firstSlots(free, q.Limit)
	}
	return result
}

// freeStartsLocked lists every bookable start on the local day of `day`, each with
// the first candidate table that is free for the whole booking. Callers must hold s.mu.
func (s *MemoryStore) freeStartsLocked(v models.Venue, candidates []models.Table, day time.Time, durationMin int, now time.Time) []models.AvailabilitySlot {
	hours := ParseOpeningHours(v.HoursText)
	step := v.BookingIntervalMin
	if step <= 0 {
		step = DefaultBookingIntervalMin
	}
	local := day.In(VenueLocation)
	earliest := now.Add(MinBookingLeadMin * time.Minute)
	span := time.Duration(durationMin) * time.Minute

	out := make([]models.AvailabilitySlot, 0)
	for min := hours.OpenMin; min+durationMin <= hours.CloseMin; min += step {
		start := time.Date(local.Year(), local.Month(), local.Day(), 0, min, 0, 0, VenueLocation).UTC()
		if start.Before(earliest) {
			continue
		}
		for _, t := range candidates {
			if !s.tableBusyAtLocked(t, start, span, now) {
				out = append(out, models.AvailabilitySlot{StartsAt: start, TableID: t.ID, TableNumber: t.Number})
				break
			}
		}
	}
	return out
}

// availabilityRank orders venues: exact time first, then the closest free start.
// Mirrors availabilityRank in venue-availability.ts.
func availabilityRank(r models.VenueAvailability, target *time.Time) float64 {
	if len(r.Slots) == 0 {
		return math.Inf(1)
	}
	if r.Exact {
		return 0
	}
	if target == nil {
		return float64(r.Slots[0].StartsAt.Unix())
	}
	best := math.Inf(1)
	for _, slot := range r.Slots {
		if gap := absDuration(slot.StartsAt.Sub(*target)).Seconds(); gap < best {
			best = gap
		}
	}
	return best
}

func firstSlots(slots []models.AvailabilitySlot, limit int) []models.AvailabilitySlot {
	if len(slots) > limit {
		slots = slots[:limit]
	}
	return append([]models.AvailabilitySlot{}, slots...)
}

func absDuration(d time.Duration) time.Duration {
	if d < 0 {
		return -d
	}
	return d
}
