package store

import (
	"errors"
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
	if len(tables) == 0 {
		t.Fatal("published venue has no tables")
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
