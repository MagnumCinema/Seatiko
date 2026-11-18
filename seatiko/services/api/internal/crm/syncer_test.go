package crm

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"slices"
	"testing"
	"time"

	"github.com/seatiko/api/internal/models"
	"github.com/seatiko/api/internal/store"
)

func TestReconcileProjectsRealGuests(t *testing.T) {
	seatiko := store.NewMemory()
	guest, err := seatiko.Register("guest@example.com", "real-guest-password", "Real", "Guest", "en", models.RoleGuest)
	if err != nil {
		t.Fatal(err)
	}
	var projected []string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		switch {
		case r.Method == http.MethodGet:
			_, _ = io.WriteString(w, `{"data":[]}`)
		case r.Method == http.MethodPost && r.URL.Path == "/rest/people":
			var record struct {
				SeatikoID string `json:"seatikoUserId"`
			}
			if err := json.NewDecoder(r.Body).Decode(&record); err != nil {
				t.Error(err)
				w.WriteHeader(http.StatusBadRequest)
				return
			}
			projected = append(projected, record.SeatikoID)
			_, _ = io.WriteString(w, `{"data":{"createPerson":{"id":"synced-person"}}}`)
		default:
			t.Errorf("unexpected CRM request %s %s", r.Method, r.URL.Path)
			w.WriteHeader(http.StatusBadRequest)
		}
	}))
	defer server.Close()

	syncer := NewSyncer(NewClient(server.URL, "test-key"), seatiko, "", 0)
	syncer.schemaReady = true
	syncer.workspaceReady = true
	if err := syncer.Reconcile(t.Context()); err != nil {
		t.Fatal(err)
	}
	if !slices.Equal(projected, []string{guest.ID}) {
		t.Fatalf("expected only the registered guest in Twenty, got %v", projected)
	}
}

func TestCompanyPipelineRestoresSeatikoStageWithoutChangingProfile(t *testing.T) {
	data := store.NewMemory()
	owner, err := data.Register("pipeline-owner@example.com", "test-password", "Owner", "Test", "ru", models.RoleRestaurant)
	if err != nil {
		t.Fatal(err)
	}
	application, err := data.CreateApplication(owner.ID)
	if err != nil {
		t.Fatal(err)
	}
	city, _ := data.GetCity(application.CityID)
	var patches []map[string]any
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPatch || r.URL.Path != "/rest/companies/company-1" {
			t.Errorf("unexpected request %s %s", r.Method, r.URL.Path)
			w.WriteHeader(http.StatusBadRequest)
			return
		}
		var payload map[string]any
		if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
			t.Error(err)
		}
		patches = append(patches, payload)
		_, _ = io.WriteString(w, `{}`)
	}))
	defer server.Close()
	syncer := NewSyncer(NewClient(server.URL, "test-key"), data, "", 0)
	records := []map[string]any{{
		"id": "company-1", "seatikoId": application.ID,
		"restaurantStatus": "PUBLISHED", "cityName": city.Name.RO,
		"seatikoUpdatedAt": application.UpdatedAt.Truncate(time.Millisecond).Format(time.RFC3339Nano),
	}}
	if _, err := syncer.syncApplication(t.Context(), records, application, owner); err != nil {
		t.Fatal(err)
	}
	if len(patches) != 1 || len(patches[0]) != 1 || patches[0]["restaurantStatus"] != "DRAFT" {
		t.Fatalf("expected only protected lifecycle repair, got %#v", patches)
	}
	unchanged, _ := data.GetApplication(application.ID)
	if unchanged.Status != models.AppDraft || unchanged.VenueID != nil {
		t.Fatal("CRM kanban changes must never publish a Seatiko restaurant")
	}
}
