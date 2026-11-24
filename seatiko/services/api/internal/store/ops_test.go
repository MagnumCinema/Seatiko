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

func TestDraftVenueOnboardingAndPublishMigration(t *testing.T) {
	mem := NewMemory()
	owner := registerTestUser(t, mem, "draft-owner@example.com", models.RoleRestaurant)
	app, err := mem.CreateApplication(owner.ID)
	if err != nil {
		t.Fatalf("create app: %v", err)
	}

	// 1. Verify owner can configure tables on draft app before publishing
	tables, err := mem.ReplaceTablesLayout(owner.ID, app.ID, []TableLayoutInput{
		{Number: 1, Seats: 4, X: 0.2, Y: 0.3, Zone: "hall"},
		{Number: 2, Seats: 2, X: 0.5, Y: 0.6, Zone: "terrace"},
	})
	if err != nil || len(tables) != 2 {
		t.Fatalf("replace tables on draft failed: %v, tables: %#v", err, tables)
	}

	// 2. Verify owner can configure menu item on draft app
	menuItem, err := mem.UpsertMenuItem(owner.ID, app.ID, MenuItemInput{
		Name:     models.LocalizedString{RU: "Борщ", EN: "Borscht", RO: "Borș"},
		Price:    120,
		Category: models.LocalizedString{RU: "Супы", EN: "Soups", RO: "Supe"},
	})
	if err != nil || menuItem.ID == "" {
		t.Fatalf("upsert menu on draft failed: %v", err)
	}

	// 3. Verify owner can configure booking rules on draft app
	interval := 45
	hold := 20
	allow := false
	rulesVenue, err := mem.UpdateVenueBookingRules(owner.ID, app.ID, BookingRulesInput{
		BookingIntervalMin: &interval,
		HoldMinutes:        &hold,
		AllowPreorder:      &allow,
	})
	if err != nil || rulesVenue.BookingIntervalMin != 45 || rulesVenue.HoldMinutes != 20 || rulesVenue.AllowPreorder {
		t.Fatalf("update rules on draft failed: %v, venue: %#v", err, rulesVenue)
	}

	// 4. Verify owner can invite staff on draft app
	staffMember, err := mem.InviteStaff(owner.ID, app.ID, "waiter-draft@example.com", "Ion Popescu")
	if err != nil || staffMember.Name != "Ion Popescu" {
		t.Fatalf("invite staff on draft failed: %v", err)
	}

	// 5. Verify analytics on draft app returns zeroed metrics without 404
	analytics, err := mem.VenueAnalytics(owner.ID, app.ID)
	if err != nil || analytics.TotalTables != 2 {
		t.Fatalf("analytics on draft failed: %v, analytics: %#v", err, analytics)
	}

	// 6. Fill required profile data, submit, approve and publish
	name := models.LocalizedString{RU: "Draft Rest", EN: "Draft Rest", RO: "Draft Rest"}
	desc := models.LocalizedString{RU: "Desc", EN: "Desc", RO: "Desc"}
	addr := models.LocalizedString{RU: "Addr", EN: "Addr", RO: "Addr"}
	cuisine := []string{"european"}
	phone := "+37360000002"
	email := "draft@example.com"
	hours := "10-23"
	lat, lng := 47.76, 27.92
	priceLevel, averageCheck := 2, 250
	app, err = mem.UpdateApplication(owner.ID, app.ID, ApplicationUpdate{
		Name: &name, Description: &desc, Address: &addr, Cuisine: &cuisine,
		Phone: &phone, Email: &email, HoursText: &hours, Lat: &lat, Lng: &lng,
		PriceLevel: &priceLevel, AverageCheck: &averageCheck,
	})
	if err != nil {
		t.Fatalf("update app: %v", err)
	}
	if _, err = mem.AddPhoto(owner.ID, app.ID, "/uploads/test.jpg"); err != nil {
		t.Fatalf("add photo: %v", err)
	}
	if _, err = mem.SubmitApplication(owner.ID, app.ID); err != nil {
		t.Fatalf("submit: %v", err)
	}
	if _, err = mem.AdminSetStatus("user-admin", app.ID, models.AppApproved, ""); err != nil {
		t.Fatalf("approve: %v", err)
	}
	publishedApp, err := mem.PublishApplication("user-admin", app.ID)
	if err != nil || publishedApp.VenueID == nil {
		t.Fatalf("publish failed: %v", err)
	}
	publishedVenueID := *publishedApp.VenueID

	// 7. Verify tables, menu, rules, and staff were migrated to publishedVenueID
	publishedTables := mem.ListTables(publishedVenueID)
	if len(publishedTables) != 2 || publishedTables[0].Number != 1 || publishedTables[1].Number != 2 {
		t.Fatalf("published tables not migrated properly: %#v", publishedTables)
	}

	publishedMenu, err := mem.ListMenuForOwner(owner.ID, publishedVenueID)
	if err != nil || len(publishedMenu) != 1 || publishedMenu[0].Name.RU != "Борщ" {
		t.Fatalf("published menu not migrated properly: %v, %#v", err, publishedMenu)
	}

	publishedStaff, err := mem.ListStaff(owner.ID, publishedVenueID)
	if err != nil || len(publishedStaff) != 1 || publishedStaff[0].Name != "Ion Popescu" {
		t.Fatalf("published staff not migrated properly: %v, %#v", err, publishedStaff)
	}

	publishedVenue, err := mem.GetVenue(publishedVenueID)
	if err != nil || publishedVenue.BookingIntervalMin != 45 || publishedVenue.HoldMinutes != 20 || publishedVenue.AllowPreorder {
		t.Fatalf("published rules not migrated properly: %v, %#v", err, publishedVenue)
	}
}

func TestWorkShiftsAndSchedule(t *testing.T) {
	mem := NewMemory()
	owner, _, venueID := publishTestVenue(t, mem, "schedule-owner@example.com")
	waiterUser := registerTestUser(t, mem, "waiter-schedule@example.com", models.RoleGuest)
	cookUser := registerTestUser(t, mem, "cook-schedule@example.com", models.RoleGuest)

	// Invite waiter
	waiter, err := mem.InviteStaff(owner.ID, venueID, waiterUser.Email, "Vasile Chelner", models.StaffRoleWaiter)
	if err != nil || waiter.Role != models.StaffRoleWaiter {
		t.Fatalf("invite waiter: %v", err)
	}

	// Invite cook
	cook, err := mem.InviteStaff(owner.ID, venueID, cookUser.Email, "Gheorghe Bucatar", models.StaffRoleCook)
	if err != nil || cook.Role != models.StaffRoleCook {
		t.Fatalf("invite cook: %v", err)
	}

	// Create waiter shift
	waiterShift, err := mem.CreateWorkShift(owner.ID, venueID, WorkShiftInput{
		StaffID:   waiter.ID,
		Date:      "2026-11-25",
		StartTime: "10:00",
		EndTime:   "22:00",
		Note:      "Зал 1",
	})
	if err != nil || waiterShift.Status != models.ShiftStatusPending || waiterShift.Role != models.StaffRoleWaiter {
		t.Fatalf("create waiter shift: %v, %#v", err, waiterShift)
	}

	// Create cook shift
	cookShift, err := mem.CreateWorkShift(owner.ID, venueID, WorkShiftInput{
		StaffID:   cook.ID,
		Date:      "2026-11-25",
		StartTime: "09:00",
		EndTime:   "18:00",
		Note:      "Кухня / горячий цех",
	})
	if err != nil || cookShift.Role != models.StaffRoleCook {
		t.Fatalf("create cook shift: %v, %#v", err, cookShift)
	}

	// Filter by role
	waiterShifts, err := mem.ListWorkShifts(owner.ID, venueID, models.StaffRoleWaiter)
	if err != nil || len(waiterShifts) != 1 || waiterShifts[0].ID != waiterShift.ID {
		t.Fatalf("list waiter shifts: %v, %#v", err, waiterShifts)
	}

	cookShifts, err := mem.ListWorkShifts(owner.ID, venueID, models.StaffRoleCook)
	if err != nil || len(cookShifts) != 1 || cookShifts[0].ID != cookShift.ID {
		t.Fatalf("list cook shifts: %v, %#v", err, cookShifts)
	}

	allShifts, err := mem.ListWorkShifts(owner.ID, venueID)
	if err != nil || len(allShifts) != 2 {
		t.Fatalf("list all shifts: %v, count=%d", err, len(allShifts))
	}

	// Waiter views their shifts
	myShifts, err := mem.ListMyStaffShifts(waiterUser.ID)
	if err != nil || len(myShifts) != 1 {
		t.Fatalf("list my staff shifts: %v, %#v", err, myShifts)
	}

	// Waiter responds to shift (confirms)
	confirmedShift, err := mem.RespondToWorkShift(waiterUser.ID, waiterShift.ID, models.ShiftStatusConfirmed)
	if err != nil || confirmedShift.Status != models.ShiftStatusConfirmed {
		t.Fatalf("confirm shift: %v, %#v", err, confirmedShift)
	}

	// Cook responds to shift (requests swap with reason)
	declinedShift, err := mem.RespondToWorkShift(cookUser.ID, cookShift.ID, models.ShiftStatusSwapRequested, "Заболел, не смогу выйти")
	if err != nil || declinedShift.Status != models.ShiftStatusSwapRequested || declinedShift.Reason != "Заболел, не смогу выйти" {
		t.Fatalf("swap request shift: %v, %#v", err, declinedShift)
	}

	// Trying to assign duplicate/overlapping shift for confirmed waiter must fail with ErrConflict
	if _, err := mem.CreateWorkShift(owner.ID, venueID, WorkShiftInput{
		StaffID:   waiter.ID,
		Date:      "2026-11-25",
		StartTime: "12:00",
		EndTime:   "18:00",
	}); err != ErrConflict {
		t.Fatalf("expected ErrConflict for overlapping waiter shift, got %v", err)
	}

	// Non-overlapping shift later or earlier is allowed; overlapping swap must fail with ErrConflict
	if _, err := mem.SwapWorkShift(owner.ID, venueID, cookShift.ID, waiter.ID); err != ErrConflict {
		t.Fatalf("expected ErrConflict when swapping onto busy waiter, got %v", err)
	}

	// Invite a free second cook and swap cookShift to them
	cook2User := registerTestUser(t, mem, "cook2-schedule@example.com", models.RoleGuest)
	cook2, err := mem.InviteStaff(owner.ID, venueID, cook2User.Email, "Ion Bucatar", models.StaffRoleCook)
	if err != nil {
		t.Fatalf("invite cook2: %v", err)
	}

	swappedShift, err := mem.SwapWorkShift(owner.ID, venueID, cookShift.ID, cook2.ID)
	if err != nil || swappedShift.StaffID != cook2.ID || swappedShift.Status != models.ShiftStatusPending {
		t.Fatalf("swap shift staff: %v, %#v", err, swappedShift)
	}

	// Trying to assign another overlapping shift to cook2 (now PENDING) must also fail with ErrConflict
	if _, err := mem.CreateWorkShift(owner.ID, venueID, WorkShiftInput{
		StaffID:   cook2.ID,
		Date:      "2026-11-25",
		StartTime: "10:00",
		EndTime:   "15:00",
	}); err != ErrConflict {
		t.Fatalf("expected ErrConflict for overlapping pending shift, got %v", err)
	}

	// Batch create shifts (skips any conflicting slots on 2026-11-25 and creates on 2026-11-26, 2026-11-27)
	batchShifts, err := mem.BatchCreateWorkShifts(owner.ID, venueID, BatchWorkShiftsInput{
		StaffIDs:  []string{waiter.ID, cook.ID},
		Dates:     []string{"2026-11-25", "2026-11-26", "2026-11-27"},
		StartTime: "10:00",
		EndTime:   "22:00",
		Note:      "Общая смена",
	})
	if err != nil || len(batchShifts) != 5 {
		t.Fatalf("batch create shifts: %v, count=%d", err, len(batchShifts))
	}

	// Owner deletes a shift
	if err := mem.DeleteWorkShift(owner.ID, venueID, cookShift.ID); err != nil {
		t.Fatalf("delete shift: %v", err)
	}

	afterDelete, err := mem.ListWorkShifts(owner.ID, venueID)
	if err != nil || len(afterDelete) != 6 {
		t.Fatalf("after delete count = %d", len(afterDelete))
	}
}
