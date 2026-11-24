package store

import (
	"path/filepath"
	"testing"
	"time"

	"github.com/seatiko/api/internal/models"
)

func kinds(mem *MemoryStore, userID string) []string {
	list, _ := mem.ListNotifications(userID, false, 0)
	out := make([]string, len(list))
	for i, n := range list {
		out[i] = n.Kind
	}
	return out
}

func hasKind(mem *MemoryStore, userID, kind string) bool {
	for _, k := range kinds(mem, userID) {
		if k == kind {
			return true
		}
	}
	return false
}

func TestPreorderNotifiesVenueStaffLive(t *testing.T) {
	mem := NewMemory()
	guestID, resID := preorderFixture(t, mem, 3*time.Hour)

	feed, closeFeed := mem.SubscribeNotifications(demoStaffID)
	defer closeFeed()

	if _, err := mem.SavePreorder(guestID, resID, []OrderItemInput{item("m1", 1)}); err != nil {
		t.Fatal(err)
	}
	select {
	case n := <-feed:
		if n.Kind != models.NotifyPreorderCreated || n.ReservationID != resID || n.VenueID != "venue-1" || n.VenueName.RU == "" {
			t.Fatalf("live notification %+v", n)
		}
	case <-time.After(time.Second):
		t.Fatal("staff did not get the new preorder live")
	}
	for _, who := range []string{demoStaffID, demoOwnerID} {
		if !hasKind(mem, who, models.NotifyPreorderCreated) {
			t.Fatalf("%s has no PREORDER_CREATED: %v", who, kinds(mem, who))
		}
	}
	if len(kinds(mem, guestID)) != 0 {
		t.Fatalf("guest notified about their own preorder: %v", kinds(mem, guestID))
	}

	if _, err := mem.SavePreorder(guestID, resID, []OrderItemInput{item("m2", 1)}); err != nil {
		t.Fatal(err)
	}
	if _, err := mem.CancelReservation(guestID, resID); err != nil {
		t.Fatal(err)
	}
	got := kinds(mem, demoStaffID)
	if len(got) != 3 || got[0] != models.NotifyPreorderCancelled || got[1] != models.NotifyPreorderUpdated {
		t.Fatalf("staff feed = %v, want cancelled, updated, created", got)
	}
}

func TestKitchenSchedulerStartsDuePreorders(t *testing.T) {
	mem := NewMemory()
	guestID, resID := preorderFixture(t, mem, 3*time.Hour)
	o, err := mem.SavePreorder(guestID, resID, []OrderItemInput{item("m1", 1)})
	if err != nil {
		t.Fatal(err)
	}
	if n := mem.StartPreorderKitchen(o.KitchenAt.Add(-time.Minute)); n != 0 {
		t.Fatalf("started %d preorders before kitchen_at", n)
	}
	if n := mem.StartPreorderKitchen(o.KitchenAt.Add(time.Second)); n != 1 {
		t.Fatalf("started %d preorders at kitchen_at, want 1", n)
	}
	if got, _ := mem.GetOrder(o.ID); got.Status != models.OrderPreparing {
		t.Fatalf("status %s, want PREPARING", got.Status)
	}
	if !hasKind(mem, guestID, models.NotifyPreorderPreparing) || !hasKind(mem, demoStaffID, models.NotifyPreorderPreparing) {
		t.Fatal("guest and kitchen must hear that the preorder went to the kitchen")
	}
	if n := mem.StartPreorderKitchen(o.KitchenAt.Add(time.Hour)); n != 0 {
		t.Fatal("a preorder was started twice")
	}
}

func TestAdultEventsNotifyGuest(t *testing.T) {
	mem := NewMemory()
	guestID, resID, _ := adultFixture(t, mem, models.ReservationCheckedIn, time.Now().Add(-time.Hour))
	if _, err := mem.GrantAdultPreorder(demoStaffID, resID, idChecked); err != nil {
		t.Fatal(err)
	}
	mem.mu.Lock()
	mem.reservations["next-res"] = models.Reservation{
		ID: "next-res", UserID: guestID, VenueID: "venue-1", TableID: "t2", Guests: 2,
		ReservedFor: time.Now().UTC().Add(5 * time.Hour), Status: models.ReservationConfirmed,
	}
	v := mem.venues["venue-1"]
	v.AllowPreorder = true
	mem.venues["venue-1"] = v
	mem.mu.Unlock()
	if _, err := mem.SavePreorder(guestID, "next-res", []OrderItemInput{item("m1", 1), item("m-v1-13", 1)}); err != nil {
		t.Fatal(err)
	}
	if _, err := mem.RevokeAdultPreorder(demoOwnerID, "venue-1", guestID, ""); err != nil {
		t.Fatal(err)
	}
	for _, kind := range []string{models.NotifyAdultGranted, models.NotifyAdultRevoked, models.NotifyPreorderAdultRemoved} {
		if !hasKind(mem, guestID, kind) {
			t.Fatalf("guest misses %s: %v", kind, kinds(mem, guestID))
		}
	}
}

func TestMarkNotificationsReadAndRestart(t *testing.T) {
	path := filepath.Join(t.TempDir(), "state.json")
	mem, err := NewPersistent(path)
	if err != nil {
		t.Fatal(err)
	}
	guestID, resID := preorderFixture(t, mem, 3*time.Hour)
	if _, err := mem.SavePreorder(guestID, resID, []OrderItemInput{item("m1", 1)}); err != nil {
		t.Fatal(err)
	}
	if _, err := mem.SavePreorder(guestID, resID, []OrderItemInput{item("m2", 1)}); err != nil {
		t.Fatal(err)
	}
	list, unread := mem.ListNotifications(demoStaffID, false, 0)
	if unread != 2 {
		t.Fatalf("unread = %d, want 2", unread)
	}
	if n := mem.MarkNotificationsRead(demoStaffID, []string{list[0].ID}); n != 1 {
		t.Fatalf("marked %d", n)
	}
	if _, unread := mem.ListNotifications(demoStaffID, true, 0); unread != 1 {
		t.Fatalf("unread after marking one = %d", unread)
	}
	if n := mem.MarkNotificationsRead(guestID, nil); n != 0 {
		t.Fatal("marked someone else's notifications")
	}

	again, err := NewPersistent(path)
	if err != nil {
		t.Fatal(err)
	}
	if _, unread := again.ListNotifications(demoStaffID, false, 0); unread != 1 {
		t.Fatalf("after restart unread = %d, want 1", unread)
	}
}

func TestNotificationsTrimmedPerUser(t *testing.T) {
	mem := NewMemory()
	mem.mu.Lock()
	for i := 0; i < maxNotificationsPerUser+25; i++ {
		mem.notifyLocked(models.NotifyPreorderUpdated, []string{"u1"}, "venue-1", "", "", nil)
	}
	mem.notifyLocked(models.NotifyPreorderUpdated, []string{"u2"}, "venue-1", "", "", nil)
	mem.flushPushLocked()
	mem.mu.Unlock()
	if list, _ := mem.ListNotifications("u1", false, maxNotificationsPerUser); len(list) != maxNotificationsPerUser {
		t.Fatalf("u1 keeps %d, want %d", len(list), maxNotificationsPerUser)
	}
	if list, _ := mem.ListNotifications("u2", false, 0); len(list) != 1 {
		t.Fatal("trimming one user dropped another user's notification")
	}
}
