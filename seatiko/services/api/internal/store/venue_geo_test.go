package store

import (
	"path/filepath"
	"testing"
)

func TestSeedVenuesInsideCityAndOffLegacyPoints(t *testing.T) {
	mem := NewMemory()
	city, err := mem.GetCity(DefaultCityID)
	if err != nil {
		t.Fatal(err)
	}
	for _, v := range mem.ListVenues(DefaultCityID) {
		if !city.Bounds.Contains(v.Lat, v.Lng) {
			t.Errorf("%s at %f,%f is outside Bălți", v.ID, v.Lat, v.Lng)
		}
		if atLegacySeedPoint(v.ID, v.Lat, v.Lng) {
			t.Errorf("%s still seeded at its legacy point", v.ID)
		}
	}
}

func TestSnapshotLegacyVenuePointsAreMoved(t *testing.T) {
	path := filepath.Join(t.TempDir(), "state.json")
	first, err := NewPersistent(path)
	if err != nil {
		t.Fatal(err)
	}
	first.mu.Lock()
	pub := first.venues["venue-5"]
	pub.Lat, pub.Lng = legacySeedVenueGeo["venue-5"][0], legacySeedVenueGeo["venue-5"][1]
	first.venues["venue-5"] = pub
	moved := first.venues["venue-4"]
	moved.Lat, moved.Lng = 47.7700, 27.9300 // an owner moved this pin on purpose
	first.venues["venue-4"] = moved
	for id, app := range first.applications {
		if app.VenueID != nil && *app.VenueID == "venue-1" {
			app.Lat, app.Lng = legacySeedVenueGeo["venue-1"][0], legacySeedVenueGeo["venue-1"][1]
			first.applications[id] = app
		}
	}
	first.persistBestEffortLocked()
	first.mu.Unlock()

	second, err := NewPersistent(path)
	if err != nil {
		t.Fatal(err)
	}
	fresh := NewMemory()
	if got, _ := second.GetVenue("venue-5"); got.Lat != fresh.venues["venue-5"].Lat || got.Lng != fresh.venues["venue-5"].Lng {
		t.Fatalf("Beermaster Pub still at %f,%f", got.Lat, got.Lng)
	}
	if got, _ := second.GetVenue("venue-4"); got.Lat != 47.7700 || got.Lng != 27.9300 {
		t.Fatalf("owner-moved pin overwritten: %f,%f", got.Lat, got.Lng)
	}
	for _, app := range second.applications {
		if app.VenueID != nil && *app.VenueID == "venue-1" && atLegacySeedPoint("venue-1", app.Lat, app.Lng) {
			t.Fatal("demo owner application kept the legacy point")
		}
	}
}
