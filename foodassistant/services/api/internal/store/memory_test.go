package store

import (
	"errors"
	"path/filepath"
	"testing"
	"time"

	"github.com/foodassistant/api/internal/models"
)

func registerTestUser(t *testing.T, store *MemoryStore, email, role string) models.User {
	t.Helper()
	user, err := store.Register(email, "secret123", "Test", "User", "ru", role)
	if err != nil {
		t.Fatalf("register %s: %v", role, err)
	}
	return user
}

func TestPersistentStoreSurvivesRestart(t *testing.T) {
	path := filepath.Join(t.TempDir(), "state.json")
	first, err := NewPersistent(path)
	if err != nil {
		t.Fatalf("create persistent store: %v", err)
	}
	owner := registerTestUser(t, first, "persistent-owner@example.com", models.RoleRestaurant)
	application, err := first.CreateApplication(owner.ID)
	if err != nil {
		t.Fatalf("create persistent application: %v", err)
	}

	second, err := NewPersistent(path)
	if err != nil {
		t.Fatalf("reload persistent store: %v", err)
	}
	reloadedUser, err := second.GetUser(owner.ID)
	if err != nil || reloadedUser.Email != owner.Email {
		t.Fatalf("reloaded user = %#v, %v", reloadedUser, err)
	}
	reloadedApplication, err := second.GetApplication(application.ID)
	if err != nil || reloadedApplication.OwnerUserID != owner.ID {
		t.Fatalf("reloaded application = %#v, %v", reloadedApplication, err)
	}
}

func TestRestaurantApplicationAuditAndReservationProjection(t *testing.T) {
	store := NewMemory()
	owner := registerTestUser(t, store, "owner@example.com", models.RoleRestaurant)
	guest := registerTestUser(t, store, "guest@example.com", models.RoleGuest)

	application, err := store.CreateApplication(owner.ID)
	if err != nil {
		t.Fatalf("create application: %v", err)
	}
	name := models.LocalizedString{RU: "Тестовый ресторан"}
	description := models.LocalizedString{RU: "Описание ресторана"}
	address := models.LocalizedString{RU: "Бельцы, ул. Тестовая, 1"}
	cuisine := []string{"moldovan"}
	phone := "+37360000000"
	email := "restaurant@example.com"
	website := "https://restaurant.example.com"
	hours := "Пн–Вс 10:00–23:00"
	lat, lng := 47.7617, 27.9288
	priceLevel, averageCheck := 2, 350
	application, err = store.UpdateApplication(owner.ID, application.ID, ApplicationUpdate{
		Name:         &name,
		Description:  &description,
		Address:      &address,
		Cuisine:      &cuisine,
		Phone:        &phone,
		Email:        &email,
		Website:      &website,
		HoursText:    &hours,
		Lat:          &lat,
		Lng:          &lng,
		PriceLevel:   &priceLevel,
		AverageCheck: &averageCheck,
	})
	if err != nil {
		t.Fatalf("update application: %v", err)
	}
	if _, err = store.AddPhoto(owner.ID, application.ID, "/uploads/test.jpg"); err != nil {
		t.Fatalf("add photo: %v", err)
	}
	if _, err = store.SubmitApplication(owner.ID, application.ID); err != nil {
		t.Fatalf("submit application: %v", err)
	}
	if _, err = store.AdminSetStatus("user-admin", application.ID, models.AppUnderReview, ""); err != nil {
		t.Fatalf("start review: %v", err)
	}
	if _, err = store.AdminSetStatus("user-admin", application.ID, models.AppApproved, ""); err != nil {
		t.Fatalf("approve application: %v", err)
	}
	application, err = store.PublishApplication("user-admin", application.ID)
	if err != nil {
		t.Fatalf("publish application: %v", err)
	}
	if application.VenueID == nil {
		t.Fatal("published application has no venue id")
	}
	venue, err := store.GetVenue(*application.VenueID)
	if err != nil {
		t.Fatalf("get published venue: %v", err)
	}
	if venue.Website != website {
		t.Fatalf("published venue website = %q, want %q", venue.Website, website)
	}

	activity, err := store.ListApplicationActivity(owner.ID, application.ID)
	if err != nil {
		t.Fatalf("list activity: %v", err)
	}
	if len(activity) != 7 {
		t.Fatalf("activity entries = %d, want 7", len(activity))
	}
	if activity[0].Action != "APPLICATION_PUBLISHED" {
		t.Fatalf("latest activity = %s, want APPLICATION_PUBLISHED", activity[0].Action)
	}

	tables := store.ListTables(*application.VenueID)
	if len(tables) != 9 {
		t.Fatalf("published venue tables = %d, want 9", len(tables))
	}
	for _, table := range tables {
		if table.X <= 0 || table.X >= 1 || table.Y <= 0 || table.Y >= 1 {
			t.Fatalf("table %d has invalid normalized floor position: %v,%v", table.Number, table.X, table.Y)
		}
	}
	reservation, err := store.CreateReservation(
		guest.ID,
		*application.VenueID,
		tables[0].ID,
		2,
		time.Now().UTC().Add(2*time.Hour),
	)
	if err != nil {
		t.Fatalf("create reservation: %v", err)
	}
	ownerReservations, err := store.ListRestaurantReservations(owner.ID)
	if err != nil {
		t.Fatalf("list restaurant reservations: %v", err)
	}
	if len(ownerReservations) != 1 || ownerReservations[0].ID != reservation.ID {
		t.Fatalf("unexpected reservation projection: %#v", ownerReservations)
	}
	if ownerReservations[0].GuestEmail != guest.Email || ownerReservations[0].TableNumber == 0 {
		t.Fatalf("projection misses operational guest/table data: %#v", ownerReservations[0])
	}
}

func TestRestaurantApplicationRequiresCompleteProfile(t *testing.T) {
	store := NewMemory()
	owner := registerTestUser(t, store, "incomplete@example.com", models.RoleRestaurant)
	application, err := store.CreateApplication(owner.ID)
	if err != nil {
		t.Fatalf("create application: %v", err)
	}

	if _, err = store.SubmitApplication(owner.ID, application.ID); !errors.Is(err, ErrBadRequest) {
		t.Fatalf("submit incomplete application error = %v, want ErrBadRequest", err)
	}
}

func TestRestaurantApplicationRejectsInvalidWebsite(t *testing.T) {
	store := NewMemory()
	owner := registerTestUser(t, store, "invalid-site@example.com", models.RoleRestaurant)
	application, err := store.CreateApplication(owner.ID)
	if err != nil {
		t.Fatalf("create application: %v", err)
	}

	invalidWebsite := "restaurant.example.com"
	if _, err = store.UpdateApplication(owner.ID, application.ID, ApplicationUpdate{Website: &invalidWebsite}); !errors.Is(err, ErrBadRequest) {
		t.Fatalf("invalid website error = %v, want ErrBadRequest", err)
	}

	emptyWebsite := ""
	if _, err = store.UpdateApplication(owner.ID, application.ID, ApplicationUpdate{Website: &emptyWebsite}); err != nil {
		t.Fatalf("empty optional website should be accepted: %v", err)
	}
}

func TestApplicationActivityIsPrivateToOwner(t *testing.T) {
	store := NewMemory()
	owner := registerTestUser(t, store, "first-owner@example.com", models.RoleRestaurant)
	otherOwner := registerTestUser(t, store, "other-owner@example.com", models.RoleRestaurant)
	application, err := store.CreateApplication(owner.ID)
	if err != nil {
		t.Fatalf("create application: %v", err)
	}

	if _, err = store.ListApplicationActivity(otherOwner.ID, application.ID); !errors.Is(err, ErrForbidden) {
		t.Fatalf("other owner activity error = %v, want ErrForbidden", err)
	}
}
