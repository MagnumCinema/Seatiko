package store

import (
	"path/filepath"
	"testing"
	"time"

	"github.com/seatiko/api/internal/models"
)

// adultFixture: a guest checked in at venue-1 one hour ago, plus a platform admin.
func adultFixture(t *testing.T, mem *MemoryStore, status models.ReservationStatus, reservedFor time.Time) (guestID, reservationID, adminID string) {
	t.Helper()
	guestID, reservationID, adminID = "adult-guest", "adult-res", "adult-admin"
	mem.mu.Lock()
	defer mem.mu.Unlock()
	mem.users[guestID] = models.User{ID: guestID, Email: "adult-guest@example.com", Role: models.RoleGuest}
	mem.users[adminID] = models.User{ID: adminID, Email: "adult-admin@example.com", Role: models.RoleAdmin, DisplayName: "Platform Admin"}
	mem.reservations[reservationID] = models.Reservation{
		ID: reservationID, UserID: guestID, VenueID: "venue-1", TableID: "t1",
		Guests: 2, ReservedFor: reservedFor, Status: status,
	}
	return guestID, reservationID, adminID
}

var idChecked = AdultGrantInput{IDDocumentChecked: true, IDDocumentType: models.IDDocumentPassport}

func TestGrantAdultPreorderByVenueStaff(t *testing.T) {
	mem := NewMemory()
	guestID, resID, _ := adultFixture(t, mem, models.ReservationCheckedIn, time.Now().Add(-time.Hour))

	guest, err := mem.GrantAdultPreorder(demoStaffID, resID, idChecked)
	if err != nil {
		t.Fatalf("staff grant: %v", err)
	}
	v := guest.AdultVerification
	if !guest.AdultPreorderAllowed || v == nil || v.StaffID != demoStaffID || v.StaffRole != models.AdultStaffRoleWaiter ||
		v.VenueID != "venue-1" || !v.IDDocumentChecked || v.IDDocumentType != models.IDDocumentPassport || v.StaffDisplayName == "" {
		t.Fatalf("grant not recorded on the staff member: %+v / %+v", guest, v)
	}
	log := mem.ListAdultPermissionLog(guestID)
	if len(log) != 1 || log[0].Action != models.AdultActionGrant || log[0].StaffID != demoStaffID || log[0].ReservationID != resID {
		t.Fatalf("audit log = %+v", log)
	}

	owner, err := mem.GrantAdultPreorder(demoOwnerID, resID, idChecked)
	if err != nil || owner.AdultVerification.StaffRole != models.AdultStaffRoleManager {
		t.Fatalf("owner grant: %v, role %q", err, owner.AdultVerification.StaffRole)
	}
}

func TestGrantAdultPreorderRules(t *testing.T) {
	cases := []struct {
		name     string
		status   models.ReservationStatus
		ago      time.Duration
		staff    string
		input    AdultGrantInput
		wantErr  error
		guestRes bool
	}{
		{"no ID check", models.ReservationCheckedIn, time.Hour, demoStaffID, AdultGrantInput{IDDocumentType: models.IDDocumentIDCard}, ErrIDDocumentRequired, false},
		{"unknown document type", models.ReservationCheckedIn, time.Hour, demoStaffID, AdultGrantInput{IDDocumentChecked: true, IDDocumentType: "selfie"}, ErrBadRequest, false},
		{"not checked in", models.ReservationConfirmed, -time.Hour, demoStaffID, idChecked, ErrVisitRequired, false},
		{"old visit", models.ReservationCheckedIn, 30 * time.Hour, demoStaffID, idChecked, ErrVisitRequired, false},
		{"guest cannot self-grant", models.ReservationCheckedIn, time.Hour, "adult-guest", idChecked, ErrForbidden, false},
		{"stranger cannot grant", models.ReservationCheckedIn, time.Hour, "stranger", idChecked, ErrForbidden, false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			mem := NewMemory()
			guestID, resID, _ := adultFixture(t, mem, tc.status, time.Now().Add(-tc.ago))
			mem.mu.Lock()
			mem.users["stranger"] = models.User{ID: "stranger", Email: "s@example.com", Role: models.RoleStaff}
			mem.mu.Unlock()
			if _, err := mem.GrantAdultPreorder(tc.staff, resID, tc.input); err != tc.wantErr {
				t.Fatalf("err = %v, want %v", err, tc.wantErr)
			}
			if got, _ := mem.GetUser(guestID); got.AdultPreorderAllowed {
				t.Fatal("permission granted despite the error")
			}
			if len(mem.ListAdultPermissionLog(guestID)) != 0 {
				t.Fatal("failed grant was logged")
			}
		})
	}
}

func TestRevokeAdultPreorder(t *testing.T) {
	mem := NewMemory()
	guestID, resID, adminID := adultFixture(t, mem, models.ReservationCheckedIn, time.Now().Add(-time.Hour))
	if _, err := mem.GrantAdultPreorder(demoStaffID, resID, idChecked); err != nil {
		t.Fatal(err)
	}

	if _, err := mem.RevokeAdultPreorder(demoStaffID, "venue-1", guestID, ""); err != ErrForbidden {
		t.Fatalf("waiter revoke err = %v, want ErrForbidden", err)
	}
	guest, err := mem.RevokeAdultPreorder(demoOwnerID, "venue-1", guestID, "ID looked fake")
	if err != nil {
		t.Fatalf("owner revoke: %v", err)
	}
	if guest.AdultPreorderAllowed || guest.AdultVerification.RevokedAt == nil || guest.AdultVerification.RevokedByStaffID != demoOwnerID {
		t.Fatalf("revoke not recorded: %+v", guest.AdultVerification)
	}
	log := mem.ListAdultPermissionLog(guestID)
	if len(log) != 2 || log[0].Action != models.AdultActionRevoke || log[0].Reason != "ID looked fake" {
		t.Fatalf("audit log = %+v", log)
	}

	// Admin can revoke anywhere; revoking twice is a no-op without a new log entry.
	if _, err := mem.RevokeAdultPreorder(adminID, "venue-2", guestID, ""); err != nil {
		t.Fatalf("admin revoke: %v", err)
	}
	if len(mem.ListAdultPermissionLog(guestID)) != 2 {
		t.Fatal("no-op revoke was logged")
	}
}

func TestPreorderMenuHidesAdultItemsUntilGranted(t *testing.T) {
	mem := NewMemory()
	guestID, resID, _ := adultFixture(t, mem, models.ReservationCheckedIn, time.Now().Add(-time.Hour))

	blocked := func() (adult, blockedAdult, other int) {
		items, err := mem.PreorderMenu(guestID, "venue-1")
		if err != nil {
			t.Fatal(err)
		}
		for _, item := range items {
			if item.ContainsAlcohol && !item.RequiresAge18 {
				t.Fatalf("%s: alcohol must require 18+", item.ID)
			}
			switch {
			case item.RequiresAge18:
				adult++
				if !item.Orderable {
					blockedAdult++
					if item.BlockedReason != "age_verification_required" {
						t.Fatalf("%s blocked for %q", item.ID, item.BlockedReason)
					}
				}
			case !item.Orderable:
				other++
			}
		}
		return
	}

	adult, blockedAdult, other := blocked()
	if adult == 0 || blockedAdult != adult || other != 0 {
		t.Fatalf("before grant: %d adult items, %d blocked, %d other blocked", adult, blockedAdult, other)
	}
	if err := mem.CanPreorderItem(guestID, "m-v1-13"); err != ErrForbidden {
		t.Fatalf("house wine preorder err = %v, want ErrForbidden", err)
	}

	if _, err := mem.GrantAdultPreorder(demoStaffID, resID, idChecked); err != nil {
		t.Fatal(err)
	}
	if _, blockedAdult, _ := blocked(); blockedAdult != 0 {
		t.Fatalf("after grant %d adult items still blocked", blockedAdult)
	}
	if err := mem.CanPreorderItem(guestID, "m-v1-13"); err != nil {
		t.Fatalf("house wine preorder after grant: %v", err)
	}
}

func TestOwnerMenuItemAlcoholAlwaysAdult(t *testing.T) {
	mem := NewMemory()
	item, err := mem.UpsertMenuItem(demoOwnerID, "venue-1", MenuItemInput{
		Name: models.LocalizedString{RU: "Сидр", EN: "Cider", RO: "Cidru"}, Price: 60, ContainsAlcohol: true,
	})
	if err != nil {
		t.Fatal(err)
	}
	if !item.RequiresAge18 {
		t.Fatal("alcohol item saved without requires_age_18")
	}
}

func TestAdultPermissionSurvivesRestart(t *testing.T) {
	path := filepath.Join(t.TempDir(), "state.json")
	first, err := NewPersistent(path)
	if err != nil {
		t.Fatal(err)
	}
	guestID, resID, _ := adultFixture(t, first, models.ReservationCheckedIn, time.Now().Add(-time.Hour))
	if _, err := first.GrantAdultPreorder(demoStaffID, resID, idChecked); err != nil {
		t.Fatal(err)
	}
	second, err := NewPersistent(path)
	if err != nil {
		t.Fatal(err)
	}
	guest, _ := second.GetUser(guestID)
	if !guest.AdultPreorderAllowed || guest.AdultVerification == nil || len(second.ListAdultPermissionLog(guestID)) != 1 {
		t.Fatalf("18+ permission lost on restart: %+v", guest)
	}
}
