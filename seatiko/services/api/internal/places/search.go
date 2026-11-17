package places

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"

	"github.com/seatiko/api/internal/models"
)

// SearchFood returns one page of Places results for the requested area.
func (c *Client) SearchFood(ctx context.Context, bounds models.MapBounds, language, query string) ([]GoogleFoodPlace, error) {
	if !c.Enabled() {
		return nil, fmt.Errorf("places disabled")
	}
	textQuery := query
	if textQuery == "" {
		textQuery = "restaurants"
	}
	body := map[string]any{
		"textQuery":    textQuery,
		"pageSize":     20,
		"languageCode": language,
		"regionCode":   "MD",
		"locationRestriction": map[string]any{
			"rectangle": map[string]any{
				"low":  map[string]float64{"latitude": bounds.South, "longitude": bounds.West},
				"high": map[string]float64{"latitude": bounds.North, "longitude": bounds.East},
			},
		},
	}
	fieldMask := "places.id,places.displayName,places.formattedAddress,places.location,places.postalAddress.regionCode"
	if query != "" {
		fieldMask += ",places.types"
	}
	raw, err := c.post(ctx, "https://places.googleapis.com/v1/places:searchText", body, fieldMask)
	if err != nil {
		return nil, err
	}
	var parsed struct {
		Places []struct {
			ID               string   `json:"id"`
			FormattedAddress string   `json:"formattedAddress"`
			Types            []string `json:"types"`
			DisplayName      struct {
				Text string `json:"text"`
			} `json:"displayName"`
			PostalAddress struct {
				RegionCode string `json:"regionCode"`
			} `json:"postalAddress"`
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
		if p.PostalAddress.RegionCode != "MD" || !bounds.Contains(p.Location.Latitude, p.Location.Longitude) {
			continue
		}
		if query != "" && !isFoodPlace(p.Types) {
			continue
		}
		out = append(out, GoogleFoodPlace{
			ID:      p.ID,
			Name:    p.DisplayName.Text,
			Address: p.FormattedAddress,
			Lat:     p.Location.Latitude,
			Lng:     p.Location.Longitude,
		})
	}
	return out, nil
}

func isFoodPlace(types []string) bool {
	for _, kind := range types {
		switch kind {
		case "restaurant", "cafe", "bar", "pub", "bakery", "coffee_shop", "food_court", "meal_takeaway", "meal_delivery":
			return true
		}
		if strings.HasSuffix(kind, "_restaurant") {
			return true
		}
	}
	return false
}
