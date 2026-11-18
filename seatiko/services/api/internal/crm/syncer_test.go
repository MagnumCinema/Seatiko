package crm

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"slices"
	"testing"

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
	if err := syncer.Reconcile(t.Context()); err != nil {
		t.Fatal(err)
	}
	if !slices.Equal(projected, []string{guest.ID}) {
		t.Fatalf("expected only the registered guest in Twenty, got %v", projected)
	}
}
