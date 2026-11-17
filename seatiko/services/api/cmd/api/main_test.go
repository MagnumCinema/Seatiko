package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"slices"
	"strings"
	"testing"

	"github.com/goccy/go-yaml"
	"github.com/seatiko/api/internal/handlers"
	"github.com/seatiko/api/internal/models"
	"github.com/seatiko/api/internal/places"
	"github.com/seatiko/api/internal/store"
)

func TestOpenAPICoversRegisteredRoutes(t *testing.T) {
	router := newRouter(&handlers.API{UploadDir: t.TempDir()})
	res := httptest.NewRecorder()
	router.ServeHTTP(res, httptest.NewRequest(http.MethodGet, "/api/openapi.yaml", nil))
	if res.Code != http.StatusOK {
		t.Fatalf("OpenAPI returned %d", res.Code)
	}
	var spec struct {
		Paths map[string]map[string]any
	}
	if err := yaml.Unmarshal(res.Body.Bytes(), &spec); err != nil {
		t.Fatal(err)
	}
	pathParameter := regexp.MustCompile(`:([a-zA-Z0-9]+)`)
	for _, route := range router.Routes() {
		if route.Path != "/healthz" && !strings.HasPrefix(route.Path, "/api/v1/") {
			continue
		}
		path := pathParameter.ReplaceAllString(route.Path, "{$1}")
		if _, exists := spec.Paths[path][strings.ToLower(route.Method)]; !exists {
			t.Errorf("OpenAPI missing %s %s", route.Method, path)
		}
		delete(spec.Paths[path], strings.ToLower(route.Method))
		if len(spec.Paths[path]) == 0 {
			delete(spec.Paths, path)
		}
	}
	for path := range spec.Paths {
		t.Errorf("OpenAPI lists an unregistered operation for %s", path)
	}
}

func TestMapAreaSelection(t *testing.T) {
	router := newRouter(&handlers.API{UploadDir: t.TempDir(), Store: store.NewMemory()})
	cases := []struct {
		query  string
		status int
		count  int
	}{
		{"?city_id=city-balti", 200, 10},
		{"?city_id=city-chisinau", 200, 0},
		{"?city_id=all", 200, 10},
		{"?city_id=all&bounds=46.92,28.72,47.12,29.02", 200, 0},
		{"?city_id=all&bounds=NaN,10,40,12", 400, 0},
		{"?city_id=all&bounds=10,10,12,12", 400, 0},
		{"?city_id=unknown", 404, 0},
	}
	for _, tc := range cases {
		t.Run(tc.query, func(t *testing.T) {
			res := httptest.NewRecorder()
			router.ServeHTTP(res, httptest.NewRequest(http.MethodGet, "/api/v1/map/places"+tc.query, nil))
			if res.Code != tc.status {
				t.Fatalf("status = %d, want %d", res.Code, tc.status)
			}
			if tc.status != http.StatusOK {
				return
			}
			var data models.MapPlacesResponse
			if err := json.Unmarshal(res.Body.Bytes(), &data); err != nil {
				t.Fatal(err)
			}
			if len(data.Places) != tc.count || data.Source.GoogleStatus != "disabled" || data.Country != "MD" {
				t.Fatalf("map returned %d places, provider %s, country %s", len(data.Places), data.Source.GoogleStatus, data.Country)
			}
		})
	}
}

func TestPublicMapConfigReloadsBrowserKey(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "google.env")
	api := &handlers.API{
		Store: store.NewMemory(), UploadDir: dir,
		Maps: places.NewIntegration(path, places.Credentials{}),
	}
	router := newRouter(api)
	getConfig := func(wantBrowserKey string) {
		t.Helper()
		res := httptest.NewRecorder()
		router.ServeHTTP(res, httptest.NewRequest(http.MethodGet, "/api/v1/map/config", nil))
		if res.Code != http.StatusOK || res.Header().Get("Cache-Control") != "no-store" {
			t.Fatalf("unexpected response status %d, Cache-Control %q", res.Code, res.Header().Get("Cache-Control"))
		}
		var config struct {
			BrowserKey string `json:"google_maps_key"`
		}
		if err := json.Unmarshal(res.Body.Bytes(), &config); err != nil {
			t.Fatal(err)
		}
		if config.BrowserKey != wantBrowserKey || strings.Contains(res.Body.String(), "server-key-for-tests") {
			t.Fatal("expected only the current browser key in the public response")
		}
	}
	getConfig("")
	if err := os.WriteFile(path, []byte("GOOGLE_PLACES_API_KEY=server-key-for-tests\nGOOGLE_MAPS_BROWSER_KEY=browser-key-for-tests\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	getConfig("browser-key-for-tests")
}

func TestMapSearchAndBookingFilter(t *testing.T) {
	router := newRouter(&handlers.API{
		Store: store.NewMemory(), UploadDir: t.TempDir(),
		Maps: places.NewIntegration("", places.Credentials{PlacesKey: "would-call-google"}),
	})
	cases := []struct {
		name  string
		query string
		ids   string
		only  bool
		code  int
	}{
		{"name in city", "?city_id=city-balti&q=LA+placinte&include_google=false", "venue-1", false, 200},
		{"address across Moldova", "?city_id=all&q=Independentei+45&include_google=false", "venue-1", false, 200},
		{"include all translations", "?city_id=all&q=" + url.QueryEscape("Независимости 45") + "&include_google=false", "venue-1", false, 200},
		{"combined name and address", "?q=placinte+45&include_google=false", "venue-1", false, 200},
		{"wrong area", "?bounds=47.78,27.84,47.82,28.02&q=placinte&include_google=false", "", false, 200},
		{"bookable in Moldova", "?city_id=all&bookable_only=true", "venue-1,venue-2,venue-3", true, 200},
		{"seatiko place without tables", "?q=wine+house&bookable_only=true", "", true, 200},
		{"invalid toggle", "?bookable_only=maybe", "", false, 400},
		{"too long", "?q=" + url.QueryEscape(strings.Repeat("ș", 101)), "", false, 400},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			res := httptest.NewRecorder()
			router.ServeHTTP(res, httptest.NewRequest(http.MethodGet, "/api/v1/map/places"+tc.query, nil))
			if res.Code != tc.code {
				t.Fatalf("status = %d, want %d", res.Code, tc.code)
			}
			if res.Code != http.StatusOK {
				return
			}
			var data models.MapPlacesResponse
			if err := json.Unmarshal(res.Body.Bytes(), &data); err != nil {
				t.Fatal(err)
			}
			ids := make([]string, 0, len(data.Places))
			for _, place := range data.Places {
				if tc.only && (!place.InDatabase || !place.Bookable) {
					t.Fatalf("found a result with booking unavailable: %s", place.ID)
				}
				ids = append(ids, place.ID)
			}
			slices.Sort(ids)
			if strings.Join(ids, ",") != tc.ids || data.Source.DatabaseCount != len(ids) ||
				data.Source.GoogleStatus != "not_requested" || data.Places == nil {
				t.Fatalf("unexpected map response: ids=%v, source=%+v", ids, data.Source)
			}
		})
	}
}
