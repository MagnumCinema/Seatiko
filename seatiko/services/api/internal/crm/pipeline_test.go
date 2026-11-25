package crm

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestPipelineResumesAfterMetadataFailureWithoutDuplicatingOrResettingLayout(t *testing.T) {
	company := metadataObject{ID: "company", NameSingular: "company"}
	for _, name := range []string{"name", "seatikoId", "restaurantStatus", "cityName", "restaurantPhones", "restaurantEmails", "submittedAt", "rejectReason"} {
		kind := "TEXT"
		if name == "restaurantStatus" {
			kind = "SELECT"
		}
		company.Fields = append(company.Fields, metadataField{ID: name, Name: name, Type: kind})
	}
	var view map[string]any
	writes := map[string]int{}
	failed := false
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		if r.Method == http.MethodGet && r.URL.Path == "/rest/metadata/objects" {
			_ = json.NewEncoder(w).Encode(map[string]any{"data": map[string]any{"objects": []metadataObject{company}}})
			return
		}
		if r.Method != http.MethodPost || r.URL.Path != "/metadata" {
			t.Errorf("unexpected request: %s %s", r.Method, r.URL.Path)
			w.WriteHeader(http.StatusBadRequest)
			return
		}
		var request struct {
			Query     string `json:"query"`
			Variables struct {
				Input map[string]any `json:"input"`
			} `json:"variables"`
		}
		if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
			t.Error(err)
			return
		}
		input := request.Variables.Input
		switch {
		case strings.Contains(request.Query, "query SeatikoPipeline"):
			views := []map[string]any{}
			if view != nil {
				views = append(views, view)
			}
			_ = json.NewEncoder(w).Encode(map[string]any{"data": map[string]any{"getViews": views}})
			return
		case strings.Contains(request.Query, "SeatikoCreatePipeline"):
			if view != nil {
				t.Error("attempted to duplicate pipeline")
			}
			if input["type"] != "KANBAN" || input["mainGroupByFieldMetadataId"] != "restaurantStatus" {
				t.Errorf("incorrect onboarding board: %#v", input)
			}
			view = map[string]any{"id": input["id"], "name": input["name"], "viewFields": []map[string]any{}, "viewGroups": []map[string]any{}, "viewFilters": []map[string]any{}}
			writes["view"]++
			_ = json.NewEncoder(w).Encode(map[string]any{"data": map[string]any{"createView": map[string]any{"id": input["id"]}}})
			return
		case strings.Contains(request.Query, "SeatikoPipelineField"):
			key := "field/" + input["fieldMetadataId"].(string)
			writes[key]++
			view["viewFields"] = append(view["viewFields"].([]map[string]any), input)
		case strings.Contains(request.Query, "SeatikoPipelineGroup"):
			if input["fieldValue"] == "UNDER_REVIEW" && !failed {
				failed = true
				_, _ = w.Write([]byte(`{"errors":[{"message":"migration temporarily unavailable"}]}`))
				return
			}
			key := "group/" + input["fieldValue"].(string)
			writes[key]++
			view["viewGroups"] = append(view["viewGroups"].([]map[string]any), input)
		case strings.Contains(request.Query, "SeatikoPipelineFilter"):
			if input["fieldMetadataId"] != "seatikoId" || input["operand"] != "IS_NOT_EMPTY" {
				t.Errorf("board must include only Seatiko applications: %#v", input)
			}
			writes["filter"]++
			view["viewFilters"] = append(view["viewFilters"].([]map[string]any), input)
		default:
			t.Errorf("unexpected metadata operation: %s", request.Query)
			w.WriteHeader(http.StatusBadRequest)
			return
		}
		_, _ = w.Write([]byte(`{"data":{}}`))
	}))
	defer server.Close()
	client := NewClient(server.URL, "test-key")
	if err := client.EnsureSeatikoPipeline(t.Context()); err == nil {
		t.Fatal("expected a reported metadata failure")
	}
	// A manager reorders a card field and hides an existing column between retries.
	view["viewFields"].([]map[string]any)[0]["position"] = float64(99)
	view["viewGroups"].([]map[string]any)[0]["isVisible"] = false
	if err := client.EnsureSeatikoPipeline(t.Context()); err != nil {
		t.Fatal(err)
	}
	if err := client.EnsureSeatikoPipeline(t.Context()); err != nil {
		t.Fatal(err)
	}
	if len(writes) != 15 {
		t.Fatalf("expected one view, seven fields, six groups and one filter; got %#v", writes)
	}
	for key, count := range writes {
		if count != 1 {
			t.Errorf("%s created %d times", key, count)
		}
	}
	if view["viewFields"].([]map[string]any)[0]["position"] != float64(99) || view["viewGroups"].([]map[string]any)[0]["isVisible"] != false {
		t.Fatal("pipeline initialization overwrote a manager's layout")
	}
}

func TestPipelineRequiresAuthoritativeCompanyStatus(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/rest/metadata/objects" {
			t.Errorf("unexpected mutation before schema validation: %s", r.URL.Path)
		}
		_, _ = w.Write([]byte(`{"data":{"objects":[{"id":"company","nameSingular":"company","fields":[]}]}}`))
	}))
	defer server.Close()
	if err := NewClient(server.URL, "test-key").EnsureSeatikoPipeline(t.Context()); err == nil {
		t.Fatal("expected missing status schema to stop pipeline setup")
	}
}

func TestPipelineReusesGroupsAndFieldsGeneratedByTwenty(t *testing.T) {
	company := metadataObject{ID: "company", NameSingular: "company", Fields: []metadataField{
		{ID: "name", Name: "name", Type: "TEXT"},
		{ID: "status", Name: "restaurantStatus", Type: "SELECT"},
		{ID: "identity", Name: "seatikoId", Type: "TEXT"},
	}}
	var view map[string]any
	groups := []map[string]any{{"id": "blank", "fieldValue": "", "isVisible": true, "position": 0}}
	for i, stage := range []string{"DRAFT", "SUBMITTED", "UNDER_REVIEW", "APPROVED", "REJECTED", "PUBLISHED"} {
		groups = append(groups, map[string]any{"id": stage, "fieldValue": stage, "isVisible": true, "position": i + 1})
	}
	fields := []map[string]any{{"id": "generated-name", "fieldMetadataId": "name", "position": 27}}
	createdGroups, createdFields, createdViews, createdFilters := 0, 0, 0, 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		if r.Method == http.MethodGet && r.URL.Path == "/rest/metadata/objects" {
			_ = json.NewEncoder(w).Encode(map[string]any{"data": map[string]any{"objects": []metadataObject{company}}})
			return
		}
		var request struct {
			Query     string `json:"query"`
			Variables struct {
				Input map[string]any `json:"input"`
			} `json:"variables"`
		}
		if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
			t.Error(err)
			return
		}
		input := request.Variables.Input
		switch {
		case strings.Contains(request.Query, "query SeatikoPipeline"):
			views := []map[string]any{}
			if view != nil {
				views = append(views, view)
			}
			_ = json.NewEncoder(w).Encode(map[string]any{"data": map[string]any{"getViews": views}})
			return
		case strings.Contains(request.Query, "SeatikoCreatePipeline"):
			createdViews++
			view = map[string]any{"id": input["id"], "name": input["name"], "viewFields": fields, "viewGroups": groups, "viewFilters": []map[string]any{}}
			_ = json.NewEncoder(w).Encode(map[string]any{"data": map[string]any{"createView": map[string]any{"id": input["id"]}}})
			return
		case strings.Contains(request.Query, "createViewField("):
			createdFields++
			if input["fieldMetadataId"] == "name" {
				t.Error("duplicated the default card field")
			}
			view["viewFields"] = append(view["viewFields"].([]map[string]any), input)
		case strings.Contains(request.Query, "createViewGroup("):
			createdGroups++
			t.Error("duplicated a status group automatically generated by Twenty")
		case strings.Contains(request.Query, "updateViewGroup("):
			update, _ := input["update"].(map[string]any)
			if input["id"] != "blank" || update["isVisible"] != false {
				t.Errorf("unexpected group update: %#v", input)
			}
			groups[0]["isVisible"] = update["isVisible"]
		case strings.Contains(request.Query, "createViewFilter("):
			createdFilters++
			view["viewFilters"] = append(view["viewFilters"].([]map[string]any), input)
		default:
			t.Errorf("unexpected pipeline operation: %s", request.Query)
		}
		_, _ = w.Write([]byte(`{"data":{}}`))
	}))
	defer server.Close()
	client := NewClient(server.URL, "test-key")
	if err := client.EnsureSeatikoPipeline(t.Context()); err != nil {
		t.Fatal(err)
	}
	groups[1]["isVisible"] = false
	groups[1]["position"] = 99
	if err := client.EnsureSeatikoPipeline(t.Context()); err != nil {
		t.Fatal(err)
	}
	if createdViews != 1 || createdGroups != 0 || createdFields != 1 || createdFilters != 1 {
		t.Fatalf("unexpected metadata writes: views=%d groups=%d fields=%d filters=%d", createdViews, createdGroups, createdFields, createdFilters)
	}
	if fields[0]["position"] != 27 || groups[1]["position"] != 99 || groups[1]["isVisible"] != false {
		t.Fatal("setup overwrote the default field layout or a manager's group settings")
	}
}
