package main

import (
	"bufio"
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/seatiko/api/internal/models"
	"golang.org/x/crypto/bcrypt"
)

type snapshot struct {
	Cities       map[string]models.City                  `json:"cities"`
	Venues       map[string]models.Venue                 `json:"venues"`
	Tables       map[string]models.Table                 `json:"tables"`
	Users        map[string]persistedUser                `json:"users"`
	Reservations map[string]models.Reservation           `json:"reservations"`
	Watches      map[string]models.TableWatch            `json:"watches"`
	Sessions     map[string]models.Session               `json:"sessions"`
	MenuItems    map[string]models.MenuItem              `json:"menu_items"`
	Orders       map[string]models.Order                 `json:"orders"`
	WaiterCalls  map[string]models.WaiterCall            `json:"waiter_calls"`
	Collections  map[string]models.HolidayCollection     `json:"collections"`
	Applications map[string]models.VenueApplication      `json:"applications"`
	Activities   map[string][]models.ApplicationActivity `json:"activities"`
}

type persistedUser struct {
	models.User
	PasswordHash string `json:"password_hash"`
}

type authResponse struct {
	Token string      `json:"token"`
	User  models.User `json:"user"`
}

type restaurantReservation struct {
	ID          string                   `json:"id"`
	VenueID     string                   `json:"venue_id"`
	TableID     string                   `json:"table_id"`
	GuestEmail  string                   `json:"guest_email"`
	Guests      int                      `json:"guests"`
	ReservedFor time.Time                `json:"reserved_for"`
	Status      models.ReservationStatus `json:"status"`
	CreatedAt   time.Time                `json:"created_at"`
}

func request(method, baseURL, path, token string, body any, output any) error {
	var reader io.Reader
	if body != nil {
		encoded, err := json.Marshal(body)
		if err != nil {
			return err
		}
		reader = bytes.NewReader(encoded)
	}
	req, err := http.NewRequest(method, strings.TrimRight(baseURL, "/")+path, reader)
	if err != nil {
		return err
	}
	req.Header.Set("Accept", "application/json")
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	response, err := http.DefaultClient.Do(req)
	if err != nil {
		return err
	}
	defer response.Body.Close()
	payload, err := io.ReadAll(io.LimitReader(response.Body, 8<<20))
	if err != nil {
		return err
	}
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return fmt.Errorf("%s %s returned %d", method, path, response.StatusCode)
	}
	if output != nil {
		return json.Unmarshal(payload, output)
	}
	return nil
}

func login(baseURL, email, password string) (authResponse, error) {
	var result authResponse
	err := request(http.MethodPost, baseURL, "/api/v1/auth/login", "", map[string]string{
		"email": email, "password": password,
	}, &result)
	return result, err
}

func passwordHash(password string) string {
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		panic(err)
	}
	return string(hash)
}

func main() {
	baseURL := os.Getenv("SOURCE_API_URL")
	if baseURL == "" {
		baseURL = "http://localhost"
	}
	outputPath := os.Getenv("STATE_OUTPUT")
	if outputPath == "" {
		fmt.Fprintln(os.Stderr, "STATE_OUTPUT is required")
		os.Exit(2)
	}

	fmt.Fprint(os.Stderr, "Current restaurant owner password: ")
	password, err := bufio.NewReader(os.Stdin).ReadString('\n')
	if err != nil {
		fmt.Fprintln(os.Stderr, "read password:", err)
		os.Exit(1)
	}
	password = strings.TrimSpace(password)
	if password == "" {
		fmt.Fprintln(os.Stderr, "password is empty")
		os.Exit(1)
	}

	admin, err := login(baseURL, "admin@seatiko.local", "admin123")
	if err != nil {
		panic(err)
	}
	pilot, err := login(baseURL, "yuliitezary@gmail.com", password)
	if err != nil {
		panic(err)
	}
	qaOwner, err := login(baseURL, "qa-owner@seatiko.local", "secret123")
	if err != nil {
		panic(err)
	}
	qaGuest, err := login(baseURL, "qa-guest@seatiko.local", "secret123")
	if err != nil {
		panic(err)
	}
	credentials := map[string]string{
		admin.User.ID:   "admin123",
		pilot.User.ID:   password,
		qaOwner.User.ID: "secret123",
		qaGuest.User.ID: "secret123",
	}
	state := snapshot{
		Cities:       map[string]models.City{},
		Venues:       map[string]models.Venue{},
		Tables:       map[string]models.Table{},
		Users:        map[string]persistedUser{},
		Reservations: map[string]models.Reservation{},
		Watches:      map[string]models.TableWatch{},
		Sessions:     map[string]models.Session{},
		MenuItems:    map[string]models.MenuItem{},
		Orders:       map[string]models.Order{},
		WaiterCalls:  map[string]models.WaiterCall{},
		Collections:  map[string]models.HolidayCollection{},
		Applications: map[string]models.VenueApplication{},
		Activities:   map[string][]models.ApplicationActivity{},
	}
	for _, auth := range []authResponse{admin, pilot, qaOwner, qaGuest} {
		user := auth.User
		if user.UpdatedAt.IsZero() {
			user.UpdatedAt = user.CreatedAt
		}
		state.Users[user.ID] = persistedUser{User: user, PasswordHash: passwordHash(credentials[user.ID])}
	}

	var citiesResponse struct {
		Cities []models.City `json:"cities"`
	}
	if err := request(http.MethodGet, baseURL, "/api/v1/cities", "", nil, &citiesResponse); err != nil {
		panic(err)
	}
	for _, city := range citiesResponse.Cities {
		state.Cities[city.ID] = city
	}
	var venuesResponse struct {
		Venues []models.Venue `json:"venues"`
	}
	if err := request(http.MethodGet, baseURL, "/api/v1/venues?city_id=city-balti", "", nil, &venuesResponse); err != nil {
		panic(err)
	}
	for _, venue := range venuesResponse.Venues {
		state.Venues[venue.ID] = venue
		var tablesResponse struct {
			Tables []models.Table `json:"tables"`
		}
		if err := request(http.MethodGet, baseURL, "/api/v1/venues/"+venue.ID+"/tables", "", nil, &tablesResponse); err != nil {
			panic(err)
		}
		for _, table := range tablesResponse.Tables {
			state.Tables[table.ID] = table
		}
		var menuResponse struct {
			Menu []models.MenuItem `json:"menu"`
		}
		if err := request(http.MethodGet, baseURL, "/api/v1/venues/"+venue.ID+"/menu", "", nil, &menuResponse); err != nil {
			panic(err)
		}
		for _, item := range menuResponse.Menu {
			state.MenuItems[item.ID] = item
		}
	}
	var collectionsResponse struct {
		Collections []models.HolidayCollection `json:"collections"`
	}
	if err := request(http.MethodGet, baseURL, "/api/v1/collections", "", nil, &collectionsResponse); err != nil {
		panic(err)
	}
	for _, collection := range collectionsResponse.Collections {
		state.Collections[collection.ID] = collection
	}

	var applicationsResponse struct {
		Applications []models.VenueApplication `json:"applications"`
	}
	if err := request(http.MethodGet, baseURL, "/api/v1/admin/applications", admin.Token, nil, &applicationsResponse); err != nil {
		panic(err)
	}
	ownerTokens := map[string]string{pilot.User.ID: pilot.Token, qaOwner.User.ID: qaOwner.Token}
	for _, application := range applicationsResponse.Applications {
		state.Applications[application.ID] = application
		var activityResponse struct {
			Activity []models.ApplicationActivity `json:"activity"`
		}
		if err := request(http.MethodGet, baseURL, "/api/v1/restaurant/applications/"+application.ID+"/activity", ownerTokens[application.OwnerUserID], nil, &activityResponse); err != nil {
			panic(err)
		}
		state.Activities[application.ID] = activityResponse.Activity
	}

	var reservationsResponse struct {
		Reservations []restaurantReservation `json:"reservations"`
	}
	if err := request(http.MethodGet, baseURL, "/api/v1/restaurant/reservations", admin.Token, nil, &reservationsResponse); err != nil {
		panic(err)
	}
	usersByEmail := map[string]string{}
	for id, persisted := range state.Users {
		usersByEmail[strings.ToLower(persisted.Email)] = id
	}
	for _, reservation := range reservationsResponse.Reservations {
		userID := usersByEmail[strings.ToLower(reservation.GuestEmail)]
		state.Reservations[reservation.ID] = models.Reservation{
			ID:          reservation.ID,
			UserID:      userID,
			VenueID:     reservation.VenueID,
			TableID:     reservation.TableID,
			Guests:      reservation.Guests,
			ReservedFor: reservation.ReservedFor,
			Status:      reservation.Status,
			Source:      models.ReservationSourceWeb,
			CreatedAt:   reservation.CreatedAt,
			UpdatedAt:   reservation.CreatedAt,
		}
	}

	encoded, err := json.MarshalIndent(state, "", "  ")
	if err != nil {
		panic(err)
	}
	if err := os.WriteFile(outputPath, encoded, 0o600); err != nil {
		panic(err)
	}
	fmt.Fprintf(os.Stderr, "Saved %d users, %d applications, %d reservations and %d venues\n", len(state.Users), len(state.Applications), len(state.Reservations), len(state.Venues))
}
