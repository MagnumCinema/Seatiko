# Landing map places + hero feature cards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace hero floating marketing cards with real product features, and show Google food places on the city map with an explicit `in_database` flag (bookable badge only for FoodAssistant venues).

**Architecture:** Backend merges Google Places nearby food results with published venues into `GET /api/v1/map/places`. Matching is exact `google_place_id` only; missing/`false` `in_database` means not ours. Web `VenueMap` consumes that endpoint with two pin styles + legend + coming-soon popup. Hero cards keep the photo and swap copy via `site-copy`.

**Tech Stack:** Go/Gin API, existing `places.Client` (Google Places API New), Next.js + MapLibre GL, `site-copy` i18n (RU/EN/RO).

**Spec:** `docs/superpowers/specs/2026-09-04-landing-map-places-design.md`

---

## File map

| File | Responsibility |
|---|---|
| `foodassistant/services/api/internal/models/map_place.go` | `MapPlace` + `MapPlacesResponse` JSON types |
| `foodassistant/services/api/internal/places/normalize.go` | Strip `places/` prefix from Google IDs |
| `foodassistant/services/api/internal/places/nearby.go` | `SearchNearbyFood` + in-memory TTL cache |
| `foodassistant/services/api/internal/places/merge.go` | Pure merge: venues + Google → `[]MapPlace` |
| `foodassistant/services/api/internal/places/merge_test.go` | Unit tests for normalize + merge |
| `foodassistant/services/api/internal/places/nearby_test.go` | Cache key / disabled client tests |
| `foodassistant/services/api/internal/handlers/handlers.go` | `ListMapPlaces` handler |
| `foodassistant/services/api/cmd/api/main.go` | Register `GET /map/places` |
| `foodassistant/apps/web/src/lib/api.ts` | `MapPlace` type + `fetchMapPlaces` |
| `foodassistant/apps/web/src/components/venue-map.tsx` | Pins, legend, popup/panel by `in_database` |
| `foodassistant/apps/web/src/app/premium.css` | Legend + muted pin / badge styles if needed |
| `foodassistant/apps/web/src/lib/site-copy.ts` | Hero feature cards + map body/legend/coming-soon |
| `foodassistant/apps/web/src/app/page.tsx` | Wire new hero card copy keys |
| `docs/MAP_ARCHITECTURE.md` | Document hybrid Google overlay |

---

### Task 1: MapPlace models + ID normalize + merge (TDD)

**Files:**
- Create: `foodassistant/services/api/internal/models/map_place.go`
- Create: `foodassistant/services/api/internal/places/normalize.go`
- Create: `foodassistant/services/api/internal/places/merge.go`
- Create: `foodassistant/services/api/internal/places/merge_test.go`

- [ ] **Step 1: Write failing merge tests**

Create `foodassistant/services/api/internal/places/merge_test.go`:

```go
package places

import (
	"testing"

	"github.com/foodassistant/api/internal/models"
)

func TestNormalizePlaceID(t *testing.T) {
	if got := NormalizePlaceID("places/abc"); got != "abc" {
		t.Fatalf("got %q", got)
	}
	if got := NormalizePlaceID("abc"); got != "abc" {
		t.Fatalf("got %q", got)
	}
	if got := NormalizePlaceID("  places/xyz  "); got != "xyz" {
		t.Fatalf("got %q", got)
	}
}

func TestMergeMapPlaces_MatchesByGooglePlaceID(t *testing.T) {
	venues := []models.Venue{{
		ID:            "venue-1",
		CityID:        "city-balti",
		Name:          models.LocalizedString{RU: "Наш", EN: "Ours", RO: "Al nostru"},
		Address:       models.LocalizedString{RU: "ул. 1"},
		Lat:           47.76,
		Lng:           27.92,
		Rating:        4.8,
		FreeTables:    3,
		OpenNow:       true,
		GooglePlaceID: "places/ChIJmatched",
	}}
	google := []GoogleFoodPlace{{
		ID:       "places/ChIJmatched",
		Name:     "Google Name",
		Address:  "Google Addr",
		Lat:      47.761,
		Lng:      27.921,
		Rating:   4.2,
	}, {
		ID:      "places/ChIJonly-google",
		Name:    "Only Google",
		Address: "Somewhere",
		Lat:     47.77,
		Lng:     27.93,
		Rating:  4.0,
	}}

	out := MergeMapPlaces(venues, google)
	if len(out) != 2 {
		t.Fatalf("len=%d want 2", len(out))
	}

	var matched, external *models.MapPlace
	for i := range out {
		p := &out[i]
		switch NormalizePlaceID(p.GooglePlaceID) {
		case "ChIJmatched":
			matched = p
		case "ChIJonly-google":
			external = p
		}
	}
	if matched == nil || !matched.InDatabase || matched.VenueID != "venue-1" || matched.FreeTables != 3 {
		t.Fatalf("matched=%+v", matched)
	}
	if matched.Name.RU != "Наш" {
		t.Fatalf("prefer venue name, got %q", matched.Name.RU)
	}
	if external == nil || external.InDatabase || external.VenueID != "" {
		t.Fatalf("external=%+v", external)
	}
}

func TestMergeMapPlaces_UnmatchedVenueStillEmitted(t *testing.T) {
	venues := []models.Venue{{
		ID:     "venue-orphan",
		CityID: "city-balti",
		Name:   models.LocalizedString{RU: "Только у нас"},
		Lat:    47.75,
		Lng:    27.91,
	}}
	out := MergeMapPlaces(venues, nil)
	if len(out) != 1 || !out[0].InDatabase || out[0].VenueID != "venue-orphan" {
		t.Fatalf("got %+v", out)
	}
	if out[0].InDatabase != true {
		t.Fatal("in_database must default explicitly to true for DB venues")
	}
}
```

- [ ] **Step 2: Run tests — expect fail**

```bash
docker run --rm -v "/Users/cristianchilat/WebstormProjects/Virtual-restaurant-/foodassistant/services/api:/src" -w /src golang:1.25-alpine go test ./internal/places/ -count=1
```

Expected: FAIL (missing types/functions).

- [ ] **Step 3: Implement models + normalize + merge**

`foodassistant/services/api/internal/models/map_place.go`:

```go
package models

type MapPlace struct {
	ID             string          `json:"id"`
	Name           LocalizedString `json:"name"`
	Lat            float64         `json:"lat"`
	Lng            float64         `json:"lng"`
	Address        LocalizedString `json:"address"`
	Rating         float64         `json:"rating,omitempty"`
	GooglePlaceID  string          `json:"google_place_id,omitempty"`
	InDatabase     bool            `json:"in_database"`
	VenueID        string          `json:"venue_id,omitempty"`
	FreeTables     int             `json:"free_tables,omitempty"`
	OpenNow        *bool           `json:"open_now,omitempty"`
	Cuisine        []string        `json:"cuisine,omitempty"`
	PriceLevel     int             `json:"price_level,omitempty"`
	AverageCheck   int             `json:"average_check,omitempty"`
	Website        string          `json:"website,omitempty"`
}

type MapPlacesResponse struct {
	CityID  string `json:"city_id"`
	Center  struct {
		Lat float64 `json:"lat"`
		Lng float64 `json:"lng"`
	} `json:"center"`
	Places []MapPlace `json:"places"`
	Source struct {
		GoogleEnabled  bool `json:"google_enabled"`
		GoogleCount    int  `json:"google_count"`
		DatabaseCount  int  `json:"database_count"`
	} `json:"source"`
}
```

`foodassistant/services/api/internal/places/normalize.go`:

```go
package places

import "strings"

func NormalizePlaceID(id string) string {
	id = strings.TrimSpace(id)
	return strings.TrimPrefix(id, "places/")
}
```

`foodassistant/services/api/internal/places/merge.go`:

```go
package places

import "github.com/foodassistant/api/internal/models"

// GoogleFoodPlace is a minimal nearby-search hit used for map merge.
type GoogleFoodPlace struct {
	ID      string
	Name    string
	Address string
	Lat     float64
	Lng     float64
	Rating  float64
}

func localizedSame(s string) models.LocalizedString {
	return models.LocalizedString{RU: s, EN: s, RO: s}
}

func MergeMapPlaces(venues []models.Venue, google []GoogleFoodPlace) []models.MapPlace {
	byGoogleID := make(map[string]models.Venue, len(venues))
	matchedVenueIDs := make(map[string]struct{}, len(venues))

	for _, v := range venues {
		if id := NormalizePlaceID(v.GooglePlaceID); id != "" {
			byGoogleID[id] = v
		}
	}

	out := make([]models.MapPlace, 0, len(google)+len(venues))
	for _, g := range google {
		gid := NormalizePlaceID(g.ID)
		if gid == "" {
			continue
		}
		if v, ok := byGoogleID[gid]; ok {
			matchedVenueIDs[v.ID] = struct{}{}
			openNow := v.OpenNow
			out = append(out, models.MapPlace{
				ID:            v.ID,
				Name:          v.Name,
				Lat:           v.Lat,
				Lng:           v.Lng,
				Address:       v.Address,
				Rating:        v.Rating,
				GooglePlaceID: gid,
				InDatabase:    true,
				VenueID:       v.ID,
				FreeTables:    v.FreeTables,
				OpenNow:       &openNow,
				Cuisine:       append([]string(nil), v.Cuisine...),
				PriceLevel:    v.PriceLevel,
				AverageCheck:  v.AverageCheck,
				Website:       v.Website,
			})
			continue
		}
		out = append(out, models.MapPlace{
			ID:            "google:" + gid,
			Name:          localizedSame(g.Name),
			Lat:           g.Lat,
			Lng:           g.Lng,
			Address:       localizedSame(g.Address),
			Rating:        g.Rating,
			GooglePlaceID: gid,
			InDatabase:    false,
		})
	}

	for _, v := range venues {
		if _, matched := matchedVenueIDs[v.ID]; matched {
			continue
		}
		openNow := v.OpenNow
		gid := NormalizePlaceID(v.GooglePlaceID)
		out = append(out, models.MapPlace{
			ID:            v.ID,
			Name:          v.Name,
			Lat:           v.Lat,
			Lng:           v.Lng,
			Address:       v.Address,
			Rating:        v.Rating,
			GooglePlaceID: gid,
			InDatabase:    true,
			VenueID:       v.ID,
			FreeTables:    v.FreeTables,
			OpenNow:       &openNow,
			Cuisine:       append([]string(nil), v.Cuisine...),
			PriceLevel:    v.PriceLevel,
			AverageCheck:  v.AverageCheck,
			Website:       v.Website,
		})
	}
	return out
}
```

- [ ] **Step 4: Run tests — expect pass**

Same docker `go test` command as Step 2. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add foodassistant/services/api/internal/models/map_place.go \
  foodassistant/services/api/internal/places/normalize.go \
  foodassistant/services/api/internal/places/merge.go \
  foodassistant/services/api/internal/places/merge_test.go
git commit -m "feat(api): add map place merge with in_database flag"
```

---

### Task 2: Google nearby search + short TTL cache

**Files:**
- Modify: `foodassistant/services/api/internal/places/client.go`
- Create: `foodassistant/services/api/internal/places/nearby.go`
- Create: `foodassistant/services/api/internal/places/nearby_test.go`

- [ ] **Step 1: Write failing test for disabled client**

```go
package places

import "testing"

func TestSearchNearbyFood_Disabled(t *testing.T) {
	c := New("")
	places, err := c.SearchNearbyFood(t.Context(), 47.7622, 27.9289, 4000)
	if err == nil {
		t.Fatal("expected error when disabled")
	}
	if places != nil {
		t.Fatalf("got places=%v", places)
	}
}
```

- [ ] **Step 2: Run test — expect fail** (missing `SearchNearbyFood`)

- [ ] **Step 3: Implement `SearchNearbyFood` with cache**

In `nearby.go`:

```go
package places

import (
	"context"
	"encoding/json"
	"fmt"
	"sync"
	"time"
)

type nearbyCacheEntry struct {
	at     time.Time
	places []GoogleFoodPlace
}

var (
	nearbyMu    sync.Mutex
	nearbyCache = map[string]nearbyCacheEntry{}
	nearbyTTL   = 10 * time.Minute
)

func nearbyCacheKey(lat, lng, radius float64) string {
	return fmt.Sprintf("%.4f:%.4f:%.0f", lat, lng, radius)
}

// SearchNearbyFood returns food-related places near lat/lng (Google Places API New).
// Results are cached in-process for nearbyTTL.
func (c *Client) SearchNearbyFood(ctx context.Context, lat, lng, radiusMeters float64) ([]GoogleFoodPlace, error) {
	if !c.Enabled() {
		return nil, fmt.Errorf("places disabled")
	}
	key := nearbyCacheKey(lat, lng, radiusMeters)
	nearbyMu.Lock()
	if entry, ok := nearbyCache[key]; ok && time.Since(entry.at) < nearbyTTL {
		cp := append([]GoogleFoodPlace(nil), entry.places...)
		nearbyMu.Unlock()
		return cp, nil
	}
	nearbyMu.Unlock()

	body := map[string]any{
		"includedTypes": []string{
			"restaurant", "cafe", "bar", "bakery", "meal_takeaway",
		},
		"maxResultCount": 20,
		"locationRestriction": map[string]any{
			"circle": map[string]any{
				"center": map[string]any{"latitude": lat, "longitude": lng},
				"radius": radiusMeters,
			},
		},
		"languageCode": "ru",
	}
	fieldMask := "places.id,places.displayName,places.formattedAddress,places.location,places.rating"
	raw, err := c.post(ctx, "https://places.googleapis.com/v1/places:searchNearby", body, fieldMask)
	if err != nil {
		return nil, err
	}
	var parsed struct {
		Places []struct {
			ID               string  `json:"id"`
			Rating           float64 `json:"rating"`
			FormattedAddress string  `json:"formattedAddress"`
			DisplayName      struct {
				Text string `json:"text"`
			} `json:"displayName"`
			Location struct {
				Latitude  float64 `json:"latitude"`
				Longitude float64 `json:"longitude"`
			} `json:"location"`
		} `json:"places"`
	}
	if err := json.Unmarshal(raw, &parsed); err != nil {
		return nil, err
	}
	out := make([]GoogleFoodPlace, 0, len(parsed.Places))
	for _, p := range parsed.Places {
		out = append(out, GoogleFoodPlace{
			ID:      p.ID,
			Name:    p.DisplayName.Text,
			Address: p.FormattedAddress,
			Lat:     p.Location.Latitude,
			Lng:     p.Location.Longitude,
			Rating:  p.Rating,
		})
	}

	nearbyMu.Lock()
	nearbyCache[key] = nearbyCacheEntry{at: time.Now(), places: append([]GoogleFoodPlace(nil), out...)}
	nearbyMu.Unlock()
	return out, nil
}
```

Note: `post` is already on `Client` in `client.go` and shared.

- [ ] **Step 4: Run `go test ./internal/places/ -count=1` — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add foodassistant/services/api/internal/places/nearby.go \
  foodassistant/services/api/internal/places/nearby_test.go
git commit -m "feat(api): search Google nearby food places with TTL cache"
```

---

### Task 3: `GET /api/v1/map/places` handler

**Files:**
- Modify: `foodassistant/services/api/internal/handlers/handlers.go`
- Modify: `foodassistant/services/api/cmd/api/main.go`

- [ ] **Step 1: Add handler `ListMapPlaces`**

City centers (Bălți only for now):

```go
func (a *API) ListMapPlaces(c *gin.Context) {
	cityID := c.Query("city_id")
	if cityID == "" {
		cityID = "city-balti"
	}
	const (
		baltiLat = 47.7622
		baltiLng = 27.9289
		radiusM  = 4000.0
	)

	venues := a.Store.ListVenues(cityID)
	var googlePlaces []places.GoogleFoodPlace
	googleEnabled := a.Places != nil && a.Places.Enabled()
	if googleEnabled {
		found, err := a.Places.SearchNearbyFood(c.Request.Context(), baltiLat, baltiLng, radiusM)
		if err != nil {
			log.Printf("map places google: %v", err)
			googleEnabled = false
		} else {
			googlePlaces = found
		}
	}

	merged := places.MergeMapPlaces(venues, googlePlaces)
	resp := models.MapPlacesResponse{
		CityID: cityID,
		Places: merged,
	}
	resp.Center.Lat = baltiLat
	resp.Center.Lng = baltiLng
	resp.Source.GoogleEnabled = googleEnabled
	resp.Source.GoogleCount = len(googlePlaces)
	resp.Source.DatabaseCount = len(venues)
	c.JSON(http.StatusOK, resp)
}
```

Add imports for `places` and `models` if not already present in the handler file.

- [ ] **Step 2: Register route in `cmd/api/main.go` next to venues**

```go
v1.GET("/map/places", api.ListMapPlaces)
```

- [ ] **Step 3: Rebuild API and smoke-test**

```bash
cd /Users/cristianchilat/WebstormProjects/Virtual-restaurant-
docker compose up -d --build api
curl -s "http://localhost/api/v1/map/places" | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d["source"]); print(len(d["places"]), "places"); print(sum(1 for p in d["places"] if p["in_database"]), "in_db")'
```

Expected: JSON with `places` array; `in_database` always present; when Google key works, `google_count > 0`.

- [ ] **Step 4: Commit**

```bash
git add foodassistant/services/api/internal/handlers/handlers.go \
  foodassistant/services/api/cmd/api/main.go
git commit -m "feat(api): expose GET /api/v1/map/places"
```

---

### Task 4: Web API client for map places

**Files:**
- Modify: `foodassistant/apps/web/src/lib/api.ts`

- [ ] **Step 1: Add types + fetcher after `VenuePlaces`**

```ts
export type MapPlace = {
  id: string;
  name: LocalizedString;
  lat: number;
  lng: number;
  address: LocalizedString;
  rating?: number;
  google_place_id?: string;
  in_database: boolean;
  venue_id?: string;
  free_tables?: number;
  open_now?: boolean | null;
  cuisine?: string[];
  price_level?: number;
  average_check?: number;
  website?: string;
};

export type MapPlacesResponse = {
  city_id: string;
  center: { lat: number; lng: number };
  places: MapPlace[];
  source: {
    google_enabled: boolean;
    google_count: number;
    database_count: number;
  };
};

export async function fetchMapPlaces(
  cityId = "city-balti",
): Promise<MapPlacesResponse> {
  return apiFetch<MapPlacesResponse>("/api/v1/map/places", {
    auth: false,
    query: { city_id: cityId },
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add foodassistant/apps/web/src/lib/api.ts
git commit -m "feat(web): add fetchMapPlaces client types"
```

---

### Task 5: VenueMap uses map places + dual pin styles

**Files:**
- Modify: `foodassistant/apps/web/src/components/venue-map.tsx`
- Modify: `foodassistant/apps/web/src/app/premium.css` (legend styles)

- [ ] **Step 1: Switch data load from `fetchVenues` to `fetchMapPlaces`**

Replace venue state with `MapPlace[]`. Sort for panel: `in_database` first, then by rating desc / name.

Selection id = `place.id` (venue id or `google:…`).

GeoJSON properties must include:

```ts
{
  placeId: place.id,
  venueId: place.venue_id ?? "",
  inDatabase: place.in_database,
  index: String(index + 1),
  name: pickLocale(place.name, locale),
  selected: place.id === selectedId,
}
```

- [ ] **Step 2: Dual pin colors**

Update `VENUE_LAYER_ID` paint `circle-color` case:

- selected → `#d77b48` (keep)
- `inDatabase` true → `#175f43`
- else → `#8a8f8c` (muted)

Add a small symbol layer or text badge for bookable pins only, e.g. filter `["==", ["get", "inDatabase"], true]` with `text-field: "✓"` offset above the pin, OR show book badge only in popup/panel (minimum: different color + panel badge; preferred: both color and panel badge “Забронировать”).

- [ ] **Step 3: Popup / panel branching**

- If `place.in_database && place.venue_id`: keep current links to `/venues/${venue_id}` and `/book?venue=…`; show free tables.
- Else: show name, rating, address; body text from copy `comingSoon`; **no** book / venue page CTAs.

- [ ] **Step 4: Legend UI**

Below map status or above panel list:

```tsx
<div className="venue-map-legend" aria-label={copy.legendAria}>
  <span><i className="legend-dot legend-dot-ours" /> {copy.legendOurs}</span>
  <span><i className="legend-dot legend-dot-other" /> {copy.legendOther}</span>
</div>
```

Add CSS in `premium.css` for `.venue-map-legend`, `.legend-dot-ours` (`#175f43`), `.legend-dot-other` (`#8a8f8c`).

Extend `mapCopy` ru/en/ro with: `legendAria`, `legendOurs`, `legendOther`, `comingSoon`, `bookableBadge` (e.g. «Можно забронировать»).

- [ ] **Step 5: Manual check in browser**

Open `http://localhost/#map` — ours green + badge, others muted, coming-soon popup, legend visible.

- [ ] **Step 6: Commit**

```bash
git add foodassistant/apps/web/src/components/venue-map.tsx \
  foodassistant/apps/web/src/app/premium.css
git commit -m "feat(web): map pins distinguish in_database places"
```

---

### Task 6: Hero floating cards → product features + map section copy

**Files:**
- Modify: `foodassistant/apps/web/src/lib/site-copy.ts`
- Modify: `foodassistant/apps/web/src/app/page.tsx`

- [ ] **Step 1: Replace hero card keys in all locales**

In `home` for ru/en/ro, replace `confirmed` / `freeTables` / `updated` usage with feature-oriented keys (keep old keys unused or remove):

```ts
// ru example
heroCard1Title: "Карта города",
heroCard1Body: "Свободные столы в реальном времени",
heroCard2Title: "Стол + QR-заказ",
heroCard2Body: "Выбор места и меню за столом",
```

EN:

```ts
heroCard1Title: "City map",
heroCard1Body: "Live free tables",
heroCard2Title: "Table + QR order",
heroCard2Body: "Pick a seat and order at the table",
```

RO:

```ts
heroCard1Title: "Harta orașului",
heroCard1Body: "Mese libere în timp real",
heroCard2Title: "Masă + comandă QR",
heroCard2Body: "Alegi locul și comanzi la masă",
```

Update `mapBody` to mention both our venues and other food places (ours bookable):

RU: `На карте — заведения города. Точки FoodAssistant можно забронировать; остальные отмечены как «скоро».`

- [ ] **Step 2: Wire `page.tsx` cards**

```tsx
<div className="hero-floating-card hero-booking-card">
  <span className="hero-card-icon">⌖</span>
  <div>
    <small>{copy.heroCard1Title}</small>
    <strong>{copy.heroCard1Body}</strong>
  </div>
</div>
<div className="hero-floating-card hero-table-card">
  <span className="hero-table-dot" />
  <div>
    <strong>{copy.heroCard2Title}</strong>
    <small>{copy.heroCard2Body}</small>
  </div>
</div>
```

Remove fake “La Plăcinte · 19:30” / “12 tables”.

- [ ] **Step 3: Visual check** — photo remains; cards show features; locale switch updates text.

- [ ] **Step 4: Commit**

```bash
git add foodassistant/apps/web/src/lib/site-copy.ts \
  foodassistant/apps/web/src/app/page.tsx
git commit -m "feat(web): hero cards show product features"
```

---

### Task 7: Update MAP_ARCHITECTURE.md

**Files:**
- Modify: `docs/MAP_ARCHITECTURE.md`

- [ ] **Step 1: Replace “restaurants only from store” claim**

Document:

- Base tiles still OpenFreeMap / MapLibre (no Google Maps tiles).
- Place catalog: hybrid — Google Nearby food + published venues.
- Membership: JSON field `in_database` (default false); true only for FoodAssistant venues (matched by `google_place_id` or DB-only).
- Endpoint: `GET /api/v1/map/places`.
- Future: menus for any `google_place_id` (out of scope).

- [ ] **Step 2: Commit**

```bash
git add docs/MAP_ARCHITECTURE.md
git commit -m "docs: map architecture hybrid Google overlay"
```

---

### Task 8: End-to-end verification

- [ ] **Step 1: Full stack**

```bash
docker compose up -d --build
curl -s http://localhost/healthz
curl -s http://localhost/api/v1/map/places | python3 -m json.tool | head -80
```

- [ ] **Step 2: Checklist**

1. Hero photo + two feature cards (no fake booking text).
2. Map legend: ours vs other.
3. Green/`✓` bookable only when `in_database: true`.
4. Google-only pin → coming soon, no book CTA.
5. Google disabled/fail → still shows DB venues.
6. RU/EN/RO copy for hero + legend + coming soon.

- [ ] **Step 3: Commit only if leftover fixes** (otherwise done).

---

## Spec coverage check

| Spec requirement | Task |
|---|---|
| Hero keep photo, feature cards | 6 |
| Google food + DB merge backend | 1–3 |
| `in_database` explicit, default false | 1 |
| Match by `google_place_id` only | 1 |
| Dual pin + book badge | 5 |
| Coming soon popup | 5 |
| No menu feature now | noted non-goal / Task 7 |
| Cache / graceful Google fail | 2–3 |
| MAP_ARCHITECTURE update | 7 |
| i18n | 5–6 |

## Type consistency

- Backend `models.MapPlace.in_database` ↔ frontend `MapPlace.in_database`
- `venue_id` optional string; book links only when set and `in_database`
- Google-only ids prefixed `google:{normalizedId}`
- Normalize strips `places/` everywhere
