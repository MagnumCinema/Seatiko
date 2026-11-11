package store

import (
	"errors"
	"testing"
	"time"

	"github.com/seatiko/api/internal/models"
	"github.com/seatiko/api/internal/qr"
)

func publishTestVenue(t *testing.T, mem *MemoryStore, ownerEmail string) (owner models.User, app models.VenueApplication, venueID string) {
	t.Helper()
	owner = registerTestUser(t, mem, ownerEmail, models.RoleRestaurant)
	application, err := mem.CreateApplication(owner.ID)
	if err != nil {
		t.Fatalf("create application: %v", err)
	}
	name := models.LocalizedString{RU: "Ops Rest", EN: "Ops Rest", RO: "Ops Rest"}
	description := models.LocalizedString{RU: "Desc", EN: "Desc", RO: "Desc"}
	address := models.LocalizedString{RU: "Addr", EN: "Addr", RO: "Addr"}
	cuisine := []string{"moldovan"}
	phone := "+37360000001"
	email := "ops@example.com"
	hours := "10-22"
	lat, lng := 47.76, 27.92
	priceLevel, averageCheck := 2, 300
	application, err = mem.UpdateApplication(owner.ID, application.ID, ApplicationUpdate{
		Name: &name, Description: &description, Address: &address, Cuisine: &cuisine,
		Phone: &phone, Email: &email, HoursText: &hours, Lat: &lat, Lng: &lng,
		PriceLevel: &priceLevel, AverageCheck: &averageCheck,
	})
	if err != nil {
		t.Fatalf("update application: %v", err)
	}
	if _, err = mem.AddPhoto(owner.ID, application.ID, "/uploads/ops.jpg"); err != nil {
		t.Fatalf("add photo: %v", err)
	}
	if _, err = mem.SubmitApplication(owner.ID, application.ID); err != nil {
		t.Fatalf("submit: %v", err)
	}
	if _, err = mem.AdminSetStatus("user-admin", application.ID, models.AppUnderReview, ""); err != nil {
		t.Fatalf("review: %v", err)
	}
	if _, err = mem.AdminSetStatus("user-admin", application.ID, models.AppApproved, ""); err != nil {
		t.Fatalf("approve: %v", err)
	}
	application, err = mem.PublishApplication("user-admin", application.ID)
	if err != nil {
		t.Fatalf("publish: %v", err)
	}
	if application.VenueID == nil {
		t.Fatal("missing venue id")
	}
	return owner, application, *application.VenueID
}

func TestReservationAndQRSession(t *testing.T) {
	mem := NewMemory()
	owner, _, venueID := publishTestVenue(t, mem, "qr-owner@example.com")
	guest := registerTestUser(t, mem, "qr-guest@example.com", models.RoleGuest)

	tables, err := mem.EnsureTableQRTokens(owner.ID, venueID)
	if err != nil {
		t.Fatalf("ensure qr: %v", err)
	}
	if len(tables) == 0 || tables[0].QRToken == "" {
		t.Fatalf("expected qr tokens, got %#v", tables)
	}
	table := tables[0]

	if _, err := mem.ScanQR(guest.ID, venueID, table.ID, "wrong-token"); !errors.Is(err, ErrInvalidQR) {
		t.Fatalf("wrong token error = %v, want ErrInvalidQR", err)
	}

	sess, err := mem.ScanQR(guest.ID, venueID, table.ID, table.QRToken)
	if err != nil {
		t.Fatalf("scan with stored token: %v", err)
	}
	if sess.Status != models.SessionActive {
		t.Fatalf("session status = %s", sess.Status)
	}
	if _, err := mem.CloseSession(guest.ID, sess.ID); err != nil {
		t.Fatalf("close session: %v", err)
	}

	legacy := qr.LegacyToken(venueID, table.ID)
	if _, err := mem.ScanQR(guest.ID, venueID, table.ID, legacy); err != nil {
		t.Fatalf("scan with legacy token: %v", err)
	}

	seededGuest := registerTestUser(t, mem, "seed-guest@example.com", models.RoleGuest)
	seeded, err := mem.ScanQR(seededGuest.ID, "venue-1", "t1", "demo")
	if err != nil {
		t.Fatalf("compat scan: %v", err)
	}
	if seeded.TableID != "t1" {
		t.Fatalf("compat session table = %s", seeded.TableID)
	}
}

func TestOwnerFloorMenuQR(t *testing.T) {
	mem := NewMemory()
	owner, _, venueID := publishTestVenue(t, mem, "floor-owner@example.com")

	layout := []TableLayoutInput{
		{Number: 1, Seats: 2, X: 0.2, Y: 0.2},
		{Number: 2, Seats: 4, X: 0.5, Y: 0.2},
		{Number: 3, Seats: 6, X: 0.8, Y: 0.5},
	}
	tables, err := mem.ReplaceTablesLayout(owner.ID, venueID, layout)
	if err != nil {
		t.Fatalf("replace layout: %v", err)
	}
	if len(tables) != 3 {
		t.Fatalf("tables = %d, want 3", len(tables))
	}

	item, err := mem.UpsertMenuItem(owner.ID, venueID, MenuItemInput{
		Name:  models.LocalizedString{RU: "Салат", EN: "Salad", RO: "Salată"},
		Price: 55,
	})
	if err != nil {
		t.Fatalf("create menu: %v", err)
	}
	if _, err = mem.SetMenuStopped(owner.ID, venueID, item.ID, true); err != nil {
		t.Fatalf("stop menu: %v", err)
	}
	public, err := mem.ListMenu(venueID)
	if err != nil {
		t.Fatalf("public menu: %v", err)
	}
	for _, m := range public {
		if m.ID == item.ID {
			t.Fatal("stopped item should be hidden from public menu")
		}
	}
	ownerMenu, err := mem.ListMenuForOwner(owner.ID, venueID)
	if err != nil {
		t.Fatalf("owner menu: %v", err)
	}
	found := false
	for _, m := range ownerMenu {
		if m.ID == item.ID && m.Stopped {
			found = true
		}
	}
	if !found {
		t.Fatal("owner menu should include stopped item")
	}
	if err = mem.DeleteMenuItem(owner.ID, venueID, item.ID); err != nil {
		t.Fatalf("delete menu: %v", err)
	}

	regenerated, err := mem.RegenerateTableQRTokens(owner.ID, venueID)
	if err != nil {
		t.Fatalf("regenerate qr: %v", err)
	}
	if regenerated[0].QRToken == "" {
		t.Fatal("regenerated token empty")
	}
}

func TestStaffOrderStatusAndWaiterComplete(t *testing.T) {
	mem := NewMemory()
	owner, _, venueID := publishTestVenue(t, mem, "staff-owner@example.com")
	guest := registerTestUser(t, mem, "staff-guest@example.com", models.RoleGuest)
	waiter := registerTestUser(t, mem, "waiter@example.com", models.RoleGuest)

	invite, err := mem.InviteStaff(owner.ID, venueID, waiter.Email)
	if err != nil {
		t.Fatalf("invite staff: %v", err)
	}
	if _, err = mem.AcceptStaffInvite(waiter.ID, invite.ID); err != nil {
		t.Fatalf("accept invite: %v", err)
	}
	updatedWaiter, err := mem.GetUser(waiter.ID)
	if err != nil || updatedWaiter.Role != models.RoleStaff {
		t.Fatalf("waiter role = %#v, %v", updatedWaiter, err)
	}
	if err = mem.RequireStaffOrOwner(waiter.ID, venueID); err != nil {
		t.Fatalf("staff access: %v", err)
	}

	tables, err := mem.EnsureTableQRTokens(owner.ID, venueID)
	if err != nil {
		t.Fatalf("qr: %v", err)
	}
	sess, err := mem.ScanQR(guest.ID, venueID, tables[0].ID, tables[0].QRToken)
	if err != nil {
		t.Fatalf("scan: %v", err)
	}

	menuItem, err := mem.UpsertMenuItem(owner.ID, venueID, MenuItemInput{
		Name:  models.LocalizedString{EN: "Soup"},
		Price: 40,
	})
	if err != nil {
		t.Fatalf("menu: %v", err)
	}
	order, err := mem.CreateOrder(sess.ID, guest.ID, []OrderItemInput{{MenuItemID: menuItem.ID, Qty: 1}})
	if err != nil {
		t.Fatalf("order: %v", err)
	}
	order, err = mem.UpdateOrderStatus(order.ID, models.OrderPreparing)
	if err != nil || order.Status != models.OrderPreparing {
		t.Fatalf("staff order update = %#v, %v", order, err)
	}

	call, err := mem.CreateWaiterCall(sess.ID, models.WaiterBill)
	if err != nil {
		t.Fatalf("waiter call: %v", err)
	}
	if _, err = mem.AcceptWaiterCall(call.ID); err != nil {
		t.Fatalf("accept call: %v", err)
	}
	done, err := mem.CompleteWaiterCall(call.ID)
	if err != nil || done.Status != models.WaiterDone {
		t.Fatalf("complete call = %#v, %v", done, err)
	}

	orders, err := mem.ListVenueOrders(venueID)
	if err != nil || len(orders) != 1 {
		t.Fatalf("list venue orders = %#v, %v", orders, err)
	}
}

func TestBookingRulesAndAnalytics(t *testing.T) {
	mem := NewMemory()
	owner, _, venueID := publishTestVenue(t, mem, "rules-owner@example.com")
	guest := registerTestUser(t, mem, "rules-guest@example.com", models.RoleGuest)

	interval, hold := 45, 20
	allow := false
	sessionStart, release := 25, 12
	venue, err := mem.UpdateVenueBookingRules(owner.ID, venueID, BookingRulesInput{
		BookingIntervalMin: &interval, HoldMinutes: &hold, AllowPreorder: &allow,
		SessionStartBeforeMin: &sessionStart, ReleaseBeforeMin: &release,
	})
	if err != nil {
		t.Fatalf("update rules: %v", err)
	}
	if venue.BookingIntervalMin != 45 || venue.HoldMinutes != 20 || venue.AllowPreorder ||
		venue.SessionStartBeforeMin != 25 || venue.ReleaseBeforeMin != 12 {
		t.Fatalf("unexpected booking rules: %#v", venue)
	}

	tables := mem.ListTables(venueID)
	if _, err = mem.CreateReservation(guest.ID, venueID, tables[0].ID, 2, time.Now().UTC().Add(3*time.Hour)); err != nil {
		t.Fatalf("reservation: %v", err)
	}

	analytics, err := mem.VenueAnalytics(owner.ID, venueID)
	if err != nil {
		t.Fatalf("analytics: %v", err)
	}
	if analytics.ReservationsByStatus[string(models.ReservationConfirmed)] < 1 {
		t.Fatalf("analytics = %#v", analytics)
	}
	if analytics.TotalTables < 1 {
		t.Fatalf("expected tables in analytics")
	}
}

func TestProfileChangeRequest(t *testing.T) {
	mem := NewMemory()
	owner, app, venueID := publishTestVenue(t, mem, "change-owner@example.com")
	newName := models.LocalizedString{RU: "Новое имя", EN: "New name", RO: "Nume nou"}
	req, err := mem.SubmitProfileChangeRequest(owner.ID, app.ID, models.ApplicationPatch{Name: &newName})
	if err != nil {
		t.Fatalf("submit change: %v", err)
	}
	reviewed, err := mem.AdminReviewProfileChange("user-admin", req.ID, models.ProfileChangeApproved, "ok")
	if err != nil || reviewed.Status != models.ProfileChangeApproved {
		t.Fatalf("approve = %#v, %v", reviewed, err)
	}
	updatedApp, err := mem.GetApplication(app.ID)
	if err != nil || updatedApp.Name.EN != "New name" {
		t.Fatalf("application name = %#v, %v", updatedApp.Name, err)
	}
	venue, err := mem.GetVenue(venueID)
	if err != nil || venue.Name.EN != "New name" {
		t.Fatalf("venue name = %#v, %v", venue.Name, err)
	}
}
