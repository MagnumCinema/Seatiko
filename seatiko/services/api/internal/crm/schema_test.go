package crm

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestSchemaUpgradeResumesAfterFailureAndPreservesCustomOptions(t *testing.T) {
	objects := []metadataObject{
		{ID: "person", NameSingular: "person"},
		{ID: "company", NameSingular: "company", Fields: []metadataField{{
			ID: "restaurant-status", Name: "restaurantStatus", Type: "SELECT",
			Options: []map[string]any{
				{"id": "draft-option", "value": "DRAFT", "label": "Наш черновик", "color": "orange", "position": float64(0)},
				{"id": "custom-option", "value": "PAUSED", "label": "Пауза", "color": "grey", "position": float64(1)},
			},
		}}},
		{ID: "task", NameSingular: "task"},
		{ID: "reservation", NameSingular: "reservation"},
	}
	created := map[string]int{}
	mutations := 0
	failed := false
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		if r.Method == http.MethodGet && r.URL.Path == "/rest/metadata/objects" {
			_ = json.NewEncoder(w).Encode(map[string]any{"data": map[string]any{"objects": objects}})
			return
		}
		if r.Method == http.MethodPost && r.URL.Path == "/rest/metadata/fields" {
			var input struct {
				ObjectID string           `json:"objectMetadataId"`
				Name     string           `json:"name"`
				Type     string           `json:"type"`
				Options  []map[string]any `json:"options"`
			}
			if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
				t.Error(err)
				w.WriteHeader(http.StatusBadRequest)
				return
			}
			if input.ObjectID == "task" && input.Name == "seatikoApplicationId" && !failed {
				failed = true
				w.WriteHeader(http.StatusServiceUnavailable)
				_, _ = w.Write([]byte(`{"messages":["temporarily unavailable"]}`))
				return
			}
			for i := range objects {
				if objects[i].ID != input.ObjectID {
					continue
				}
				if _, exists := fieldByName(objects[i], input.Name); exists {
					t.Errorf("attempted duplicate field creation: %s.%s", input.ObjectID, input.Name)
					w.WriteHeader(http.StatusConflict)
					return
				}
				created[input.ObjectID+"."+input.Name]++
				mutations++
				objects[i].Fields = append(objects[i].Fields, metadataField{
					ID: input.ObjectID + "-" + input.Name, Name: input.Name, Type: input.Type, Options: input.Options,
				})
				_, _ = w.Write([]byte(`{}`))
				return
			}
		}
		if r.Method == http.MethodPatch && strings.HasPrefix(r.URL.Path, "/rest/metadata/fields/") {
			var input struct {
				Options []map[string]any `json:"options"`
			}
			if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
				t.Error(err)
				w.WriteHeader(http.StatusBadRequest)
				return
			}
			id := strings.TrimPrefix(r.URL.Path, "/rest/metadata/fields/")
			for i := range objects {
				for j := range objects[i].Fields {
					if objects[i].Fields[j].ID == id {
						objects[i].Fields[j].Options = input.Options
						mutations++
						_, _ = w.Write([]byte(`{}`))
						return
					}
				}
			}
		}
		t.Errorf("unexpected metadata request: %s %s", r.Method, r.URL.Path)
		w.WriteHeader(http.StatusBadRequest)
	}))
	defer server.Close()
	client := NewClient(server.URL, "test-key")
	if err := client.EnsureSeatikoSchema(t.Context()); err == nil {
		t.Fatal("expected the interrupted schema upgrade to report an error")
	}
	for _, name := range []string{"company.cityName", "company.submittedAt", "task.seatikoTaskKey"} {
		if created[name] != 1 {
			t.Fatalf("expected %s to have been created before interruption", name)
		}
	}
	if err := client.EnsureSeatikoSchema(t.Context()); err != nil {
		t.Fatalf("retry should finish the schema upgrade: %v", err)
	}
	writesAfterUpgrade := mutations
	if err := client.EnsureSeatikoSchema(t.Context()); err != nil {
		t.Fatalf("converged schema should remain valid: %v", err)
	}
	if mutations != writesAfterUpgrade {
		t.Fatal("repeated schema initialization performed unnecessary metadata writes")
	}
	for name, count := range created {
		if count != 1 {
			t.Fatalf("field %s was created %d times", name, count)
		}
	}
	autoResolved, exists := fieldByName(objects[2], "seatikoAutoResolved")
	if !exists || autoResolved.Type != "BOOLEAN" {
		t.Fatalf("expected native BOOLEAN for automation state, got %#v", autoResolved)
	}
	status, _ := fieldByName(objects[1], "restaurantStatus")
	values := map[string]map[string]any{}
	for _, option := range status.Options {
		values[fmt.Sprint(option["value"])] = option
	}
	if values["PAUSED"]["id"] != "custom-option" || values["DRAFT"]["label"] != "Наш черновик" || values["DRAFT"]["color"] != "orange" {
		t.Fatalf("schema upgrade replaced custom option settings: %#v", status.Options)
	}
	for _, stage := range []string{"SUBMITTED", "UNDER_REVIEW", "APPROVED", "REJECTED", "PUBLISHED"} {
		if values[stage] == nil {
			t.Fatalf("required stage %s was not added", stage)
		}
	}
}
