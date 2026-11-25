package store

import (
	"fmt"
	"testing"
	"time"

	"github.com/seatiko/api/internal/models"
)

// localAt is a wall-clock time in the venue time zone, `days` after today.
func localAt(days, hour, min int) time.Time {
	now := time.Now().In(VenueLocation)
	return time.Date(now.Year(), now.Month(), now.Day()+days, hour, min, 0, 0, VenueLocation)
}

func venueResult(t *testing.T, results []models.VenueAvailability, venueID string) models.VenueAvailability {
	t.Helper()
	for _, r := range results {
		if r.VenueID == venueID {
			return r
		}
	}
	t.Fatalf("venue %s missing from availability", venueID)
	return models.VenueAvailability{}
}

// quickUser adds a guest without password hashing, so tests can book many times
// (the anti-spam rule allows one active booking per guest).
func quickUser(mem *MemoryStore, n int) string {
	id := fmt.Sprintf("avail-user-%d", n)
	mem.mu.Lock()
	mem.users[id] = models.User{ID: id, Email: id + "@example.com", Role: models.RoleGuest}
	mem.mu.Unlock()
	return id
}

func TestParseOpeningHours(t *testing.T) {
	cases := []struct {
		text string
		want OpeningHours
	}{
		{"Пн–Вс 10:00–22:00", OpeningHours{600, 1320}},
		{"Mon–Sun 08:30–22:00", OpeningHours{510, 1320}},
		{"Пн-Вс 10:00 - 23:00", OpeningHours{600, 1380}},
		{"Пн–Вс 12:00–00:00", OpeningHours{720, 1440}},
		{"Пн–Вс 12:00–01:00", OpeningHours{720, 1500}},
		{"", DefaultOpeningHours},
		{"по договорённости", DefaultOpeningHours},
		{"99:00–10:00", DefaultOpeningHours},
	}
	for _, tc := range cases {
		if got := ParseOpeningHours(tc.text); got != tc.want {
			t.Errorf("ParseOpeningHours(%q) = %+v, want %+v", tc.text, got, tc.want)
		}
	}
}

func TestVenueBookingDuration(t *testing.T) {
	venue := models.Venue{VisitDurationMin: 90, MaxVisitDurationMin: 180}
	cases := map[int]int{0: 90, 30: 60, 60: 60, 75: 60, 90: 90, 150: 150, 240: 180}
	for requested, want := range cases {
		if got := venueBookingDuration(venue, requested); got != want {
			t.Errorf("venueBookingDuration(%d) = %d, want %d", requested, got, want)
		}
	}
}

func TestSeedVenuesHaveHours(t *testing.T) {
	mem := NewMemory()
	for _, v := range mem.ListVenues("") {
		if v.HoursText == "" {
			t.Errorf("seeded venue %s has no hours_text", v.ID)
		}
	}
}

// Every start the search offers must be accepted by CreateReservationWithDuration,
// and once booked the same table must no longer be offered for an overlapping start.
func TestAvailabilityMatchesReservationCreation(t *testing.T) {
	mem := NewMemory()
	day := localAt(1, 12, 0)
	const guests, duration = 2, 90
	booked := 0

	for i := 0; i < 60; i++ {
		results := mem.SearchAvailability(AvailabilityQuery{CityID: DefaultCityID, Day: day, Guests: guests, DurationMin: duration, Limit: 12})
		r := venueResult(t, results, "venue-1")
		if len(r.Slots) == 0 {
			break
		}
		slot := r.Slots[0]
		userID := quickUser(mem, i)
		res, err := mem.CreateReservationWithDuration(userID, "venue-1", []string{slot.TableID}, guests, slot.StartsAt, r.DurationMin, "", models.ReservationSourceWeb)
		if err != nil {
			t.Fatalf("offered slot %s on %s rejected by booking: %v", slot.StartsAt, slot.TableID, err)
		}
		booked++

		end := res.ReservedFor.Add(time.Duration(r.DurationMin) * time.Minute)
		after := venueResult(t, mem.SearchAvailability(AvailabilityQuery{CityID: DefaultCityID, Day: day, Guests: guests, DurationMin: duration, Limit: 100}), "venue-1")
		for _, s := range after.Slots {
			sEnd := s.StartsAt.Add(time.Duration(after.DurationMin) * time.Minute)
			if s.TableID == slot.TableID && s.StartsAt.Before(end) && sEnd.After(res.ReservedFor) {
				t.Fatalf("table %s still offered at %s after booking %s", s.TableID, s.StartsAt, res.ReservedFor)
			}
		}
	}
	if booked < 5 {
		t.Fatalf("only %d bookings made from availability, want a busy day", booked)
	}
}

func TestAvailabilityAroundTarget(t *testing.T) {
	mem := NewMemory()
	target := localAt(1, 19, 0)
	results := mem.SearchAvailability(AvailabilityQuery{CityID: DefaultCityID, Day: target, Target: &target, Guests: 2, Limit: 4})
	want := len(mem.ListVenues(DefaultCityID))
	if len(results) != want {
		t.Fatalf("got %d venues, want all %d seeded venues", len(results), want)
	}
	first := results[0]
	if !first.Exact {
		t.Fatalf("first venue %s should match 19:00 exactly on an empty evening", first.VenueID)
	}
	for _, r := range results {
		if len(r.Slots) > 4 {
			t.Fatalf("%s: %d slots, limit 4", r.VenueID, len(r.Slots))
		}
		for i, s := range r.Slots {
			if gap := absDuration(s.StartsAt.Sub(target)); gap > DefaultAvailabilityWindowMin*time.Minute {
				t.Fatalf("%s: slot %s is %s from target", r.VenueID, s.StartsAt, gap)
			}
			if i > 0 && !r.Slots[i-1].StartsAt.Before(s.StartsAt) {
				t.Fatalf("%s: slots not chronological", r.VenueID)
			}
		}
	}

	// Before every venue opens: nothing near, but the day's first free starts are offered.
	early := localAt(1, 3, 0)
	r := venueResult(t, mem.SearchAvailability(AvailabilityQuery{CityID: DefaultCityID, Day: early, Target: &early, Guests: 2}), "venue-1")
	if len(r.Slots) != 0 || len(r.LaterToday) == 0 || r.Exact {
		t.Fatalf("03:00 search = %+v, want no near slots and later_today", r)
	}
	if got := r.LaterToday[0].StartsAt.In(VenueLocation); got.Hour() != 10 || got.Minute() != 0 {
		t.Fatalf("venue-1 first start = %s, want 10:00 opening", got)
	}
}

func TestAvailabilityRespectsHoursLeadAndPartySize(t *testing.T) {
	mem := NewMemory()

	// Lead time: nothing earlier than 15 minutes from "now".
	now := localAt(1, 14, 5)
	r := venueResult(t, mem.SearchAvailability(AvailabilityQuery{CityID: DefaultCityID, Day: now, Guests: 2, Now: now, Limit: 1}), "venue-1")
	if len(r.Slots) != 1 || r.Slots[0].StartsAt.Before(now.Add(MinBookingLeadMin*time.Minute)) {
		t.Fatalf("slots %+v ignore the %d min lead time from %s", r.Slots, MinBookingLeadMin, now)
	}

	// Venue-8 is open until 01:00: a 90 min booking may start at 23:30, not later.
	day := localAt(1, 12, 0)
	mem.mu.Lock()
	mem.tables["t-late"] = models.Table{ID: "t-late", VenueID: "venue-8", Number: 1, Seats: 4, Status: models.TableFree, Zone: "hall"}
	mem.mu.Unlock()
	late := venueResult(t, mem.SearchAvailability(AvailabilityQuery{CityID: DefaultCityID, Day: day, Guests: 2, DurationMin: 90, Limit: 100}), "venue-8")
	last := late.Slots[len(late.Slots)-1].StartsAt.In(VenueLocation)
	if last.Hour() != 23 || last.Minute() != 30 {
		t.Fatalf("venue-8 last start = %s, want 23:30", last)
	}

	// Smallest fitting table first.
	tables := map[string]models.Table{}
	for _, tb := range mem.ListTables("venue-1") {
		tables[tb.ID] = tb
	}
	for _, s := range venueResult(t, mem.SearchAvailability(AvailabilityQuery{CityID: DefaultCityID, Day: day, Guests: 3, Limit: 100}), "venue-1").Slots {
		if tables[s.TableID].Seats < 3 {
			t.Fatalf("slot %s uses table %s with %d seats for 3 guests", s.StartsAt, s.TableID, tables[s.TableID].Seats)
		}
	}

	// A party no table seats: every venue listed, none fitting.
	results := mem.SearchAvailability(AvailabilityQuery{CityID: DefaultCityID, Day: day, Guests: 50})
	for _, r := range results {
		if r.Fits || len(r.Slots) != 0 {
			t.Fatalf("%s fits 50 guests: %+v", r.VenueID, r)
		}
	}
}
