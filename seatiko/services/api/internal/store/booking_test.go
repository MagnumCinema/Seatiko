package store

import (
	"testing"
	"time"

	"github.com/seatiko/api/internal/models"
)

func TestCreateReservationAndQRSession(t *testing.T) {
	mem := NewMemory()
	guest := registerTestUser(t, mem, "book-guest@example.com", models.RoleGuest)

	venues := mem.ListVenues("city-balti")
	if len(venues) == 0 {
		t.Fatal("expected seeded venues")
	}
	reservedFor := time.Now().UTC().Add(2 * time.Hour)
	// Venue order comes from a map; pick any free table that has no booking at that time.
	var venue models.Venue
	var free *models.Table
	for _, v := range venues {
		tables := mem.ListTables(v.ID)
		for i := range tables {
			mem.mu.RLock()
			busy := mem.tableBusyAtLocked(tables[i], reservedFor, DefaultVisitDurationMin*time.Minute, time.Now().UTC())
			mem.mu.RUnlock()
			if tables[i].Status == models.TableFree && !busy {
				venue, free = v, &tables[i]
				break
			}
		}
		if free != nil {
			break
		}
	}
	if free == nil {
		t.Fatal("expected a free table")
	}

	reservation, err := mem.CreateReservation(guest.ID, venue.ID, free.ID, 2, reservedFor, models.ReservationSourceWeb)
	if err != nil {
		t.Fatalf("create reservation: %v", err)
	}
	if reservation.Status != models.ReservationConfirmed {
		t.Fatalf("status = %s", reservation.Status)
	}

	table, err := mem.GetTable(free.ID)
	if err != nil {
		t.Fatalf("get table: %v", err)
	}
	if table.Status != models.TableReserved {
		t.Fatalf("table status = %s", table.Status)
	}

	confirmed, err := mem.ConfirmArrival(guest.ID, reservation.ID, nil)
	if err != nil {
		t.Fatalf("confirm arrival: %v", err)
	}
	if confirmed.Status != models.ReservationCheckedIn {
		t.Fatalf("confirmed status = %s", confirmed.Status)
	}

	session, err := mem.ScanQR(guest.ID, venue.ID, free.ID, "demo")
	if err != nil {
		t.Fatalf("scan qr for reserved table: %v", err)
	}
	if session.Status != models.SessionActive {
		t.Fatalf("session status = %s", session.Status)
	}
	occupied, err := mem.GetTable(free.ID)
	if err != nil {
		t.Fatalf("occupied table: %v", err)
	}
	if occupied.Status != models.TableOccupied {
		t.Fatalf("expected OCCUPIED, got %s", occupied.Status)
	}

	watch, err := mem.CreateTableWatch(guest.ID, venue.ID, free.ID)
	if err != nil {
		t.Fatalf("watch table: %v", err)
	}
	if watch.TableID != free.ID {
		t.Fatalf("watch table id = %s", watch.TableID)
	}
}
