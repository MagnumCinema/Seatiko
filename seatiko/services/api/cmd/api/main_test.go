package main

import (
	"bytes"
	"encoding/json"
	"image"
	"image/png"
	"io"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"slices"
	"strings"
	"testing"
	"time"

	"github.com/goccy/go-yaml"
	"github.com/seatiko/api/internal/handlers"
	"github.com/seatiko/api/internal/media"
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
		{"address across Moldova", "?city_id=all&q=Stefan+cel+Mare+57&include_google=false", "venue-1", false, 200},
		{"include all translations", "?city_id=all&q=" + url.QueryEscape("Штефан чел Маре 57") + "&include_google=false", "venue-1", false, 200},
		{"combined name and address", "?q=placinte+57&include_google=false", "venue-1", false, 200},
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

func TestAvailabilityEndpoint(t *testing.T) {
	router := newRouter(&handlers.API{UploadDir: t.TempDir(), Store: store.NewMemory()})
	tomorrow := time.Now().In(store.VenueLocation).AddDate(0, 0, 1)
	at := time.Date(tomorrow.Year(), tomorrow.Month(), tomorrow.Day(), 19, 0, 0, 0, store.VenueLocation)
	cases := []struct {
		query  string
		status int
	}{
		{"", 200},
		{"?city_id=all&guests=4", 200},
		{"?at=" + url.QueryEscape(at.Format(time.RFC3339)) + "&guests=2&duration_min=120", 200},
		{"?date=" + tomorrow.Format("2006-01-02"), 200},
		{"?city_id=unknown", 404},
		{"?guests=0", 400},
		{"?guests=abc", 400},
		{"?duration_min=999", 400},
		{"?limit=13", 400},
		{"?window_min=-1", 400},
		{"?at=tomorrow", 400},
		{"?date=2026-13-01", 400},
		{"?date=" + time.Now().AddDate(1, 0, 0).Format("2006-01-02"), 400},
	}
	for _, tc := range cases {
		t.Run(tc.query, func(t *testing.T) {
			res := httptest.NewRecorder()
			router.ServeHTTP(res, httptest.NewRequest(http.MethodGet, "/api/v1/availability"+tc.query, nil))
			if res.Code != tc.status {
				t.Fatalf("status = %d, want %d: %s", res.Code, tc.status, res.Body.String())
			}
			if tc.status != http.StatusOK {
				return
			}
			var data struct {
				Timezone string                     `json:"timezone"`
				Venues   []models.VenueAvailability `json:"venues"`
			}
			if err := json.Unmarshal(res.Body.Bytes(), &data); err != nil {
				t.Fatal(err)
			}
			if data.Timezone != "Europe/Chisinau" || len(data.Venues) != 10 {
				t.Fatalf("timezone %q, %d venues", data.Timezone, len(data.Venues))
			}
		})
	}
}

func authedRequest(router http.Handler, method, path, token string, body io.Reader, contentType string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(method, path, body)
	req.Header.Set("Authorization", "Bearer "+token)
	if contentType != "" {
		req.Header.Set("Content-Type", contentType)
	}
	res := httptest.NewRecorder()
	router.ServeHTTP(res, req)
	return res
}

func TestAvatarAndAccountDeletion(t *testing.T) {
	uploads := t.TempDir()
	api := &handlers.API{UploadDir: uploads, Store: store.NewMemory(), JWTSecret: "test-secret-test-secret",
		Media: media.Local{Dir: uploads, URLPrefix: "/uploads"}}
	router := newRouter(api)
	post := func(path, body string) *httptest.ResponseRecorder {
		res := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodPost, path, strings.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		router.ServeHTTP(res, req)
		return res
	}
	post("/api/v1/auth/register", `{"email":"bye@example.com","password":"secret123","first_name":"Ion"}`)
	login := post("/api/v1/auth/login", `{"email":"bye@example.com","password":"secret123"}`)
	var auth struct{ Token string }
	_ = json.Unmarshal(login.Body.Bytes(), &auth)
	if auth.Token == "" {
		t.Fatalf("login: %s", login.Body.String())
	}

	// Upload: PNG in, 512 JPEG stored, URL on the profile.
	img := image.NewRGBA(image.Rect(0, 0, 900, 600))
	var pngBuf bytes.Buffer
	_ = png.Encode(&pngBuf, img)
	var form bytes.Buffer
	mw := multipart.NewWriter(&form)
	fw, _ := mw.CreateFormFile("file", "me.png")
	_, _ = fw.Write(pngBuf.Bytes())
	_ = mw.Close()
	up := authedRequest(router, http.MethodPost, "/api/v1/me/avatar", auth.Token, &form, mw.FormDataContentType())
	var withAvatar struct{ User models.User }
	_ = json.Unmarshal(up.Body.Bytes(), &withAvatar)
	if up.Code != http.StatusOK || !strings.HasPrefix(withAvatar.User.AvatarURL, "/uploads/avatars/") {
		t.Fatalf("upload %d %s", up.Code, up.Body.String())
	}
	stored := filepath.Join(uploads, strings.TrimPrefix(withAvatar.User.AvatarURL, "/uploads/"))
	if _, err := os.Stat(stored); err != nil {
		t.Fatalf("avatar file missing: %v", err)
	}

	// SVG disguised as PNG is refused.
	form.Reset()
	mw = multipart.NewWriter(&form)
	fw, _ = mw.CreateFormFile("file", "evil.png")
	_, _ = fw.Write([]byte(`<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>`))
	_ = mw.Close()
	if res := authedRequest(router, http.MethodPost, "/api/v1/me/avatar", auth.Token, &form, mw.FormDataContentType()); res.Code != http.StatusUnsupportedMediaType {
		t.Fatalf("svg upload = %d", res.Code)
	}

	if res := authedRequest(router, http.MethodDelete, "/api/v1/me/avatar", auth.Token, nil, ""); res.Code != http.StatusOK {
		t.Fatalf("delete avatar = %d", res.Code)
	}
	if _, err := os.Stat(stored); !os.IsNotExist(err) {
		t.Fatal("avatar file kept after DELETE /me/avatar")
	}

	if res := authedRequest(router, http.MethodDelete, "/api/v1/me", auth.Token, strings.NewReader(`{"password":"nope"}`), "application/json"); res.Code != http.StatusForbidden {
		t.Fatalf("delete with wrong password = %d", res.Code)
	}
	if res := authedRequest(router, http.MethodDelete, "/api/v1/me", auth.Token, strings.NewReader(`{"password":"secret123"}`), "application/json"); res.Code != http.StatusOK {
		t.Fatalf("delete account = %d %s", res.Code, res.Body.String())
	}
	if res := authedRequest(router, http.MethodGet, "/api/v1/me", auth.Token, nil, ""); res.Code != http.StatusUnauthorized || !strings.Contains(res.Body.String(), "account_deleted") {
		t.Fatalf("old token after deletion = %d %s", res.Code, res.Body.String())
	}
	if res := post("/api/v1/auth/login", `{"email":"bye@example.com","password":"secret123"}`); res.Code == http.StatusOK {
		t.Fatal("deleted account can sign in")
	}
}

func TestMapPlacesFilterCounts(t *testing.T) {
	router := newRouter(&handlers.API{UploadDir: t.TempDir(), Store: store.NewMemory()})
	get := func(q string) models.MapPlacesResponse {
		res := httptest.NewRecorder()
		router.ServeHTTP(res, httptest.NewRequest(http.MethodGet, "/api/v1/map/places?include_google=false"+q, nil))
		var data models.MapPlacesResponse
		_ = json.Unmarshal(res.Body.Bytes(), &data)
		return data
	}
	if get("").Filters != nil {
		t.Fatal("filters block without /discover params")
	}
	moldovan := get("&cuisine=moldovan")
	if moldovan.Filters == nil || moldovan.Filters.Total != 10 || moldovan.Filters.Matched < 1 || moldovan.Filters.Matched >= 10 {
		t.Fatalf("moldovan counts %+v", moldovan.Filters)
	}
	if len(moldovan.Places) != 10 {
		t.Fatal("counts must not change the place list")
	}
	impossible := get("&cuisine=mexican")
	if impossible.Filters.Matched != 0 || impossible.Filters.Relax == nil || impossible.Filters.Relax.Filter != "cuisine" {
		t.Fatalf("empty state hint %+v", impossible.Filters)
	}
}
