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

	"github.com/foodassistant/api/internal/models"
	"github.com/foodassistant/api/internal/store"
)

type webhookEnvelope struct {
	Event     string         `json:"event"`
	Data      map[string]any `json:"data"`
	Timestamp string         `json:"timestamp"`
}

func verifyWebhookSignature(secret, timestamp, signature string, payload []byte) error {
	if secret == "" {
		return errors.New("Twenty webhook secret is not configured")
	}
	if timestamp == "" || signature == "" {
		return errors.New("Twenty webhook signature headers are missing")
	}
	if unix, err := strconv.ParseInt(timestamp, 10, 64); err == nil {
		if delta := time.Since(time.Unix(unix, 0)); delta > 5*time.Minute || delta < -5*time.Minute {
			return errors.New("Twenty webhook timestamp is outside the allowed window")
		}
	} else if parsed, err := time.Parse(time.RFC3339, timestamp); err == nil {
		if delta := time.Since(parsed); delta > 5*time.Minute || delta < -5*time.Minute {
			return errors.New("Twenty webhook timestamp is outside the allowed window")
		}
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

func actorSource(data map[string]any) string {
	for _, field := range []string{"updatedBy", "createdBy"} {
		if source := mapText(mapValue(data, field), "source"); source != "" {
			return strings.ToUpper(source)
		}
	}
	return ""
}

func (s *Syncer) HandleWebhook(payload []byte, signature, signatureTimestamp string) (bool, error) {
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
	if actorSource(event.Data) == "API" {
		return false, nil
	}

	switch event.Event {
	case "person.updated":
		userID := mapText(event.Data, "foodassistantUserId")
		if userID == "" {
			return false, nil
		}
		name := mapValue(event.Data, "name")
		emails := mapValue(event.Data, "emails")
		phones := mapValue(event.Data, "phones")
		_, err := s.store.UpdateUserFromCRM(
			userID,
			mapText(name, "firstName"),
			mapText(name, "lastName"),
			mapText(emails, "primaryEmail"),
			mapText(phones, "primaryPhoneNumber"),
			mapText(event.Data, "foodassistantLocale"),
		)
		if errors.Is(err, store.ErrNotFound) {
			return false, nil
		}
		return err == nil, err

	case "company.updated":
		applicationID := mapText(event.Data, "foodassistantId")
		if applicationID == "" {
			return false, nil
		}
		patch := store.ApplicationUpdate{}
		if value := strings.TrimSpace(mapText(event.Data, "name")); value != "" {
			localized := models.LocalizedString{RU: value, EN: value, RO: value}
			patch.Name = &localized
		}
		if value := mapText(event.Data, "restaurantDescription"); value != "" {
			localized := models.LocalizedString{RU: value, EN: value, RO: value}
			patch.Description = &localized
		}
		if value := mapText(event.Data, "cuisine"); value != "" {
			items := strings.Split(value, ",")
			for index := range items {
				items[index] = strings.TrimSpace(items[index])
			}
			patch.Cuisine = &items
		}
		if value := mapText(event.Data, "openingHours"); value != "" {
			patch.HoursText = &value
		}
		if value := mapText(mapValue(event.Data, "restaurantPhones"), "primaryPhoneNumber"); value != "" {
			patch.Phone = &value
		}
		if value := mapText(mapValue(event.Data, "restaurantEmails"), "primaryEmail"); value != "" {
			patch.Email = &value
		}
		if value := mapText(mapValue(event.Data, "domainName"), "primaryLinkUrl"); value != "" {
			patch.Website = &value
		}
		if value := mapText(event.Data, "cityId"); value != "" {
			patch.CityID = &value
		}
		if value, ok := mapNumber(event.Data, "latitude"); ok {
			patch.Lat = &value
		}
		if value, ok := mapNumber(event.Data, "longitude"); ok {
			patch.Lng = &value
		}
		if value, ok := mapNumber(event.Data, "priceLevel"); ok {
			integer := int(value)
			patch.PriceLevel = &integer
		}
		if value, ok := mapNumber(event.Data, "averageCheckMdl"); ok {
			integer := int(value)
			patch.AverageCheck = &integer
		}
		address := mapValue(event.Data, "address")
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
		reservationID := mapText(event.Data, "foodassistantReservationId")
		status := models.ReservationStatus(mapText(event.Data, "bookingStatus"))
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
