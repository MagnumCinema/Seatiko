package models

import "time"

type LocalizedString struct {
	RU string `json:"ru"`
	EN string `json:"en"`
	RO string `json:"ro"`
}

type City struct {
	ID        string          `json:"id"`
	Slug      string          `json:"slug"`
	Name      LocalizedString `json:"name"`
	Available bool            `json:"available"`
	Country   string          `json:"country"`
}

type Venue struct {
	ID            string          `json:"id"`
	CityID        string          `json:"city_id"`
	Name          LocalizedString `json:"name"`
	Description   LocalizedString `json:"description"`
	Cuisine       []string        `json:"cuisine"`
	Rating        float64         `json:"rating"`
	PriceLevel    int             `json:"price_level"`
	Address       LocalizedString `json:"address"`
	Lat           float64         `json:"lat"`
	Lng           float64         `json:"lng"`
	AverageCheck  int             `json:"average_check"`
	OpenNow       bool            `json:"open_now"`
	FreeTables    int             `json:"free_tables"`
	ImageURL      string          `json:"image_url"`
	AlcoholLicense bool           `json:"alcohol_license_valid"`
}

type TableStatus string

const (
	TableFree      TableStatus = "FREE"
	TableReserved  TableStatus = "RESERVED"
	TableOccupied  TableStatus = "OCCUPIED"
	TableCleaning  TableStatus = "CLEANING"
)

type Table struct {
	ID              string      `json:"id"`
	VenueID         string      `json:"venue_id"`
	Number          int         `json:"number"`
	Seats           int         `json:"seats"`
	Status          TableStatus `json:"status"`
	OccupiedSince   *time.Time  `json:"occupied_since,omitempty"`
	ReservedFor     *time.Time  `json:"reserved_for,omitempty"`
	ReservationID   *string     `json:"reservation_id,omitempty"`
	X               float64     `json:"x"`
	Y               float64     `json:"y"`
}

type User struct {
	ID          string    `json:"id"`
	Email       string    `json:"email"`
	Phone       string    `json:"phone,omitempty"`
	PasswordHash string   `json:"-"`
	FirstName   string    `json:"first_name"`
	LastName    string    `json:"last_name"`
	DisplayName string    `json:"display_name"`
	Locale      string    `json:"locale"`
	CreatedAt   time.Time `json:"created_at"`
}

type AuthResponse struct {
	Token string `json:"token"`
	User  User   `json:"user"`
}
