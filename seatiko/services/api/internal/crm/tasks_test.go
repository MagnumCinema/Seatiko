package crm

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/seatiko/api/internal/models"
	"github.com/seatiko/api/internal/store"
)

type taskTestCRM struct {
	records      map[string][]map[string]any
	writes       int
	failNextLink bool
}

func (crm *taskTestCRM) serveHTTP(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	parts := strings.Split(strings.Trim(r.URL.Path, "/"), "/")
	if len(parts) < 2 || parts[0] != "rest" {
		http.NotFound(w, r)
		return
	}
	collection := parts[1]
	if r.Method == http.MethodGet {
		_ = json.NewEncoder(w).Encode(map[string]any{"data": crm.records[collection]})
		return
	}
	if collection == "taskTargets" && crm.failNextLink {
		crm.failNextLink = false
		http.Error(w, "temporary failure", http.StatusServiceUnavailable)
		return
	}
	var payload map[string]any
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	crm.writes++
	switch r.Method {
	case http.MethodPost:
		payload["id"] = fmt.Sprintf("%s-%d", collection, len(crm.records[collection])+1)
		crm.records[collection] = append(crm.records[collection], payload)
		_ = json.NewEncoder(w).Encode(map[string]any{"data": map[string]any{"created": payload}})
	case http.MethodPatch:
		for _, record := range crm.records[collection] {
			if len(parts) == 3 && recordID(record) == parts[2] {
				for field, value := range payload {
					record[field] = value
				}
				_, _ = io.WriteString(w, `{}`)
				return
			}
		}
		http.NotFound(w, r)
	default:
		http.Error(w, "unexpected method", http.StatusMethodNotAllowed)
	}
}

func newTaskFixture(t *testing.T) (*Syncer, *taskTestCRM, models.VenueApplication, time.Time) {
	t.Helper()
	data := store.NewMemory()
	owner, err := data.Register("tasks-owner@example.com", "test-password", "Owner", "Test", "ru", models.RoleRestaurant)
	if err != nil {
		t.Fatal(err)
	}
	application, err := data.CreateApplication(owner.ID)
	if err != nil {
		t.Fatal(err)
	}
	now := time.Date(2026, 11, 18, 10, 0, 0, 0, time.UTC)
	application.CreatedAt = now
	application.UpdatedAt = now
	application.Name.RU = "Ресторан"
	crm := &taskTestCRM{records: map[string][]map[string]any{}}
	server := httptest.NewServer(http.HandlerFunc(crm.serveHTTP))
	t.Cleanup(server.Close)
	return NewSyncer(NewClient(server.URL, "test-key"), data, "", 0), crm, application, now
}

func TestOnboardingTaskLifecycleIsIdempotentAndPreservesManualWork(t *testing.T) {
	syncer, crm, application, now := newTaskFixture(t)
	application.Status = models.AppSubmitted
	application.SubmittedAt = &now
	companies := map[string]string{application.ID: "company-1"}
	sync := func(at time.Time) {
		t.Helper()
		if err := syncer.syncOnboardingTasks(t.Context(), []models.VenueApplication{application}, companies, at); err != nil {
			t.Fatal(err)
		}
	}
	sync(now)
	if len(crm.records["tasks"]) != 1 || len(crm.records["taskTargets"]) != 1 {
		t.Fatalf("expected one linked review task, got %#v", crm.records)
	}
	review := crm.records["tasks"][0]
	if review["dueAt"] != now.Add(24*time.Hour).Format(time.RFC3339Nano) {
		t.Fatalf("unexpected review deadline: %v", review["dueAt"])
	}
	review["assigneeId"] = "manager-1"
	review["status"] = "IN_PROGRESS"
	review["bodyV2"] = map[string]any{"markdown": "Заметка менеджера"}
	writes := crm.writes
	sync(now.Add(time.Hour))
	if crm.writes != writes || review["assigneeId"] != "manager-1" || review["bodyV2"].(map[string]any)["markdown"] != "Заметка менеджера" {
		t.Fatal("repeated reconciliation changed a manager's task")
	}
	review["status"] = "DONE" // A human can complete a task while review is pending.
	application.Status = models.AppUnderReview
	sync(now.Add(49 * time.Hour))
	if len(crm.records["tasks"]) != 2 || review["status"] != "DONE" {
		t.Fatal("expected a single escalation and preservation of manually completed review")
	}
	crm.records["tasks"] = append(crm.records["tasks"], map[string]any{"id": "manual", "status": "TODO", "title": "Позвонить"})
	application.Status = models.AppPublished
	sync(now.Add(50 * time.Hour))
	if crm.records["tasks"][1]["status"] != "DONE" || crm.records["tasks"][1]["seatikoAutoResolved"] != true || crm.records["tasks"][2]["status"] != "TODO" {
		t.Fatal("publication must close automation tasks and preserve unrelated tasks")
	}
	resubmittedAt := now.Add(72 * time.Hour)
	application.Status = models.AppSubmitted
	application.SubmittedAt = &resubmittedAt
	sync(resubmittedAt)
	if len(crm.records["tasks"]) != 4 || crm.records["tasks"][3]["status"] != "TODO" {
		t.Fatal("a new submission must create a new review cycle")
	}
}

func TestPhotoTaskGracePeriodAndAutomaticReopening(t *testing.T) {
	syncer, crm, application, now := newTaskFixture(t)
	companies := map[string]string{application.ID: "company-1"}
	sync := func(at time.Time) {
		t.Helper()
		if err := syncer.syncOnboardingTasks(t.Context(), []models.VenueApplication{application}, companies, at); err != nil {
			t.Fatal(err)
		}
	}
	sync(now.Add(23 * time.Hour))
	if len(crm.records["tasks"]) != 0 {
		t.Fatal("new drafts should have time to upload photos")
	}
	sync(now.Add(24 * time.Hour))
	if len(crm.records["tasks"]) != 1 {
		t.Fatal("expected photo follow-up after 24 hours")
	}
	application.PhotoURLs = []string{"https://example.com/photo.jpg"}
	sync(now.Add(25 * time.Hour))
	task := crm.records["tasks"][0]
	if task["status"] != "DONE" || task["seatikoAutoResolved"] != true {
		t.Fatal("uploading photos should automatically resolve the task")
	}
	application.PhotoURLs = nil
	sync(now.Add(26 * time.Hour))
	if len(crm.records["tasks"]) != 1 || task["status"] != "TODO" || task["seatikoAutoResolved"] != false {
		t.Fatal("removing the photos should reopen the existing automation task")
	}
	task["status"] = "DONE"
	sync(now.Add(27 * time.Hour))
	if task["status"] != "DONE" {
		t.Fatal("a manually completed follow-up should stay complete")
	}
	task["seatikoAutoResolved"] = true
	task["status"] = "IN_PROGRESS"
	sync(now.Add(28 * time.Hour))
	if task["status"] != "IN_PROGRESS" || task["seatikoAutoResolved"] != false {
		t.Fatal("a manager's reopened task should keep its active status")
	}
}

func TestOnboardingTaskRetryRepairsRelationWithoutDuplicate(t *testing.T) {
	syncer, crm, application, now := newTaskFixture(t)
	application.Status = models.AppSubmitted
	application.SubmittedAt = &now
	crm.failNextLink = true
	companies := map[string]string{application.ID: "company-1"}
	if err := syncer.syncOnboardingTasks(t.Context(), []models.VenueApplication{application}, companies, now); err == nil {
		t.Fatal("expected the relation failure to be reported")
	}
	if err := syncer.syncOnboardingTasks(t.Context(), []models.VenueApplication{application}, companies, now); err != nil {
		t.Fatal(err)
	}
	if len(crm.records["tasks"]) != 1 || len(crm.records["taskTargets"]) != 1 {
		t.Fatalf("retry should repair the relation, got %#v", crm.records)
	}
}
