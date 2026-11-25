package crm

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func dashboardTestObjects() []metadataObject {
	var objects []metadataObject
	for _, name := range []string{"company", "reservation"} {
		object := metadataObject{ID: name + "-object", NameSingular: name}
		fields := []string{"id", "seatikoId", "restaurantStatus", "cityName"}
		if name == "reservation" {
			fields = []string{"id", "seatikoReservationId", "bookingStatus"}
		}
		for _, name := range fields {
			object.Fields = append(object.Fields, metadataField{ID: object.ID + "-" + name, Name: name})
		}
		objects = append(objects, object)
	}
	return objects
}

func TestDashboardResumesSetupWithoutDuplicatesOrOverwritingCustomization(t *testing.T) {
	objects := dashboardTestObjects()
	layouts := []dashboardLayout{}
	dashboards := []map[string]any{}
	writes := 0
	failOnce := true
	var configs []map[string]any
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		reply := func(value any) { _ = json.NewEncoder(w).Encode(value) }
		switch r.URL.Path {
		case "/rest/metadata/objects":
			reply(map[string]any{"data": map[string]any{"objects": objects}})
		case "/rest/dashboards":
			if r.Method == http.MethodGet {
				reply(map[string]any{"data": dashboards})
				return
			}
			var input map[string]any
			if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
				t.Error(err)
			}
			if len(dashboards) > 0 {
				t.Error("duplicate dashboard creation")
			}
			dashboards = append(dashboards, input)
			writes++
			reply(map[string]any{"data": map[string]any{"createDashboard": input}})
		case "/metadata":
			var input struct {
				Query     string                    `json:"query"`
				Variables map[string]map[string]any `json:"variables"`
			}
			if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
				t.Error(err)
			}
			payload := input.Variables["input"]
			switch {
			case strings.Contains(input.Query, "getPageLayouts"):
				reply(map[string]any{"data": map[string]any{"getPageLayouts": layouts}})
			case strings.Contains(input.Query, "createPageLayoutWidget"):
				position, ok := payload["position"].(map[string]any)
				if !ok || position["layoutMode"] != "GRID" {
					t.Errorf("widget requires the pinned Twenty GRID position input: %#v", payload)
				}
				if _, unsupported := payload["gridPosition"]; unsupported {
					t.Error("pinned Twenty API does not accept gridPosition")
				}
				if len(configs) == 2 && failOnce {
					failOnce = false
					reply(map[string]any{"errors": []any{map[string]any{"message": "temporary migration failure"}}})
					return
				}
				configuration := payload["configuration"].(map[string]any)
				configs = append(configs, configuration)
				widget := dashboardWidget{ID: fmt.Sprintf("widget-%d", len(configs)), Title: payload["title"].(string)}
				layouts[0].Tabs[0].Widgets = append(layouts[0].Tabs[0].Widgets, widget)
				writes++
				reply(map[string]any{"data": map[string]any{"createPageLayoutWidget": widget}})
			case strings.Contains(input.Query, "createPageLayoutTab"):
				tab := dashboardTab{ID: "tab-1", Title: payload["title"].(string)}
				layouts[0].Tabs = append(layouts[0].Tabs, tab)
				writes++
				reply(map[string]any{"data": map[string]any{"createPageLayoutTab": tab}})
			case strings.Contains(input.Query, "createPageLayout"):
				layout := dashboardLayout{ID: "layout-1", Name: payload["name"].(string)}
				layouts = append(layouts, layout)
				writes++
				reply(map[string]any{"data": map[string]any{"createPageLayout": layout}})
			default:
				t.Errorf("unexpected GraphQL query: %s", input.Query)
				w.WriteHeader(400)
			}
		default:
			t.Errorf("unexpected request: %s %s", r.Method, r.URL.Path)
			w.WriteHeader(400)
		}
	}))
	defer server.Close()
	client := NewClient(server.URL, "test-key")
	if err := client.EnsureSeatikoDashboard(t.Context()); err == nil {
		t.Fatal("expected interrupted widget initialization to report an error")
	}
	if err := client.EnsureSeatikoDashboard(t.Context()); err != nil {
		t.Fatal(err)
	}
	if len(layouts) != 1 || len(layouts[0].Tabs) != 1 || len(configs) != 5 || len(dashboards) != 1 {
		t.Fatalf("incomplete or duplicated setup: %#v, dashboards=%d", layouts, len(dashboards))
	}
	layouts[0].Name = "Моя панель"
	layouts[0].Tabs[0].Widgets = append(layouts[0].Tabs[0].Widgets, dashboardWidget{ID: "custom", Title: "Моя метрика"})
	before := writes
	if err := client.EnsureSeatikoDashboard(t.Context()); err != nil {
		t.Fatal(err)
	}
	if writes != before {
		t.Fatalf("reinitialization wrote %d records", writes-before)
	}
	for _, config := range configs {
		filter := config["filter"].(map[string]any)
		recordFilter := filter["recordFilters"].([]any)[0].(map[string]any)
		if recordFilter["operand"] != "IS_NOT_EMPTY" || !strings.Contains(recordFilter["fieldMetadataId"].(string), "seatiko") {
			t.Fatalf("dashboard includes unlinked CRM records: %#v", config)
		}
		if config["timezone"] != "Europe/Chisinau" {
			t.Fatalf("unexpected timezone: %#v", config)
		}
	}
}

func TestDashboardRequiresConfiguredFields(t *testing.T) {
	objects := dashboardTestObjects()
	objects[0].Fields = objects[0].Fields[:len(objects[0].Fields)-1]
	_, err := seatikoDashboardWidgets(map[string]metadataObject{"company": objects[0], "reservation": objects[1]})
	if err == nil || !strings.Contains(err.Error(), "cityName") {
		t.Fatalf("expected missing city field error, got %v", err)
	}
}
