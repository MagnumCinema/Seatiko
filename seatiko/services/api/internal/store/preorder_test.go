package store

import (
	"testing"
	"time"

	"github.com/seatiko/api/internal/models"
)

// preorderFixture: a guest with a confirmed booking at venue-1 in 3 hours; preorder on.
func preorderFixture(t *testing.T, mem *MemoryStore, in time.Duration) (guestID, resID string) {
	t.Helper()
	guestID, resID = "pre-guest", "pre-res"
	mem.mu.Lock()
	defer mem.mu.Unlock()
	mem.users[guestID] = models.User{ID: guestID, Email: "pre@example.com", Role: models.RoleGuest}
	mem.reservations[resID] = models.Reservation{
		ID: resID, UserID: guestID, VenueID: "venue-1", TableID: "t1", Guests: 2,
		ReservedFor: time.Now().UTC().Add(in), Status: models.ReservationConfirmed,
	}
	v := mem.venues["venue-1"]
	v.AllowPreorder = true
	mem.venues["venue-1"] = v
	return guestID, resID
}

func item(id string, qty int) OrderItemInput { return OrderItemInput{MenuItemID: id, Qty: qty} }

func TestSavePreorderFixesPricesAndShowsOnReservation(t *testing.T) {
	mem := NewMemory()
	guestID, resID := preorderFixture(t, mem, 3*time.Hour)

	o, err := mem.SavePreorder(guestID, resID, []OrderItemInput{item("m1", 2), item("m2", 1), item("m1", 1)})
	if err != nil {
		t.Fatalf("save preorder: %v", err)
	}
	m1, m2 := mem.menuItems["m1"], mem.menuItems["m2"]
	if !o.Preorder || o.ReservationID != resID || o.Status != models.OrderSubmitted || len(o.Items) != 2 ||
		o.Items[0].Qty != 3 || o.Total != 3*m1.Price+m2.Price || o.KitchenAt == nil {
		t.Fatalf("unexpected preorder %+v", o)
	}
	if want := mem.reservations[resID].ReservedFor.Add(-DefaultPreorderLeadMin * time.Minute); !o.KitchenAt.Equal(want) {
		t.Fatalf("kitchen_at = %s, want %s", o.KitchenAt, want)
	}

	// Menu price change later does not touch the preorder; replacing keeps one order.
	mem.mu.Lock()
	m1.Price += 100
	mem.menuItems["m1"] = m1
	mem.mu.Unlock()
	got, _ := mem.GetPreorder(guestID, resID)
	if got.Total != o.Total {
		t.Fatalf("total changed with the menu price: %d → %d", o.Total, got.Total)
	}
	again, err := mem.SavePreorder(guestID, resID, []OrderItemInput{item("m2", 2)})
	if err != nil || again.ID != o.ID || again.Total != 2*m2.Price {
		t.Fatalf("replace preorder: %v %+v", err, again)
	}

	// Guest, staff and owner listings carry it.
	if list := mem.ListReservations(guestID); len(list) != 1 || list[0].Preorder == nil || list[0].Preorder.ID != o.ID {
		t.Fatal("guest reservation list misses the preorder")
	}
	staffList, _ := mem.ListVenueReservationsStaff("venue-1")
	found := false
	for _, r := range staffList {
		found = found || (r.ID == resID && r.Preorder != nil)
	}
	if !found {
		t.Fatal("staff reservation list misses the preorder")
	}
	if _, err := mem.GetPreorder(demoStaffID, resID); err != nil {
		t.Fatalf("staff read preorder: %v", err)
	}
	if _, err := mem.GetPreorder("stranger", resID); err != ErrForbidden {
		t.Fatalf("stranger read err = %v", err)
	}
}

func TestSavePreorderRules(t *testing.T) {
	cases := []struct {
		name    string
		in      time.Duration
		setup   func(*MemoryStore)
		items   []OrderItemInput
		user    string
		wantErr error
	}{
		{"empty", 3 * time.Hour, nil, nil, "", ErrBadRequest},
		{"zero qty", 3 * time.Hour, nil, []OrderItemInput{item("m1", 0)}, "", ErrBadRequest},
		{"too many", 3 * time.Hour, nil, []OrderItemInput{item("m1", 21)}, "", ErrBadRequest},
		{"other venue dish", 3 * time.Hour, nil, []OrderItemInput{item("m9", 1)}, "", ErrNotFound},
		{"stopped dish", 3 * time.Hour, func(m *MemoryStore) { it := m.menuItems["m1"]; it.Stopped = true; m.menuItems["m1"] = it }, []OrderItemInput{item("m1", 1)}, "", ErrItemUnavailable},
		{"wine without 18+", 3 * time.Hour, nil, []OrderItemInput{item("m-v1-13", 1)}, "", ErrAgeVerificationRequired},
		{"venue switched preorder off", 3 * time.Hour, func(m *MemoryStore) { v := m.venues["venue-1"]; v.AllowPreorder = false; m.venues["venue-1"] = v }, []OrderItemInput{item("m1", 1)}, "", ErrPreorderDisabled},
		{"kitchen already started", 20 * time.Minute, nil, []OrderItemInput{item("m1", 1)}, "", ErrPreorderClosed},
		{"checked in", 3 * time.Hour, func(m *MemoryStore) {
			r := m.reservations["pre-res"]
			r.Status = models.ReservationCheckedIn
			m.reservations["pre-res"] = r
		}, []OrderItemInput{item("m1", 1)}, "", ErrPreorderClosed},
		{"someone else's booking", 3 * time.Hour, nil, []OrderItemInput{item("m1", 1)}, demoStaffID, ErrForbidden},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			mem := NewMemory()
			guestID, resID := preorderFixture(t, mem, tc.in)
			if tc.setup != nil {
				mem.mu.Lock()
				tc.setup(mem)
				mem.mu.Unlock()
			}
			user := guestID
			if tc.user != "" {
				user = tc.user
			}
			if _, err := mem.SavePreorder(user, resID, tc.items); err != tc.wantErr {
				t.Fatalf("err = %v, want %v", err, tc.wantErr)
			}
		})
	}
}

func TestPreorderCancelAndReservationCancel(t *testing.T) {
	mem := NewMemory()
	guestID, resID := preorderFixture(t, mem, 3*time.Hour)
	if _, err := mem.SavePreorder(guestID, resID, []OrderItemInput{item("m1", 1)}); err != nil {
		t.Fatal(err)
	}
	if o, err := mem.CancelPreorder(guestID, resID); err != nil || o.Status != models.OrderCancelled {
		t.Fatalf("cancel preorder: %v %+v", err, o)
	}
	if _, err := mem.GetPreorder(guestID, resID); err != ErrNotFound {
		t.Fatalf("cancelled preorder still active: %v", err)
	}

	o, err := mem.SavePreorder(guestID, resID, []OrderItemInput{item("m1", 1)})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := mem.CancelReservation(guestID, resID); err != nil {
		t.Fatal(err)
	}
	if got, _ := mem.GetOrder(o.ID); got.Status != models.OrderCancelled {
		t.Fatalf("preorder of a cancelled reservation is %s", got.Status)
	}
}

func TestAdultPreorderNeedsIDCheckBeforeServing(t *testing.T) {
	mem := NewMemory()
	guestID, resID := preorderFixture(t, mem, 3*time.Hour)
	mem.mu.Lock()
	g := mem.users[guestID]
	g.AdultPreorderAllowed = true
	mem.users[guestID] = g
	mem.mu.Unlock()

	o, err := mem.SavePreorder(guestID, resID, []OrderItemInput{item("m1", 1), item("m-v1-13", 2)})
	if err != nil {
		t.Fatalf("preorder with wine after 18+: %v", err)
	}
	if o.Items[1].AgeCheck != models.AgeCheckPending || !o.Items[1].ContainsAlcohol {
		t.Fatalf("wine line %+v, want PENDING_AGE_CHECK", o.Items[1])
	}
	if _, err := mem.UpdateOrderStatus(o.ID, models.OrderServed); err != ErrAgeCheckPending {
		t.Fatalf("serve before ID check err = %v", err)
	}
	if _, err := mem.PayOrder(guestID, o.ID, "app"); err != ErrAgeCheckPending {
		t.Fatalf("pay before ID check err = %v", err)
	}
	if _, err := mem.StaffConfirmPreorderAgeCheck(demoStaffID, o.ID, false, true); err != ErrIDDocumentRequired {
		t.Fatalf("approve without ID err = %v", err)
	}
	ok, err := mem.StaffConfirmPreorderAgeCheck(demoStaffID, o.ID, true, true)
	if err != nil || ok.Items[1].AgeCheck != models.AgeCheckConfirmed {
		t.Fatalf("approve: %v %+v", err, ok.Items)
	}
	if _, err := mem.UpdateOrderStatus(o.ID, models.OrderServed); err != nil {
		t.Fatalf("serve after ID check: %v", err)
	}
}

func TestRefusedAgeCheckDropsAdultItems(t *testing.T) {
	mem := NewMemory()
	guestID, resID := preorderFixture(t, mem, 3*time.Hour)
	mem.mu.Lock()
	g := mem.users[guestID]
	g.AdultPreorderAllowed = true
	mem.users[guestID] = g
	mem.mu.Unlock()
	o, _ := mem.SavePreorder(guestID, resID, []OrderItemInput{item("m1", 1), item("m-v1-13", 1)})

	refused, err := mem.StaffConfirmPreorderAgeCheck(demoStaffID, o.ID, false, false)
	if err != nil || len(refused.Items) != 1 || refused.Items[0].MenuItemID != "m1" || refused.Total != mem.menuItems["m1"].Price {
		t.Fatalf("refuse: %v %+v", err, refused)
	}
}

func TestRevokingAdultRemovesItemsFromPreorder(t *testing.T) {
	mem := NewMemory()
	guestID, resID, _ := adultFixture(t, mem, models.ReservationCheckedIn, time.Now().Add(-time.Hour))
	if _, err := mem.GrantAdultPreorder(demoStaffID, resID, idChecked); err != nil {
		t.Fatal(err)
	}
	// A new booking with a preorder that includes wine.
	mem.mu.Lock()
	mem.reservations["next-res"] = models.Reservation{
		ID: "next-res", UserID: guestID, VenueID: "venue-1", TableID: "t2", Guests: 2,
		ReservedFor: time.Now().UTC().Add(5 * time.Hour), Status: models.ReservationConfirmed,
	}
	v := mem.venues["venue-1"]
	v.AllowPreorder = true
	mem.venues["venue-1"] = v
	mem.mu.Unlock()
	o, err := mem.SavePreorder(guestID, "next-res", []OrderItemInput{item("m1", 1), item("m-v1-13", 1)})
	if err != nil {
		t.Fatal(err)
	}

	if _, err := mem.RevokeAdultPreorder(demoOwnerID, "venue-1", guestID, "fake ID"); err != nil {
		t.Fatal(err)
	}
	got, _ := mem.GetOrder(o.ID)
	if len(got.Items) != 1 || got.Items[0].MenuItemID != "m1" || got.AdultItemsRemovedAt == nil {
		t.Fatalf("after revoke: %+v", got)
	}
}

func TestPreorderLeadMinRule(t *testing.T) {
	mem := NewMemory()
	lead := 200
	if _, err := mem.UpdateVenueBookingRules(demoOwnerID, "venue-1", BookingRulesInput{PreorderLeadMin: &lead}); err != ErrBadRequest {
		t.Fatalf("lead 200 err = %v, want ErrBadRequest", err)
	}
	lead = 90
	if _, err := mem.UpdateVenueBookingRules(demoOwnerID, "venue-1", BookingRulesInput{PreorderLeadMin: &lead}); err != nil {
		t.Fatal(err)
	}
	guestID, resID := preorderFixture(t, mem, time.Hour) // kitchen at −90 min: already closed
	if _, err := mem.SavePreorder(guestID, resID, []OrderItemInput{item("m1", 1)}); err != ErrPreorderClosed {
		t.Fatalf("err = %v, want ErrPreorderClosed with a 90 min lead", err)
	}
}
