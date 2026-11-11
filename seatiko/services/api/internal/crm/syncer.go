package crm

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"strings"
	"sync"
	"time"

	"github.com/seatiko/api/internal/models"
	"github.com/seatiko/api/internal/store"
)

type Status struct {
	Enabled       bool       `json:"enabled"`
	Healthy       bool       `json:"healthy"`
	Running       bool       `json:"running"`
	LastSuccessAt *time.Time `json:"last_success_at,omitempty"`
	LastErrorAt   *time.Time `json:"last_error_at,omitempty"`
	LastError     string     `json:"last_error,omitempty"`
}

type Syncer struct {
	client        *Client
	store         *store.MemoryStore
	webhookSecret string
	interval      time.Duration
	trigger       chan struct{}
	reconcileMu   sync.Mutex
	statusMu      sync.RWMutex
	status        Status
}

func NewSyncer(client *Client, dataStore *store.MemoryStore, webhookSecret string, interval time.Duration) *Syncer {
	if interval <= 0 {
		interval = 15 * time.Second
	}
	return &Syncer{
		client:        client,
		store:         dataStore,
		webhookSecret: webhookSecret,
		interval:      interval,
		trigger:       make(chan struct{}, 1),
		status:        Status{Enabled: client != nil},
	}
}

func (s *Syncer) Status() Status {
	s.statusMu.RLock()
	defer s.statusMu.RUnlock()
	return s.status
}

func (s *Syncer) Trigger() {
	if s == nil || s.client == nil {
		return
	}
	select {
	case s.trigger <- struct{}{}:
	default:
	}
}

func (s *Syncer) Run(ctx context.Context) {
	if s == nil || s.client == nil {
		return
	}
	s.reconcileAndRecord(ctx)
	ticker := time.NewTicker(s.interval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			s.reconcileAndRecord(ctx)
		case <-s.trigger:
			s.reconcileAndRecord(ctx)
		}
	}
}

func (s *Syncer) reconcileAndRecord(ctx context.Context) {
	err := s.Reconcile(ctx)
	now := time.Now().UTC()
	s.statusMu.Lock()
	s.status.Running = false
	if err != nil {
		s.status.Healthy = false
		s.status.LastError = err.Error()
		s.status.LastErrorAt = &now
		log.Printf("Twenty CRM reconciliation failed: %v", err)
	} else {
		s.status.Healthy = true
		s.status.LastError = ""
		s.status.LastSuccessAt = &now
	}
	s.statusMu.Unlock()
}

func (s *Syncer) Reconcile(ctx context.Context) error {
	if s == nil || s.client == nil {
		return errors.New("Twenty CRM integration is disabled")
	}
	s.reconcileMu.Lock()
	defer s.reconcileMu.Unlock()
	s.statusMu.Lock()
	s.status.Running = true
	s.statusMu.Unlock()

	if err := s.client.EnsureSeatikoSchema(ctx); err != nil {
		return err
	}

	personIDs := map[string]string{}
	for _, user := range s.store.ListAllUsers() {
		if user.Role == models.RoleAdmin {
			continue
		}
		id, err := s.syncUser(ctx, user)
		if err != nil {
			return fmt.Errorf("sync user %s: %w", user.ID, err)
		}
		personIDs[user.ID] = id
	}

	companyIDs := map[string]string{}
	applications := s.store.ListAllApplications("")
	for _, application := range applications {
		owner, err := s.store.GetUser(application.OwnerUserID)
		if err != nil {
			return fmt.Errorf("load owner for application %s: %w", application.ID, err)
		}
		personID := personIDs[owner.ID]
		if personID == "" {
			personID, err = s.syncUser(ctx, owner)
			if err != nil {
				return fmt.Errorf("sync owner for application %s: %w", application.ID, err)
			}
			personIDs[owner.ID] = personID
		}
		companyID, err := s.syncApplication(ctx, application, owner)
		if err != nil {
			return fmt.Errorf("sync application %s: %w", application.ID, err)
		}
		companyIDs[application.ID] = companyID
		if err := s.client.updateRecord(ctx, "people", personID, map[string]any{"companyId": companyID}); err != nil {
			return fmt.Errorf("link owner %s to restaurant %s: %w", owner.ID, application.ID, err)
		}
	}

	for _, reservation := range s.store.ListAllReservations() {
		application, err := s.store.GetApplicationByVenueID(reservation.VenueID)
		if errors.Is(err, store.ErrNotFound) {
			// Seed/demo venues are not restaurant applications and do not belong in CRM.
			continue
		}
		if err != nil {
			return err
		}
		guest, err := s.store.GetUser(reservation.UserID)
		if err != nil {
			return fmt.Errorf("load reservation guest %s: %w", reservation.UserID, err)
		}
		guestID := personIDs[guest.ID]
		if guestID == "" {
			guestID, err = s.syncUser(ctx, guest)
			if err != nil {
				return fmt.Errorf("sync reservation guest %s: %w", guest.ID, err)
			}
			personIDs[guest.ID] = guestID
		}
		companyID := companyIDs[application.ID]
		if companyID == "" {
			owner, ownerErr := s.store.GetUser(application.OwnerUserID)
			if ownerErr != nil {
				return ownerErr
			}
			companyID, err = s.syncApplication(ctx, application, owner)
			if err != nil {
				return err
			}
			companyIDs[application.ID] = companyID
		}
		if err := s.syncReservation(ctx, reservation, guest, guestID, companyID); err != nil {
			return fmt.Errorf("sync reservation %s: %w", reservation.ID, err)
		}
	}
	return nil
}

func effectiveUpdatedAt(updatedAt, createdAt time.Time) time.Time {
	if !updatedAt.IsZero() {
		return updatedAt.UTC()
	}
	return createdAt.UTC()
}

func phoneValue(phone string) map[string]any {
	phone = strings.TrimSpace(phone)
	number := phone
	countryCode := ""
	callingCode := ""
	if strings.HasPrefix(phone, "+373") {
		number = strings.TrimSpace(strings.TrimPrefix(phone, "+373"))
		countryCode = "MD"
		callingCode = "+373"
	} else if phone != "" && !strings.HasPrefix(phone, "+") {
		countryCode = "MD"
		callingCode = "+373"
	}
	return map[string]any{
		"primaryPhoneNumber":      number,
		"primaryPhoneCountryCode": countryCode,
		"primaryPhoneCallingCode": callingCode,
		"additionalPhones":        []any{},
	}
}

func emailValue(email string) map[string]any {
	return map[string]any{"primaryEmail": strings.TrimSpace(email), "additionalEmails": []any{}}
}

func localizedValue(value models.LocalizedString) string {
	if strings.TrimSpace(value.RU) != "" {
		return strings.TrimSpace(value.RU)
	}
	if strings.TrimSpace(value.RO) != "" {
		return strings.TrimSpace(value.RO)
	}
	return strings.TrimSpace(value.EN)
}

func (s *Syncer) syncUser(ctx context.Context, user models.User) (string, error) {
	payload := map[string]any{
		"name": map[string]any{
			"firstName": user.FirstName,
			"lastName":  user.LastName,
		},
		"emails":                 emailValue(user.Email),
		"phones":                 phoneValue(user.Phone),
		"seatikoUserId":    user.ID,
		"seatikoRole":      strings.ToUpper(user.Role),
		"seatikoLocale":    user.Locale,
		"seatikoUpdatedAt": effectiveUpdatedAt(user.UpdatedAt, user.CreatedAt).Format(time.RFC3339Nano),
	}
	return s.client.upsertRecord(ctx, "people", payload, func(record map[string]any) bool {
		externalID := stringField(record, "seatikoUserId")
		if externalID != "" {
			return externalID == user.ID
		}
		return strings.EqualFold(compositeString(record, "emails", "primaryEmail"), user.Email)
	})
}

func (s *Syncer) syncApplication(ctx context.Context, application models.VenueApplication, owner models.User) (string, error) {
	photoJSON, _ := json.Marshal(application.PhotoURLs)
	payload := map[string]any{
		"name":                   localizedValue(application.Name),
		"seatikoId":        application.ID,
		"restaurantStatus":       string(application.Status),
		"restaurantDescription":  localizedValue(application.Description),
		"cuisine":                strings.Join(application.Cuisine, ", "),
		"openingHours":           application.HoursText,
		"averageCheckMdl":        application.AverageCheck,
		"restaurantPhones":       phoneValue(application.Phone),
		"restaurantEmails":       emailValue(application.Email),
		"latitude":               application.Lat,
		"longitude":              application.Lng,
		"cityId":                 application.CityID,
		"priceLevel":             application.PriceLevel,
		"photoUrls":              string(photoJSON),
		"rejectReason":           application.RejectReason,
		"seatikoUpdatedAt": application.UpdatedAt.UTC().Format(time.RFC3339Nano),
		"address": map[string]any{
			"addressStreet1": localizedValue(application.Address),
			"addressCity":    "Bălți",
			"addressCountry": "MD",
			"addressLat":     application.Lat,
			"addressLng":     application.Lng,
		},
	}
	if application.VenueID != nil {
		payload["venueId"] = *application.VenueID
	} else {
		payload["venueId"] = ""
	}
	if application.Website != "" {
		payload["domainName"] = map[string]any{
			"primaryLinkUrl":   application.Website,
			"primaryLinkLabel": application.Website,
			"secondaryLinks":   []any{},
		}
	}
	return s.client.upsertRecord(ctx, "companies", payload, func(record map[string]any) bool {
		externalID := stringField(record, "seatikoId")
		if externalID != "" {
			return externalID == application.ID
		}
		nameMatches := strings.EqualFold(strings.TrimSpace(stringField(record, "name")), localizedValue(application.Name))
		recordEmail := compositeString(record, "restaurantEmails", "primaryEmail")
		candidateEmail := application.Email
		if candidateEmail == "" {
			candidateEmail = owner.Email
		}
		// A legacy company without an email can be adopted by name. A record
		// with a conflicting email must never be silently merged.
		return nameMatches && (recordEmail == "" || candidateEmail == "" || strings.EqualFold(recordEmail, candidateEmail))
	})
}

func (s *Syncer) syncReservation(ctx context.Context, reservation models.Reservation, guest models.User, guestID, companyID string) error {
	table, err := s.store.GetTable(reservation.TableID)
	if err != nil {
		return err
	}
	source := reservation.Source
	if source == "" {
		source = models.ReservationSourceWeb
	}
	updatedAt := effectiveUpdatedAt(reservation.UpdatedAt, reservation.CreatedAt)
	payload := map[string]any{
		"name":                       fmt.Sprintf("%s · table %d", reservation.ID[:min(8, len(reservation.ID))], table.Number),
		"seatikoReservationId": reservation.ID,
		"seatikoUserId":        reservation.UserID,
		"seatikoVenueId":       reservation.VenueID,
		"seatikoTableId":       reservation.TableID,
		"seatikoUpdatedAt":     updatedAt.Format(time.RFC3339Nano),
		"reservedFor":                reservation.ReservedFor.UTC().Format(time.RFC3339Nano),
		"guests":                     reservation.Guests,
		"tableNumber":                table.Number,
		"guestEmail":                 emailValue(guest.Email),
		"bookingStatus":              string(reservation.Status),
		"source":                     source,
		"restaurantId":               companyID,
		"guestId":                    guestID,
	}
	_, err = s.client.upsertRecord(ctx, "reservations", payload, func(record map[string]any) bool {
		return stringField(record, "seatikoReservationId") == reservation.ID
	})
	return err
}
