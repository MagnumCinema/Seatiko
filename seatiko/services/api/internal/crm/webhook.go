package crm

import (
	"crypto/hmac"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/seatiko/api/internal/models"
	"github.com/seatiko/api/internal/store"
)

type webhookEnvelope struct {
	// Twenty 1.x used event/data in examples; current Twenty sends
	// eventName/record. Supporting both keeps upgrades backwards compatible.
	Event         string         `json:"event"`
	EventName     string         `json:"eventName"`
	Data          map[string]any `json:"data"`
	Record        map[string]any `json:"record"`
	UpdatedFields []string       `json:"updatedFields"`
	Timestamp     string         `json:"timestamp"`
}

func verifyWebhookSignature(secret, timestamp, signature string, payload []byte) error {
	if secret == "" {
		return errors.New("Twenty webhook secret is not configured")
	}
	if timestamp == "" || signature == "" {
		return errors.New("Twenty webhook signature headers are missing")
	}
	if unix, err := strconv.ParseInt(timestamp, 10, 64); err == nil {
		// Twenty signs webhooks with Date.now(), which is milliseconds. Accept
		// seconds too for older/self-hosted versions.
		webhookTime := time.Unix(unix, 0)
		if unix > 1_000_000_000_000 {
			webhookTime = time.UnixMilli(unix)
		}
		if delta := time.Since(webhookTime); delta > 5*time.Minute || delta < -5*time.Minute {
			return errors.New("Twenty webhook timestamp is outside the allowed window")
		}
	} else if parsed, err := time.Parse(time.RFC3339, timestamp); err == nil {
		if delta := time.Since(parsed); delta > 5*time.Minute || delta < -5*time.Minute {
			return errors.New("Twenty webhook timestamp is outside the allowed window")
		}
	} else {
		return errors.New("invalid Twenty webhook timestamp")
	}

	mac := hmac.New(sha256.New, []byte(secret))
	_, _ = mac.Write([]byte(timestamp))
	_, _ = mac.Write([]byte(":"))
	_, _ = mac.Write(payload)
	expected := mac.Sum(nil)
	received, err := hex.DecodeString(strings.TrimPrefix(signature, "sha256="))
	if err != nil || len(received) != len(expected) || subtle.ConstantTimeCompare(received, expected) != 1 {
		return errors.New("invalid Twenty webhook signature")
	}
	return nil
}

func mapValue(data map[string]any, key string) map[string]any {
	value, _ := data[key].(map[string]any)
	return value
}

func mapText(data map[string]any, key string) string {
	value, _ := data[key].(string)
	return value
}

func mapNumber(data map[string]any, key string) (float64, bool) {
	value, ok := data[key].(float64)
	return value, ok
}

func mapPhone(data map[string]any) string {
	number := strings.TrimSpace(mapText(data, "primaryPhoneNumber"))
	callingCode := strings.TrimSpace(mapText(data, "primaryPhoneCallingCode"))
	if number == "" || strings.HasPrefix(number, "+") || callingCode == "" {
		return number
	}
	return callingCode + number
}

func actorSource(data map[string]any) string {
	for _, field := range []string{"updatedBy", "createdBy"} {
		if source := mapText(mapValue(data, field), "source"); source != "" {
			return strings.ToUpper(source)
		}
	}
	return ""
}

func (s *Syncer) HandleWebhook(payload []byte, signature, signatureTimestamp string) (applied bool, err error) {
	if s == nil {
		return false, errors.New("Twenty CRM integration is disabled")
	}
	if err := verifyWebhookSignature(s.webhookSecret, signatureTimestamp, signature, payload); err != nil {
		return false, err
	}
	var event webhookEnvelope
	if err := json.Unmarshal(payload, &event); err != nil {
		return false, fmt.Errorf("decode Twenty webhook: %w", err)
	}
	defer func() {
		if err == nil {
			now := time.Now().UTC()
			s.statusMu.Lock()
			s.status.LastWebhookAt = &now
			s.statusMu.Unlock()
		}
	}()
	data := event.Data
	if len(data) == 0 {
		data = event.Record
	}
	eventName := event.Event
	if eventName == "" {
		eventName = event.EventName
	}
	if actorSource(data) == "API" {
		return false, nil
	}

	switch eventName {
	case "person.updated":
		userID := mapText(data, "seatikoUserId")
		if userID == "" {
			return false, nil
		}
		name := mapValue(data, "name")
		emails := mapValue(data, "emails")
		phones := mapValue(data, "phones")
		_, err := s.store.UpdateUserFromCRM(
			userID,
			mapText(name, "firstName"),
			mapText(name, "lastName"),
			mapText(emails, "primaryEmail"),
			mapPhone(phones),
			mapText(data, "seatikoLocale"),
		)
		if errors.Is(err, store.ErrNotFound) {
			return false, nil
		}
		return err == nil, err

	case "company.updated":
		applicationID := mapText(data, "seatikoId")
		if applicationID == "" {
			return false, nil
		}
		if event.UpdatedFields != nil {
			// Current Twenty webhooks contain the entire record. Import only
			// changed editable fields so a kanban drag cannot rewrite translations
			// or unrelated profile details from the single-language CRM projection.
			changed := make(map[string]any)
			for _, name := range event.UpdatedFields {
				switch name {
				case "name", "restaurantDescription", "cuisine", "openingHours", "restaurantPhones",
					"restaurantEmails", "domainName", "cityId", "latitude", "longitude", "priceLevel", "averageCheckMdl", "address":
					if value, exists := data[name]; exists {
						changed[name] = value
					}
				}
			}
			data = changed
			if len(data) == 0 {
				// Restore protected lifecycle fields through the normal reconciler.
				s.Trigger()
				return false, nil
			}
		}
		patch := store.ApplicationUpdate{}
		if value := strings.TrimSpace(mapText(data, "name")); value != "" {
			localized := models.LocalizedString{RU: value, EN: value, RO: value}
			patch.Name = &localized
		}
		if value := mapText(data, "restaurantDescription"); value != "" {
			localized := models.LocalizedString{RU: value, EN: value, RO: value}
			patch.Description = &localized
		}
		if value := mapText(data, "cuisine"); value != "" {
			items := strings.Split(value, ",")
			for index := range items {
				items[index] = strings.TrimSpace(items[index])
			}
			patch.Cuisine = &items
		}
		if value := mapText(data, "openingHours"); value != "" {
			patch.HoursText = &value
		}
		if value := mapPhone(mapValue(data, "restaurantPhones")); value != "" {
			patch.Phone = &value
		}
		if value := mapText(mapValue(data, "restaurantEmails"), "primaryEmail"); value != "" {
			patch.Email = &value
		}
		if value := mapText(mapValue(data, "domainName"), "primaryLinkUrl"); value != "" {
			patch.Website = &value
		}
		if value := mapText(data, "cityId"); value != "" {
			patch.CityID = &value
		}
		if value, ok := mapNumber(data, "latitude"); ok {
			patch.Lat = &value
		}
		if value, ok := mapNumber(data, "longitude"); ok {
			patch.Lng = &value
		}
		if value, ok := mapNumber(data, "priceLevel"); ok {
			integer := int(value)
			patch.PriceLevel = &integer
		}
		if value, ok := mapNumber(data, "averageCheckMdl"); ok {
			integer := int(value)
			patch.AverageCheck = &integer
		}
		address := mapValue(data, "address")
		if value := mapText(address, "addressStreet1"); value != "" {
			localized := models.LocalizedString{RU: value, EN: value, RO: value}
			patch.Address = &localized
		}
		_, err := s.store.UpdateApplicationFromCRM(applicationID, patch)
		if errors.Is(err, store.ErrNotFound) {
			return false, nil
		}
		if err == nil {
			s.Trigger()
		}
		return err == nil, err

	case "reservation.updated":
		reservationID := mapText(data, "seatikoReservationId")
		status := models.ReservationStatus(mapText(data, "bookingStatus"))
		if reservationID == "" || status == "" {
			return false, nil
		}
		_, err := s.store.UpdateReservationStatusFromCRM(reservationID, status)
		if errors.Is(err, store.ErrNotFound) {
			return false, nil
		}
		if err == nil {
			s.Trigger()
		}
		return err == nil, err
	}
	return false, nil
}
