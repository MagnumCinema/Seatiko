package store

import "github.com/seatiko/api/internal/models"

// legacySeedVenueGeo are the demo venue coordinates seeded before 2026-11-25,
// several of them hundreds of metres off (Beermaster Pub ~1.6 km). The seed now
// uses points checked against OpenStreetMap; snapshots still holding a legacy
// point get the new point and address (venues an owner moved keep theirs).
var legacySeedVenueGeo = map[string][2]float64{
	"venue-1":  {47.7617, 27.9288},
	"venue-2":  {47.7631, 27.9299},
	"venue-4":  {47.7612, 27.9275},
	"venue-5":  {47.7640, 27.9230},
	"venue-6":  {47.7715, 27.9180},
	"venue-7":  {47.7550, 27.9210},
	"venue-8":  {47.7625, 27.9245},
	"venue-9":  {47.7580, 27.9290},
	"venue-10": {47.7605, 27.9265},
}

func atLegacySeedPoint(venueID string, lat, lng float64) bool {
	p, ok := legacySeedVenueGeo[venueID]
	return ok && p[0] == lat && p[1] == lng
}

// backfillVenueGeoLocked moves seeded venues (and their owner applications) off
// legacy demo points. Callers must hold s.mu. Reports whether anything changed.
func (s *MemoryStore) backfillVenueGeoLocked(fresh map[string]models.Venue) bool {
	changed := false
	for id, v := range fresh {
		current, ok := s.venues[id]
		if !ok || !atLegacySeedPoint(id, current.Lat, current.Lng) {
			continue
		}
		current.Lat, current.Lng, current.Address = v.Lat, v.Lng, v.Address
		s.venues[id] = current
		changed = true
	}
	for appID, app := range s.applications {
		if app.VenueID == nil {
			continue
		}
		v, ok := fresh[*app.VenueID]
		if !ok || !atLegacySeedPoint(*app.VenueID, app.Lat, app.Lng) {
			continue
		}
		app.Lat, app.Lng, app.Address = v.Lat, v.Lng, v.Address
		s.applications[appID] = app
		changed = true
	}
	return changed
}
