package store

import (
	"path/filepath"
	"testing"
	"time"

	"github.com/seatiko/api/internal/models"
)

// isolatedTable gives a guest-free table with no reservations at all.
func isolatedTable(t *testing.T, mem *MemoryStore, status models.TableStatus) models.Table {
	t.Helper()
	table := models.Table{ID: "t-conflict", VenueID: "venue-1", Number: 99, Seats: 4, Status: status, Zone: "hall"}
	mem.mu.Lock()
	mem.tables[table.ID] = table
	mem.mu.Unlock()
	return table
}

func TestBookingRejectsOverlapAcceptsLaterSlot(t *testing.T) {
	mem := NewMemory()
	first := registerTestUser(t, mem, "first@example.com", models.RoleGuest)
	second := registerTestUser(t, mem, "second@example.com", models.RoleGuest)
	table := isolatedTable(t, mem, models.TableFree)

	at := time.Now().UTC().Add(3 * time.Hour).Truncate(time.Minute)
	if _, err := mem.CreateReservation(first.ID, "venue-1", table.ID, 2, at, models.ReservationSourceWeb); err != nil {
		t.Fatalf("first booking: %v", err)
	}
	if _, err := mem.CreateReservation(second.ID, "venue-1", table.ID, 2, at.Add(60*time.Minute), models.ReservationSourceWeb); err != ErrTableNotFree {
		t.Fatalf("overlapping booking err = %v, want ErrTableNotFree", err)
	}
	later, err := mem.CreateReservation(second.ID, "venue-1", table.ID, 2, at.Add(DefaultVisitDurationMin*time.Minute), models.ReservationSourceWeb)
	if err != nil {
		t.Fatalf("back-to-back booking on a reserved table: %v", err)
	}

	got, _ := mem.GetTable(table.ID)
	if got.Status != models.TableReserved || got.ReservationID == nil || *got.ReservationID == later.ID {
		t.Fatalf("table must keep showing the nearest booking, got %#v", got)
	}
}

func TestBookingOccupiedTableOnlyAfterItFrees(t *testing.T) {
	mem := NewMemory()
	guest := registerTestUser(t, mem, "after@example.com", models.RoleGuest)
	table := isolatedTable(t, mem, models.TableOccupied)
	seated := time.Now().UTC().Add(-30 * time.Minute)
	mem.mu.Lock()
	table.OccupiedSince = &seated
	mem.tables[table.ID] = table
	mem.mu.Unlock()

	if _, err := mem.CreateReservation(guest.ID, "venue-1", table.ID, 2, time.Now().UTC().Add(20*time.Minute), models.ReservationSourceWeb); err != ErrTableNotFree {
		t.Fatalf("booking during occupancy err = %v, want ErrTableNotFree", err)
	}
	if _, err := mem.CreateReservation(guest.ID, "venue-1", table.ID, 2, seated.Add(2*time.Hour), models.ReservationSourceWeb); err != nil {
		t.Fatalf("booking after the table frees: %v", err)
	}
	got, _ := mem.GetTable(table.ID)
	if got.Status != models.TableOccupied {
		t.Fatalf("seated table must stay OCCUPIED, got %s", got.Status)
	}
}

func TestScheduleShowsSeatedGuestsAndOrphanReservations(t *testing.T) {
	mem := NewMemory()
	longAgo := time.Now().UTC().Add(-5 * time.Hour)
	reservedFor := time.Now().UTC().Add(2 * time.Hour)
	missing := "missing-reservation"
	mem.mu.Lock()
	mem.tables["t-seated"] = models.Table{ID: "t-seated", VenueID: "venue-1", Number: 97, Seats: 2, Status: models.TableOccupied, OccupiedSince: &longAgo}
	mem.tables["t-orphan"] = models.Table{ID: "t-orphan", VenueID: "venue-1", Number: 98, Seats: 2, Status: models.TableReserved, ReservedFor: &reservedFor, ReservationID: &missing}
	mem.mu.Unlock()

	slots, err := mem.ListVenueSchedule("venue-1")
	if err != nil {
		t.Fatalf("schedule: %v", err)
	}
	var seatedOK, orphanOK bool
	for _, slot := range slots {
		switch slot.TableID {
		case "t-seated":
			seatedOK = slot.Kind == "OCCUPIED" && slot.EndsAt.After(time.Now().UTC())
		case "t-orphan":
			orphanOK = slot.Kind == "RESERVATION" && slot.StartsAt.Equal(reservedFor)
		}
	}
	if !seatedOK || !orphanOK {
		t.Fatalf("seated=%v orphan=%v slots=%#v", seatedOK, orphanOK, slots)
	}
}

func TestPersistentStoreReleasesStaleReservedTables(t *testing.T) {
	path := filepath.Join(t.TempDir(), "state.json")
	first, err := NewPersistent(path)
	if err != nil {
		t.Fatalf("create: %v", err)
	}
	old := time.Now().UTC().Add(-60 * 24 * time.Hour)
	soon := time.Now().UTC().Add(time.Hour)
	first.mu.Lock()
	first.tables["t-stale"] = models.Table{ID: "t-stale", VenueID: "venue-1", Number: 90, Seats: 2, Status: models.TableReserved, ReservedFor: &old}
	first.tables["t-soon"] = models.Table{ID: "t-soon", VenueID: "venue-1", Number: 91, Seats: 2, Status: models.TableReserved, ReservedFor: &soon}
	first.persistBestEffortLocked()
	first.mu.Unlock()

	second, err := NewPersistent(path)
	if err != nil {
		t.Fatalf("reload: %v", err)
	}
	stale, _ := second.GetTable("t-stale")
	upcoming, _ := second.GetTable("t-soon")
	if stale.Status != models.TableFree || stale.ReservedFor != nil {
		t.Fatalf("stale table not released: %#v", stale)
	}
	if upcoming.Status != models.TableReserved {
		t.Fatalf("upcoming booking must stay reserved: %#v", upcoming)
	}
	demo, _ := second.GetTable("t7")
	if demo.ReservedFor == nil || staleDemoTime(demo.ReservedFor) {
		t.Fatalf("demo reserved table must be re-seeded relative to now: %#v", demo)
	}
}

func TestLateArrivalWithinLimitHoldsTheTableLonger(t *testing.T) {
	mem := NewMemory()
	guest := registerTestUser(t, mem, "late@example.com", models.RoleGuest)
	other := registerTestUser(t, mem, "next@example.com", models.RoleGuest)
	table := isolatedTable(t, mem, models.TableFree)

	at := time.Now().UTC().Add(2 * time.Hour).Truncate(time.Minute)
	res, err := mem.CreateReservation(guest.ID, "venue-1", table.ID, 2, at, models.ReservationSourceWeb)
	if err != nil {
		t.Fatalf("book: %v", err)
	}
	tooLate := at.Add((DefaultMaxLateArrivalMin + 1) * time.Minute)
	if _, err := mem.ConfirmArrival(guest.ID, res.ID, &tooLate); err != ErrConflict {
		t.Fatalf("arrival beyond the limit err = %v, want ErrConflict", err)
	}
	late := at.Add(20 * time.Minute)
	if _, err := mem.ConfirmArrival(guest.ID, res.ID, &late); err != nil {
		t.Fatalf("20 min late arrival: %v", err)
	}
	// A slot right after the original 90-minute window now overlaps the late visit.
	if _, err := mem.CreateReservation(other.ID, "venue-1", table.ID, 2, at.Add(DefaultVisitDurationMin*time.Minute), models.ReservationSourceWeb); err != ErrTableNotFree {
		t.Fatalf("booking inside the extended window err = %v, want ErrTableNotFree", err)
	}
	if _, err := mem.CreateReservation(other.ID, "venue-1", table.ID, 2, late.Add(DefaultVisitDurationMin*time.Minute), models.ReservationSourceWeb); err != nil {
		t.Fatalf("booking after the late visit: %v", err)
	}
}

func TestOwnerBookingRulesDriveLatenessAndVisitLength(t *testing.T) {
	mem := NewMemory()
	owner := registerTestUser(t, mem, "rules-owner@example.com", models.RoleRestaurant)
	guest := registerTestUser(t, mem, "rules-guest@example.com", models.RoleGuest)
	other := registerTestUser(t, mem, "rules-other@example.com", models.RoleGuest)
	table := isolatedTable(t, mem, models.TableFree)
	mem.mu.Lock()
	venueID := "venue-1"
	mem.applications["app-rules"] = models.VenueApplication{ID: "app-rules", OwnerUserID: owner.ID, VenueID: &venueID, Status: models.AppPublished}
	mem.mu.Unlock()

	bad := 10
	hold := 20
	if _, err := mem.UpdateVenueBookingRules(owner.ID, "venue-1", BookingRulesInput{HoldMinutes: &hold, MaxLateArrivalMin: &bad}); err != ErrBadRequest {
		t.Fatalf("max late below hold err = %v, want ErrBadRequest", err)
	}
	maxLate, visit := 45, 60
	venue, err := mem.UpdateVenueBookingRules(owner.ID, "venue-1", BookingRulesInput{MaxLateArrivalMin: &maxLate, VisitDurationMin: &visit})
	if err != nil || venue.MaxLateArrivalMin != 45 || venue.VisitDurationMin != 60 {
		t.Fatalf("update rules: %#v, %v", venue, err)
	}

	at := time.Now().UTC().Add(3 * time.Hour).Truncate(time.Minute)
	res, err := mem.CreateReservation(guest.ID, "venue-1", table.ID, 2, at, models.ReservationSourceWeb)
	if err != nil {
		t.Fatalf("book: %v", err)
	}
	// A 60-minute visit frees the table for a booking 60 minutes later.
	if _, err := mem.CreateReservation(other.ID, "venue-1", table.ID, 2, at.Add(60*time.Minute), models.ReservationSourceWeb); err != nil {
		t.Fatalf("booking after a 60-minute visit: %v", err)
	}
	tooLate := at.Add(50 * time.Minute)
	if _, err := mem.ConfirmArrival(guest.ID, res.ID, &tooLate); err != ErrConflict {
		t.Fatalf("50 min late with a 45-minute limit err = %v, want ErrConflict", err)
	}
	late := at.Add(40 * time.Minute)
	if _, err := mem.ConfirmArrival(guest.ID, res.ID, &late); err != nil {
		t.Fatalf("40 min late within the venue limit: %v", err)
	}
}

func TestGuestChosenDurationIsValidatedAndBlocksTheTable(t *testing.T) {
	mem := NewMemory()
	guest := registerTestUser(t, mem, "dur-guest@example.com", models.RoleGuest)
	other := registerTestUser(t, mem, "dur-other@example.com", models.RoleGuest)
	table := isolatedTable(t, mem, models.TableFree)
	at := time.Now().UTC().Add(3 * time.Hour).Truncate(time.Minute)

	if _, err := mem.CreateReservationWithDuration(guest.ID, "venue-1", []string{table.ID}, 2, at, DefaultMaxVisitDurationMin+30, "", models.ReservationSourceWeb); err != ErrInvalidDuration {
		t.Fatalf("too long booking err = %v, want ErrInvalidDuration", err)
	}
	if _, err := mem.CreateReservationWithDuration(guest.ID, "venue-1", []string{table.ID}, 2, at, 20, "", models.ReservationSourceWeb); err != ErrInvalidDuration {
		t.Fatalf("too short booking err = %v, want ErrInvalidDuration", err)
	}
	res, err := mem.CreateReservationWithDuration(guest.ID, "venue-1", []string{table.ID}, 2, at, 150, "", models.ReservationSourceWeb)
	if err != nil || res.DurationMin != 150 {
		t.Fatalf("150-minute booking: %#v, %v", res, err)
	}
	// The default 90-minute window would end earlier; the chosen 150 minutes still block the table.
	if _, err := mem.CreateReservation(other.ID, "venue-1", table.ID, 2, at.Add(120*time.Minute), models.ReservationSourceWeb); err != ErrTableNotFree {
		t.Fatalf("booking inside the chosen duration err = %v, want ErrTableNotFree", err)
	}
	if _, err := mem.CreateReservation(other.ID, "venue-1", table.ID, 2, at.Add(150*time.Minute), models.ReservationSourceWeb); err != nil {
		t.Fatalf("booking right after the chosen duration: %v", err)
	}
	// A short new booking right before an existing one must not overlap it.
	slots, _ := mem.ListVenueSchedule("venue-1")
	for _, slot := range slots {
		if slot.ID == res.ID && !slot.EndsAt.Equal(at.Add(150*time.Minute)) {
			t.Fatalf("schedule end = %v, want %v", slot.EndsAt, at.Add(150*time.Minute))
		}
	}
}
