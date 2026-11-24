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
	Center    Coordinates     `json:"center"`
	Bounds    MapBounds       `json:"bounds"`
}

type Venue struct {
	ID                    string          `json:"id"`
	CityID                string          `json:"city_id"`
	Name                  LocalizedString `json:"name"`
	Description           LocalizedString `json:"description"`
	Cuisine               []string        `json:"cuisine"`
	Rating                float64         `json:"rating"`
	ReviewCount           int             `json:"review_count"`
	PriceLevel            int             `json:"price_level"`
	Address               LocalizedString `json:"address"`
	Lat                   float64         `json:"lat"`
	Lng                   float64         `json:"lng"`
	AverageCheck          int             `json:"average_check"`
	OpenNow               bool            `json:"open_now"`
	FreeTables            int             `json:"free_tables"`
	ImageURL              string          `json:"image_url"`
	PhotoURLs             []string        `json:"photo_urls,omitempty"`
	Phone                 string          `json:"phone,omitempty"`
	Website               string          `json:"website,omitempty"`
	GooglePlaceID         string          `json:"google_place_id,omitempty"`
	Reviews               []VenueReview   `json:"reviews,omitempty"`
	AlcoholLicense        bool            `json:"alcohol_license_valid"`
	SessionStartBeforeMin int             `json:"session_start_before_min"`
	ReleaseBeforeMin      int             `json:"release_before_min"`
	BookingIntervalMin    int             `json:"booking_interval_min"`
	HoldMinutes           int             `json:"hold_minutes"`
	MaxLateArrivalMin     int             `json:"max_late_arrival_min"`
	VisitDurationMin      int             `json:"visit_duration_min"`
	MaxVisitDurationMin   int             `json:"max_visit_duration_min"`
	AllowPreorder         bool            `json:"allow_preorder"`
}

// VenueReview is a guest-facing review shown on the venue page (seeded or from Google Places).
type VenueReview struct {
	Author     string  `json:"author"`
	Rating     float64 `json:"rating"`
	Text       string  `json:"text"`
	Relative   string  `json:"relative_time,omitempty"`
	Source     string  `json:"source,omitempty"`
	ProfileURL string  `json:"profile_url,omitempty"`
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
	// Zone is a floor area slug: hall, terrace, street, or a custom value.
	Zone    string `json:"zone,omitempty"`
	QRToken string `json:"qr_token,omitempty"`
}

const (
	RoleGuest      = "guest"
	RoleRestaurant = "restaurant"
	RoleStaff      = "staff"
	RoleAdmin      = "admin"
)

const (
	StaffRoleWaiter    = "waiter"
	StaffRoleCook      = "cook"
	StaffStatusInvited = "INVITED"
	StaffStatusActive  = "ACTIVE"
	StaffStatusRevoked = "REVOKED"
)

const (
	ShiftStatusPending       = "PENDING"
	ShiftStatusConfirmed     = "CONFIRMED"
	ShiftStatusDeclined      = "DECLINED"
	ShiftStatusSwapRequested = "SWAP_REQUESTED"
)

// WorkShift represents a scheduled work shift for a waiter or cook.
type WorkShift struct {
	ID        string    `json:"id"`
	VenueID   string    `json:"venue_id"`
	StaffID   string    `json:"staff_id"`
	StaffName string    `json:"staff_name"`
	Role      string    `json:"role"`
	Date      string    `json:"date"`
	StartTime string    `json:"start_time"`
	EndTime   string    `json:"end_time"`
	Status    string    `json:"status"`
	Note      string    `json:"note,omitempty"`
	Reason    string    `json:"reason,omitempty"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

// StaffMember is a venue staff invite or active membership.
type StaffMember struct {
	ID        string    `json:"id"`
	VenueID   string    `json:"venue_id"`
	UserID    string    `json:"user_id,omitempty"`
	Name      string    `json:"name,omitempty"`
	Email     string    `json:"email"`
	Role      string    `json:"role"`
	Status    string    `json:"status"`
	OnShift   bool      `json:"on_shift"`
	CreatedAt time.Time `json:"created_at"`
}

const (
	ProfileChangePending  = "PENDING"
	ProfileChangeApproved = "APPROVED"
	ProfileChangeRejected = "REJECTED"
)

// ApplicationPatch is an ApplicationUpdate-like payload for profile change requests.
type ApplicationPatch struct {
	Name         *LocalizedString `json:"name,omitempty"`
	Description  *LocalizedString `json:"description,omitempty"`
	Address      *LocalizedString `json:"address,omitempty"`
	Cuisine      *[]string        `json:"cuisine,omitempty"`
	Phone        *string          `json:"phone,omitempty"`
	Email        *string          `json:"email,omitempty"`
	Website      *string          `json:"website,omitempty"`
	CityID       *string          `json:"city_id,omitempty"`
	Lat          *float64         `json:"lat,omitempty"`
	Lng          *float64         `json:"lng,omitempty"`
	PriceLevel   *int             `json:"price_level,omitempty"`
	AverageCheck *int             `json:"average_check,omitempty"`
	HoursText    *string          `json:"hours_text,omitempty"`
}

type ProfileChangeRequest struct {
	ID            string           `json:"id"`
	ApplicationID string           `json:"application_id"`
	OwnerUserID   string           `json:"owner_user_id"`
	Status        string           `json:"status"`
	Patch         ApplicationPatch `json:"patch"`
	CreatedAt     time.Time        `json:"created_at"`
	Note          string           `json:"note,omitempty"`
}

type VenueAnalytics struct {
	VenueID              string         `json:"venue_id"`
	ReservationsByStatus map[string]int `json:"reservations_by_status"`
	FreeTables           int            `json:"free_tables"`
	WaiterCallsPending   int            `json:"waiter_calls_pending"`
	OrdersByStatus       map[string]int `json:"orders_by_status"`
	TotalTables          int            `json:"total_tables"`
}

type User struct {
	ID              string    `json:"id"`
	Email           string    `json:"email"`
	Phone           string    `json:"phone,omitempty"`
	PasswordHash    string    `json:"-"`
	FirstName       string    `json:"first_name"`
	LastName        string    `json:"last_name"`
	DisplayName     string    `json:"display_name"`
	Locale          string    `json:"locale"`
	Role            string    `json:"role"`
	DietPreferences []string  `json:"diet_preferences,omitempty"`
	FavoriteVenues  []string  `json:"favorite_venues,omitempty"`
	CreatedAt       time.Time `json:"created_at"`
	UpdatedAt       time.Time `json:"updated_at"`
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
	BookingIntervalMin    int      `json:"booking_interval_min,omitempty"`
	HoldMinutes           int      `json:"hold_minutes,omitempty"`
	AllowPreorder         bool     `json:"allow_preorder,omitempty"`
	SessionStartBeforeMin int      `json:"session_start_before_min,omitempty"`
	ReleaseBeforeMin      int      `json:"release_before_min,omitempty"`
	MaxLateArrivalMin     int      `json:"max_late_arrival_min,omitempty"`
	VisitDurationMin      int      `json:"visit_duration_min,omitempty"`
	MaxVisitDurationMin   int      `json:"max_visit_duration_min,omitempty"`
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
	TableIDs           []string          `json:"table_ids,omitempty"`
	Guests             int               `json:"guests"`
	ReservedFor        time.Time         `json:"reserved_for"`
	DurationMin        int               `json:"duration_min,omitempty"`
	Status             ReservationStatus `json:"status"`
	Source             string            `json:"source"`
	Notes              string            `json:"notes,omitempty"`
	ArrivalConfirmedAt *time.Time        `json:"arrival_confirmed_at,omitempty"`
	ExpectedArrival    *time.Time        `json:"expected_arrival,omitempty"`
	CreatedAt          time.Time         `json:"created_at"`
	UpdatedAt          time.Time         `json:"updated_at"`
	// Guest list enrichment (filled on read, not persisted separately).
	VenueName    LocalizedString `json:"venue_name,omitempty"`
	TableNumber  int             `json:"table_number,omitempty"`
	TableNumbers []int           `json:"table_numbers,omitempty"`
}

type EventInquiry struct {
	ID            string          `json:"id"`
	UserID        string          `json:"user_id"`
	VenueID       string          `json:"venue_id"`
	VenueName     LocalizedString `json:"venue_name,omitempty"`
	EventType     string          `json:"event_type"` // birthday, banquet, corporate, romantic, other
	GuestCount    int             `json:"guest_count"`
	PreferredDate time.Time       `json:"preferred_date"`
	ContactMethod string          `json:"contact_method"` // chat, call
	ContactPhone  string          `json:"contact_phone"`
	ContactName   string          `json:"contact_name"`
	Notes         string          `json:"notes"`
	Status        string          `json:"status"` // PENDING, CONTACTED, CONFIRMED
	AdminPhone    string          `json:"admin_phone,omitempty"`
	AdminTelegram string          `json:"admin_telegram,omitempty"`
	CreatedAt     time.Time       `json:"created_at"`
	UpdatedAt     time.Time       `json:"updated_at"`
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

// VenueScheduleSlot is the public busy window for a table — no guest PII.
type VenueScheduleSlot struct {
	ID          string    `json:"id"`
	TableID     string    `json:"table_id"`
	TableNumber int       `json:"table_number"`
	StartsAt    time.Time `json:"starts_at"`
	EndsAt      time.Time `json:"ends_at"`
	Kind        string    `json:"kind"` // RESERVATION | OCCUPIED
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
	ID          string          `json:"id"`
	VenueID     string          `json:"venue_id"`
	Category    LocalizedString `json:"category"`
	Name        LocalizedString `json:"name"`
	Description LocalizedString `json:"description"`
	// Ingredients is the full composition shown in the dish popup.
	Ingredients LocalizedString `json:"ingredients,omitempty"`
	// Allergens are stable codes (gluten, milk, eggs, …) localised on the client.
	Allergens       []string `json:"allergens,omitempty"`
	Price           int      `json:"price"`
	WeightG         int      `json:"weight_g,omitempty"`
	VolumeML        int      `json:"volume_ml,omitempty"`
	ImageURL        string   `json:"image_url,omitempty"`
	ContainsAlcohol bool     `json:"contains_alcohol"`
	Tags            []string `json:"tags,omitempty"`
	Position        int      `json:"position,omitempty"`
	Stopped         bool     `json:"stopped"`
}

type OrderItem struct {
	MenuItemID string          `json:"menu_item_id"`
	Name       LocalizedString `json:"name"`
	Qty        int             `json:"qty"`
	Price      int             `json:"price"`
}

type Order struct {
	ID            string          `json:"id"`
	SessionID     string          `json:"session_id"`
	UserID        string          `json:"user_id"`
	VenueID       string          `json:"venue_id"`
	Items         []OrderItem     `json:"items"`
	Status        OrderStatus     `json:"status"`
	Total         int             `json:"total"`
	CheckNumber   string          `json:"check_number,omitempty"`
	PaymentMethod string          `json:"payment_method,omitempty"`
	PaidAt        *time.Time      `json:"paid_at,omitempty"`
	CreatedAt     time.Time       `json:"created_at"`
	UpdatedAt     time.Time       `json:"updated_at"`
	VenueName     LocalizedString `json:"venue_name,omitempty"`
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

type WaitlistStatus string

const (
	WaitlistWaiting WaitlistStatus = "WAITING"
	WaitlistReady   WaitlistStatus = "READY"
	WaitlistSeated  WaitlistStatus = "SEATED"
	WaitlistLeft    WaitlistStatus = "LEFT"
	WaitlistExpired WaitlistStatus = "EXPIRED"
)

const (
	WaitlistSourceWeb     = "WEB"
	WaitlistSourceAndroid = "ANDROID"
	WaitlistSourceIOS     = "IOS"
	WaitlistSourceHost    = "HOST"
)

// WaitlistEntry is a place in a venue's virtual queue. Guests join remotely from
// web/mobile when nothing is free; hosts add walk-ins from the stand.
type WaitlistEntry struct {
	ID         string         `json:"id"`
	VenueID    string         `json:"venue_id"`
	UserID     string         `json:"user_id,omitempty"`
	GuestName  string         `json:"guest_name"`
	Phone      string         `json:"phone,omitempty"`
	Guests     int            `json:"guests"`
	Zone       string         `json:"zone,omitempty"`
	Note       string         `json:"note,omitempty"`
	Status     WaitlistStatus `json:"status"`
	Source     string         `json:"source"`
	TableID    string         `json:"table_id,omitempty"`
	CreatedAt  time.Time      `json:"created_at"`
	NotifiedAt *time.Time     `json:"notified_at,omitempty"`
	SeatedAt   *time.Time     `json:"seated_at,omitempty"`
	ClosedAt   *time.Time     `json:"closed_at,omitempty"`

	// Enrichment filled on read, not persisted separately.
	Position    int             `json:"position,omitempty"`
	QuotedWait  int             `json:"quoted_wait_min,omitempty"`
	TableNumber int             `json:"table_number,omitempty"`
	VenueName   LocalizedString `json:"venue_name,omitempty"`
}

// WaitlistSummary is the public queue state shown before a guest joins.
type WaitlistSummary struct {
	VenueID    string `json:"venue_id"`
	Waiting    int    `json:"waiting"`
	QuotedWait int    `json:"quoted_wait_min"`
	FreeTables int    `json:"free_tables"`
}
