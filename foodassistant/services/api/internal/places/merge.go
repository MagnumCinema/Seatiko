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
