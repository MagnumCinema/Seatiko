package store

import (
	"testing"
	"time"

	"github.com/seatiko/api/internal/models"
)

func TestDeleteAccountAnonymisesGuest(t *testing.T) {
	mem := NewMemory()
	guest := registerTestUser(t, mem, "gone@example.com", models.RoleGuest)
	mem.mu.Lock()
	g := mem.users[guest.ID]
	g.Phone, g.DietPreferences, g.FavoriteVenues, g.AvatarKey = "+37369000000", []string{"vegan"}, []string{"venue-1"}, "avatars/x.jpg"
	mem.users[guest.ID] = g
	v := mem.venues["venue-1"]
	v.AllowPreorder = true
	mem.venues["venue-1"] = v
	mem.reservations["future"] = models.Reservation{ID: "future", UserID: guest.ID, VenueID: "venue-1", TableID: "t1", Guests: 2,
		ReservedFor: time.Now().UTC().Add(5 * time.Hour), Status: models.ReservationConfirmed, Notes: "у окна, Ion"}
	mem.reservations["past"] = models.Reservation{ID: "past", UserID: guest.ID, VenueID: "venue-1", TableID: "t2", Guests: 2,
		ReservedFor: time.Now().UTC().Add(-48 * time.Hour), Status: models.ReservationCheckedIn, Notes: "день рождения"}
	mem.waitlist["w1"] = models.WaitlistEntry{ID: "w1", UserID: guest.ID, VenueID: "venue-1", GuestName: "Ion", Phone: "+373", Status: models.WaitlistWaiting}
	mem.mu.Unlock()
	o, err := mem.SavePreorder(guest.ID, "future", []OrderItemInput{item("m1", 1)})
	if err != nil {
		t.Fatal(err)
	}

	if _, err := mem.DeleteAccount(guest.ID, "wrong"); err != ErrWrongPassword {
		t.Fatalf("wrong password err = %v", err)
	}
	res, err := mem.DeleteAccount(guest.ID, "secret123")
	if err != nil || res.CancelledReservations != 1 || res.AvatarKey != "avatars/x.jpg" {
		t.Fatalf("delete: %v %+v", err, res)
	}

	u, _ := mem.GetUser(guest.ID)
	if u.DeletedAt == nil || u.Email == "gone@example.com" || u.Phone != "" || u.FirstName != "" ||
		len(u.DietPreferences) != 0 || len(u.FavoriteVenues) != 0 || u.AvatarKey != "" || u.PasswordHash != "" {
		t.Fatalf("personal data left: %+v", u)
	}
	if mem.reservations["future"].Status != models.ReservationCancelled || mem.reservations["future"].Notes != "" {
		t.Fatalf("upcoming booking %+v", mem.reservations["future"])
	}
	if mem.reservations["past"].Status != models.ReservationCheckedIn || mem.reservations["past"].Notes != "" {
		t.Fatalf("past visit must stay in history without notes: %+v", mem.reservations["past"])
	}
	if got, _ := mem.GetOrder(o.ID); got.Status != models.OrderCancelled {
		t.Fatalf("preorder of a deleted account is %s", got.Status)
	}
	if w := mem.waitlist["w1"]; w.GuestName != "" || w.Phone != "" || w.Status != models.WaitlistLeft {
		t.Fatalf("waitlist entry %+v", w)
	}
	if err := mem.ActiveUser(guest.ID); err != ErrAccountDeleted {
		t.Fatalf("ActiveUser err = %v", err)
	}
	if _, err := mem.Authenticate("gone@example.com", "secret123"); err == nil {
		t.Fatal("deleted account can still sign in")
	}
	if _, err := mem.UpdateUserFromCRM(guest.ID, "Ion", "", "gone@example.com", "", "ru"); err != ErrNotFound {
		t.Fatal("CRM sync restored a deleted account")
	}
	if _, err := mem.Register("gone@example.com", "secret123", "New", "", "ru", ""); err != nil {
		t.Fatalf("the email must be free for a new account: %v", err)
	}
}

func TestOnlyGuestsDeleteThemselves(t *testing.T) {
	mem := NewMemory()
	owner := registerTestUser(t, mem, "owner2@example.com", models.RoleRestaurant)
	if _, err := mem.DeleteAccount(owner.ID, "secret123"); err != ErrForbidden {
		t.Fatalf("restaurant owner delete err = %v", err)
	}
}
