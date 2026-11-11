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
