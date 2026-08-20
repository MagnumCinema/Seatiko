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
	ID                    string          `json:"id"`
	CityID                string          `json:"city_id"`
	Name                  LocalizedString `json:"name"`
	Description           LocalizedString `json:"description"`
	Cuisine               []string        `json:"cuisine"`
	Rating                float64         `json:"rating"`
	PriceLevel            int             `json:"price_level"`
	Address               LocalizedString `json:"address"`
	Lat                   float64         `json:"lat"`
	Lng                   float64         `json:"lng"`
	AverageCheck          int             `json:"average_check"`
	OpenNow               bool            `json:"open_now"`
	FreeTables            int             `json:"free_tables"`
	ImageURL              string          `json:"image_url"`
	Website               string          `json:"website,omitempty"`
	AlcoholLicense        bool            `json:"alcohol_license_valid"`
	SessionStartBeforeMin int             `json:"session_start_before_min"`
	ReleaseBeforeMin      int             `json:"release_before_min"`
}

type TableStatus string

const (
	TableFree     TableStatus = "FREE"
	TableReserved TableStatus = "RESERVED"
	TableOccupied TableStatus = "OCCUPIED"
	TableCleaning TableStatus = "CLEANING"
)

type Table struct {
	ID            string      `json:"id"`
	VenueID       string      `json:"venue_id"`
	Number        int         `json:"number"`
	Seats         int         `json:"seats"`
	Status        TableStatus `json:"status"`
	OccupiedSince *time.Time  `json:"occupied_since,omitempty"`
	ReservedFor   *time.Time  `json:"reserved_for,omitempty"`
	ReservationID *string     `json:"reservation_id,omitempty"`
	X             float64     `json:"x"`
	Y             float64     `json:"y"`
}

const (
	RoleGuest      = "guest"
	RoleRestaurant = "restaurant"
	RoleAdmin      = "admin"
)

type User struct {
	ID           string    `json:"id"`
	Email        string    `json:"email"`
	Phone        string    `json:"phone,omitempty"`
	PasswordHash string    `json:"-"`
	FirstName    string    `json:"first_name"`
	LastName     string    `json:"last_name"`
	DisplayName  string    `json:"display_name"`
	Locale       string    `json:"locale"`
	Role         string    `json:"role"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
}

type ApplicationStatus string

const (
	AppDraft       ApplicationStatus = "DRAFT"
	AppSubmitted   ApplicationStatus = "SUBMITTED"
	AppUnderReview ApplicationStatus = "UNDER_REVIEW"
	AppApproved    ApplicationStatus = "APPROVED"
	AppRejected    ApplicationStatus = "REJECTED"
	AppPublished   ApplicationStatus = "PUBLISHED"
)

type VenueApplication struct {
	ID           string            `json:"id"`
	OwnerUserID  string            `json:"owner_user_id"`
	Status       ApplicationStatus `json:"status"`
	Name         LocalizedString   `json:"name"`
	Description  LocalizedString   `json:"description"`
	Address      LocalizedString   `json:"address"`
	Cuisine      []string          `json:"cuisine"`
	Phone        string            `json:"phone"`
	Email        string            `json:"email"`
	Website      string            `json:"website,omitempty"`
	CityID       string            `json:"city_id"`
	Lat          float64           `json:"lat"`
	Lng          float64           `json:"lng"`
	PriceLevel   int               `json:"price_level"`
	AverageCheck int               `json:"average_check"`
	PhotoURLs    []string          `json:"photo_urls"`
	HoursText    string            `json:"hours_text"`
	RejectReason string            `json:"reject_reason,omitempty"`
	VenueID      *string           `json:"venue_id,omitempty"`
	CreatedAt    time.Time         `json:"created_at"`
	UpdatedAt    time.Time         `json:"updated_at"`
	SubmittedAt  *time.Time        `json:"submitted_at,omitempty"`
}

// ApplicationActivity is an append-only audit entry for the restaurant
// onboarding lifecycle. ChangedFields contains stable field keys so clients can
// localise the journal without parsing human-readable text from the API.
type ApplicationActivity struct {
	ID            string    `json:"id"`
	ApplicationID string    `json:"application_id"`
	ActorUserID   string    `json:"actor_user_id"`
	ActorRole     string    `json:"actor_role"`
	Action        string    `json:"action"`
	ChangedFields []string  `json:"changed_fields"`
	Note          string    `json:"note,omitempty"`
	CreatedAt     time.Time `json:"created_at"`
}

type ReservationStatus string

const (
	ReservationConfirmed ReservationStatus = "CONFIRMED"
	ReservationCheckedIn ReservationStatus = "CHECKED_IN"
	ReservationCancelled ReservationStatus = "CANCELLED"
	ReservationNoShow    ReservationStatus = "NO_SHOW"
)

const (
	ReservationSourceWeb     = "WEB"
	ReservationSourceAndroid = "ANDROID"
	ReservationSourceIOS     = "IOS"
	ReservationSourcePhone   = "PHONE"
	ReservationSourceWalkIn  = "WALK_IN"
)

type Reservation struct {
	ID                 string            `json:"id"`
	UserID             string            `json:"user_id"`
	VenueID            string            `json:"venue_id"`
	TableID            string            `json:"table_id"`
	Guests             int               `json:"guests"`
	ReservedFor        time.Time         `json:"reserved_for"`
	Status             ReservationStatus `json:"status"`
	Source             string            `json:"source"`
	ArrivalConfirmedAt *time.Time        `json:"arrival_confirmed_at,omitempty"`
	CreatedAt          time.Time         `json:"created_at"`
	UpdatedAt          time.Time         `json:"updated_at"`
}

// RestaurantReservation is the owner-facing reservation projection. It only
// exposes booking data needed to operate the venue and is available through the
// restaurant-authorised API group.
type RestaurantReservation struct {
	ID                 string            `json:"id"`
	VenueID            string            `json:"venue_id"`
	VenueName          LocalizedString   `json:"venue_name"`
	TableID            string            `json:"table_id"`
	TableNumber        int               `json:"table_number"`
	GuestName          string            `json:"guest_name"`
	GuestEmail         string            `json:"guest_email"`
	Guests             int               `json:"guests"`
	ReservedFor        time.Time         `json:"reserved_for"`
	Status             ReservationStatus `json:"status"`
	ArrivalConfirmedAt *time.Time        `json:"arrival_confirmed_at,omitempty"`
	CreatedAt          time.Time         `json:"created_at"`
}

type TableWatch struct {
	ID        string    `json:"id"`
	UserID    string    `json:"user_id"`
	VenueID   string    `json:"venue_id"`
	TableID   string    `json:"table_id"`
	CreatedAt time.Time `json:"created_at"`
	ExpiresAt time.Time `json:"expires_at"`
}

type SessionStatus string

const (
	SessionActive SessionStatus = "ACTIVE"
	SessionClosed SessionStatus = "CLOSED"
)

type Session struct {
	ID            string        `json:"id"`
	UserID        string        `json:"user_id"`
	VenueID       string        `json:"venue_id"`
	TableID       string        `json:"table_id"`
	ReservationID *string       `json:"reservation_id,omitempty"`
	Status        SessionStatus `json:"status"`
	StartedAt     time.Time     `json:"started_at"`
	ClosedAt      *time.Time    `json:"closed_at,omitempty"`
}

type OrderStatus string

const (
	OrderDraft     OrderStatus = "DRAFT"
	OrderSubmitted OrderStatus = "SUBMITTED"
	OrderPreparing OrderStatus = "PREPARING"
	OrderReady     OrderStatus = "READY"
	OrderServed    OrderStatus = "SERVED"
	OrderPaid      OrderStatus = "PAID"
	OrderCancelled OrderStatus = "CANCELLED"
)

type MenuItem struct {
	ID              string          `json:"id"`
	VenueID         string          `json:"venue_id"`
	Category        LocalizedString `json:"category"`
	Name            LocalizedString `json:"name"`
	Description     LocalizedString `json:"description"`
	Price           int             `json:"price"`
	ContainsAlcohol bool            `json:"contains_alcohol"`
}

type OrderItem struct {
	MenuItemID string          `json:"menu_item_id"`
	Name       LocalizedString `json:"name"`
	Qty        int             `json:"qty"`
	Price      int             `json:"price"`
}

type Order struct {
	ID        string      `json:"id"`
	SessionID string      `json:"session_id"`
	UserID    string      `json:"user_id"`
	VenueID   string      `json:"venue_id"`
	Items     []OrderItem `json:"items"`
	Status    OrderStatus `json:"status"`
	Total     int         `json:"total"`
	CreatedAt time.Time   `json:"created_at"`
	UpdatedAt time.Time   `json:"updated_at"`
}

type WaiterCallReason string

const (
	WaiterOrder    WaiterCallReason = "order"
	WaiterBill     WaiterCallReason = "bill"
	WaiterQuestion WaiterCallReason = "question"
	WaiterOther    WaiterCallReason = "other"
	WaiterInitial  WaiterCallReason = "initial"
)

type WaiterCallStatus string

const (
	WaiterPending  WaiterCallStatus = "PENDING"
	WaiterAccepted WaiterCallStatus = "ACCEPTED"
	WaiterDone     WaiterCallStatus = "DONE"
)

type WaiterCall struct {
	ID        string           `json:"id"`
	SessionID string           `json:"session_id"`
	VenueID   string           `json:"venue_id"`
	TableID   string           `json:"table_id"`
	Reason    WaiterCallReason `json:"reason"`
	Status    WaiterCallStatus `json:"status"`
	CreatedAt time.Time        `json:"created_at"`
}

type HolidayCollection struct {
	ID       string          `json:"id"`
	Slug     string          `json:"slug"`
	Title    LocalizedString `json:"title"`
	VenueIDs []string        `json:"venue_ids"`
}
