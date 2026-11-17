package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"regexp"
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
