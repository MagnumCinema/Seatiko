package crm

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"testing"
	"time"

	"github.com/seatiko/api/internal/models"
	"github.com/seatiko/api/internal/store"
)

func webhookSignature(secret, timestamp string, payload []byte) string {
	mac := hmac.New(sha256.New, []byte(secret))
	_, _ = mac.Write([]byte(timestamp + ":"))
	_, _ = mac.Write(payload)
	return hex.EncodeToString(mac.Sum(nil))
}

func TestCompanyWebhookAppliesSafeRestaurantFields(t *testing.T) {
	dataStore := store.NewMemory()
	owner, err := dataStore.Register("owner@example.com", "secret123", "Owner", "User", "ru", models.RoleRestaurant)
	if err != nil {
		t.Fatal(err)
	}
	application, err := dataStore.CreateApplication(owner.ID)
	if err != nil {
		t.Fatal(err)
	}

	secret := "test-webhook-secret"
	syncer := NewSyncer(nil, dataStore, secret, time.Minute)
	// Current Twenty releases use millisecond timestamps and the
	// eventName/record envelope.
	timestamp := fmt.Sprintf("%d", time.Now().UnixMilli())
	payload := []byte(fmt.Sprintf(`{"eventName":"company.updated","record":{"seatikoId":%q,"name":"CRM Restaurant","cuisine":"moldovan, european","averageCheckMdl":420,"updatedBy":{"source":"MANUAL"}},"eventDate":%q}`, application.ID, time.Now().UTC().Format(time.RFC3339)))
	applied, err := syncer.HandleWebhook(payload, webhookSignature(secret, timestamp, payload), timestamp)
	if err != nil {
		t.Fatalf("handle webhook: %v", err)
	}
	if !applied {
		t.Fatal("expected webhook to be applied")
	}
	updated, err := dataStore.GetApplication(application.ID)
	if err != nil {
		t.Fatal(err)
	}
	if updated.Name.RU != "CRM Restaurant" || updated.AverageCheck != 420 {
		t.Fatalf("unexpected CRM projection: %#v", updated)
	}
	if updated.Status != models.AppDraft {
		t.Fatalf("CRM webhook changed protected lifecycle status to %s", updated.Status)
	}
}

func TestWebhookRejectsBadSignatureAndIgnoresAPIEcho(t *testing.T) {
	dataStore := store.NewMemory()
	syncer := NewSyncer(nil, dataStore, "secret", time.Minute)
	timestamp := fmt.Sprintf("%d", time.Now().Unix())
	payload := []byte(`{"event":"company.updated","data":{"updatedBy":{"source":"API"}}}`)
	if _, err := syncer.HandleWebhook(payload, "bad", timestamp); err == nil {
		t.Fatal("expected bad signature to be rejected")
	}
	applied, err := syncer.HandleWebhook(payload, webhookSignature("secret", timestamp, payload), timestamp)
	if err != nil {
		t.Fatal(err)
	}
	if applied {
		t.Fatal("API-originated webhook must be ignored to prevent a sync loop")
	}
}

func TestCompanyWebhookImportsOnlyChangedFields(t *testing.T) {
	for _, test := range []struct {
		name          string
		updatedFields []string
		wantApplied   bool
		wantPhone     string
	}{
		{name: "stage-only", updatedFields: []string{"restaurantStatus", "updatedBy"}, wantPhone: "+37369111111"},
		{name: "phone-only", updatedFields: []string{"restaurantPhones", "updatedBy"}, wantApplied: true, wantPhone: "+37369222222"},
		{name: "empty-fields", updatedFields: []string{}, wantPhone: "+37369111111"},
	} {
		t.Run(test.name, func(t *testing.T) {
			dataStore := store.NewMemory()
			owner, err := dataStore.Register("owner-fields@example.com", "test-password", "Owner", "User", "ru", models.RoleRestaurant)
			if err != nil {
				t.Fatal(err)
			}
			application, err := dataStore.CreateApplication(owner.ID)
			if err != nil {
				t.Fatal(err)
			}
			name := models.LocalizedString{RU: "Название", EN: "Name", RO: "Nume"}
			description := models.LocalizedString{RU: "Описание", EN: "Description", RO: "Descriere"}
			address := models.LocalizedString{RU: "Адрес", EN: "Address", RO: "Adresă"}
			phone := "+37369111111"
			application, err = dataStore.UpdateApplication(owner.ID, application.ID, store.ApplicationUpdate{
				Name: &name, Description: &description, Address: &address, Phone: &phone,
			})
			if err != nil {
				t.Fatal(err)
			}
			secret := "field-filter-secret"
			syncer := NewSyncer(NewClient("http://unused.invalid", "test-key"), dataStore, secret, time.Minute)
			payload, err := json.Marshal(map[string]any{
				"eventName": "company.updated", "updatedFields": test.updatedFields,
				"record": map[string]any{
					"seatikoId": application.ID, "restaurantStatus": "PUBLISHED",
					"name": "Название", "restaurantDescription": "Описание",
					"address":          map[string]any{"addressStreet1": "Адрес"},
					"restaurantPhones": map[string]any{"primaryPhoneNumber": "69222222", "primaryPhoneCallingCode": "+373"},
					"updatedBy":        map[string]any{"source": "MANUAL"},
				},
			})
			if err != nil {
				t.Fatal(err)
			}
			timestamp := fmt.Sprintf("%d", time.Now().UnixMilli())
			applied, err := syncer.HandleWebhook(payload, webhookSignature(secret, timestamp, payload), timestamp)
			if err != nil {
				t.Fatal(err)
			}
			if applied != test.wantApplied {
				t.Fatalf("applied = %v, want %v", applied, test.wantApplied)
			}
			updated, err := dataStore.GetApplication(application.ID)
			if err != nil {
				t.Fatal(err)
			}
			if updated.Name != name || updated.Description != description || updated.Address != address {
				t.Fatal("unrelated multilingual profile fields were rewritten")
			}
			if updated.Status != models.AppDraft || updated.Phone != test.wantPhone {
				t.Fatalf("unexpected profile update: status %s, phone %s", updated.Status, updated.Phone)
			}
			if !test.wantApplied && !updated.UpdatedAt.Equal(application.UpdatedAt) {
				t.Fatal("a protected or empty update changed the source modification time")
			}
			select {
			case <-syncer.trigger:
			default:
				t.Fatal("expected reconciliation to restore protected projections")
			}
		})
	}
}
