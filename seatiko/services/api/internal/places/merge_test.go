package places

import (
	"testing"

	"github.com/seatiko/api/internal/models"
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
		ID:      "places/ChIJmatched",
		Name:    "Google Name",
		Address: "Google Addr",
		Lat:     47.761,
		Lng:     27.921,
		Rating:  4.2,
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
