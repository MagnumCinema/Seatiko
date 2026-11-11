package store

import (
	"testing"
	"time"

	"github.com/seatiko/api/internal/models"
)

func TestWaitlistQueueFlow(t *testing.T) {
	mem := NewMemory()
	first := registerTestUser(t, mem, "queue-first@example.com", models.RoleGuest)
	second := registerTestUser(t, mem, "queue-second@example.com", models.RoleGuest)

	entryOne, err := mem.JoinWaitlist(first.ID, WaitlistInput{VenueID: "venue-1", Guests: 2, Source: "WEB"})
	if err != nil {
		t.Fatalf("join first: %v", err)
	}
	if entryOne.Position != 1 {
		t.Fatalf("expected position 1, got %d", entryOne.Position)
	}

	entryTwo, err := mem.JoinWaitlist(second.ID, WaitlistInput{VenueID: "venue-1", Guests: 4})
	if err != nil {
		t.Fatalf("join second: %v", err)
	}
	if entryTwo.Position != 2 {
		t.Fatalf("expected position 2, got %d", entryTwo.Position)
	}

	if _, err := mem.JoinWaitlist(first.ID, WaitlistInput{VenueID: "venue-1", Guests: 2}); err != ErrConflict {
		t.Fatalf("expected conflict on duplicate join, got %v", err)
	}

	summary, err := mem.WaitlistSummary("venue-1")
	if err != nil {
		t.Fatalf("summary: %v", err)
	}
	if summary.Waiting != 2 {
		t.Fatalf("expected 2 waiting, got %d", summary.Waiting)
	}

	if _, err := mem.LeaveWaitlist(second.ID, entryOne.ID); err != ErrForbidden {
		t.Fatalf("expected forbidden when leaving someone else's spot, got %v", err)
	}

	mine := mem.ListMyWaitlist(first.ID)
	if len(mine) != 1 || mine[0].ID != entryOne.ID {
		t.Fatalf("expected one own entry, got %d", len(mine))
	}

	if _, err := mem.LeaveWaitlist(first.ID, entryOne.ID); err != nil {
		t.Fatalf("leave: %v", err)
	}
	promoted, err := mem.GetWaitlistEntry(entryTwo.ID)
	if err != nil {
		t.Fatalf("get entry: %v", err)
	}
	if promoted.Position != 1 {
		t.Fatalf("expected second guest promoted to 1, got %d", promoted.Position)
	}
}

func TestWaitlistNotifyHoldsTableAndSeatOccupies(t *testing.T) {
	mem := NewMemory()
	guest := registerTestUser(t, mem, "queue-seat@example.com", models.RoleGuest)

	entry, err := mem.JoinWaitlist(guest.ID, WaitlistInput{VenueID: "venue-1", Guests: 2})
	if err != nil {
		t.Fatalf("join: %v", err)
	}

	var freeTable models.Table
	for _, table := range mem.ListTables("venue-1") {
		if table.Status == models.TableFree {
			freeTable = table
			break
		}
	}
	if freeTable.ID == "" {
		t.Fatal("no free table in seed data")
	}

	notified, err := mem.NotifyWaitlistEntry(entry.ID, freeTable.ID)
	if err != nil {
		t.Fatalf("notify: %v", err)
	}
	if notified.Status != models.WaitlistReady || notified.NotifiedAt == nil {
		t.Fatalf("expected READY with timestamp, got %s", notified.Status)
	}
	if tableStatus(t, mem, freeTable.ID) != models.TableReserved {
		t.Fatal("expected held table to be RESERVED")
	}

	seated, err := mem.SeatWaitlistEntry(entry.ID, "")
	if err != nil {
		t.Fatalf("seat: %v", err)
	}
	if seated.Status != models.WaitlistSeated || seated.TableNumber != freeTable.Number {
		t.Fatalf("expected SEATED at table %d, got %s/%d", freeTable.Number, seated.Status, seated.TableNumber)
	}
	if tableStatus(t, mem, freeTable.ID) != models.TableOccupied {
		t.Fatal("expected seated table to be OCCUPIED")
	}
}

func TestWaitlistCloseReleasesHeldTable(t *testing.T) {
	mem := NewMemory()
	guest := registerTestUser(t, mem, "queue-close@example.com", models.RoleGuest)

	entry, err := mem.JoinWaitlist(guest.ID, WaitlistInput{VenueID: "venue-1", Guests: 2})
	if err != nil {
		t.Fatalf("join: %v", err)
	}
	var freeTable models.Table
	for _, table := range mem.ListTables("venue-1") {
		if table.Status == models.TableFree {
			freeTable = table
			break
		}
	}
	if _, err := mem.NotifyWaitlistEntry(entry.ID, freeTable.ID); err != nil {
		t.Fatalf("notify: %v", err)
	}
	if _, err := mem.CloseWaitlistEntry(entry.ID, models.WaitlistExpired); err != nil {
		t.Fatalf("close: %v", err)
	}
	if tableStatus(t, mem, freeTable.ID) != models.TableFree {
		t.Fatal("expected released table to be FREE again")
	}
}

func TestWaitlistCannotSeatOverBookedTable(t *testing.T) {
	mem := NewMemory()
	booker := registerTestUser(t, mem, "queue-booker@example.com", models.RoleGuest)
	walkIn, err := mem.JoinWaitlist("", WaitlistInput{
		VenueID:   "venue-1",
		GuestName: "Walk-in",
		Guests:    2,
		Source:    models.WaitlistSourceHost,
	})
	if err != nil {
		t.Fatalf("walk-in: %v", err)
	}

	var freeTable models.Table
	for _, table := range mem.ListTables("venue-1") {
		if table.Status == models.TableFree {
			freeTable = table
			break
		}
	}
	if _, err := mem.CreateReservation(
		booker.ID,
		"venue-1",
		freeTable.ID,
		2,
		time.Now().UTC().Add(2*time.Hour),
	); err != nil {
		t.Fatalf("reserve: %v", err)
	}

	if _, err := mem.SeatWaitlistEntry(walkIn.ID, freeTable.ID); err != ErrTableNotFree {
		t.Fatalf("expected table_not_free for a booked table, got %v", err)
	}
	if _, err := mem.NotifyWaitlistEntry(walkIn.ID, freeTable.ID); err != ErrTableNotFree {
		t.Fatalf("expected table_not_free when holding a booked table, got %v", err)
	}
}

func TestWaitlistWalkInWithoutAccount(t *testing.T) {
	mem := NewMemory()
	entry, err := mem.JoinWaitlist("", WaitlistInput{
		VenueID:   "venue-1",
		GuestName: "Ion",
		Guests:    3,
		Source:    models.WaitlistSourceHost,
	})
	if err != nil {
		t.Fatalf("walk-in: %v", err)
	}
	if entry.Source != models.WaitlistSourceHost || entry.GuestName != "Ion" {
		t.Fatalf("unexpected walk-in entry: %+v", entry)
	}
	if _, err := mem.JoinWaitlist("", WaitlistInput{VenueID: "venue-1", Guests: 2}); err != ErrBadRequest {
		t.Fatalf("expected bad request without a name, got %v", err)
	}

	queue, err := mem.ListVenueWaitlist("venue-1")
	if err != nil {
		t.Fatalf("list venue waitlist: %v", err)
	}
	if len(queue) != 1 {
		t.Fatalf("expected 1 queued guest, got %d", len(queue))
	}
}

func tableStatus(t *testing.T, mem *MemoryStore, tableID string) models.TableStatus {
	t.Helper()
	for _, table := range mem.ListTables("venue-1") {
		if table.ID == tableID {
			return table.Status
		}
	}
	t.Fatalf("table %s not found", tableID)
	return ""
}
