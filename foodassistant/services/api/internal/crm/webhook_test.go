package crm

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"testing"
	"time"

	"github.com/foodassistant/api/internal/models"
	"github.com/foodassistant/api/internal/store"
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
	payload := []byte(fmt.Sprintf(`{"eventName":"company.updated","record":{"foodassistantId":%q,"name":"CRM Restaurant","cuisine":"moldovan, european","averageCheckMdl":420,"updatedBy":{"source":"MANUAL"}},"eventDate":%q}`, application.ID, time.Now().UTC().Format(time.RFC3339)))
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
