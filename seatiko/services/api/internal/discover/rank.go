package discover

import (
	"sort"
	"strings"

	"github.com/seatiko/api/internal/models"
)

// RankedVenue is one recommendation with the criteria it satisfies (the client localises them).
type RankedVenue struct {
	VenueID string   `json:"venue_id"`
	Score   float64  `json:"score"`
	Reasons []string `json:"reasons"`
}

var typeAliases = map[string][]string{
	"restaurant": {"restaurant", "ресторан"}, "cafe": {"cafe", "coffee", "кафе", "кофе"}, "bar": {"bar", "бар"},
	"fast_food": {"fast", "burger", "street"}, "fine_dining": {"fine", "gourmet", "мишлен"}, "pub": {"pub", "паб", "beer"},
	"pizzeria": {"pizza", "pizzeria", "пицц"}, "bakery": {"bakery", "пекар", "bread", "pastry"}, "wine_bar": {"wine", "вино", "enoteca"},
}

func matchesAny(text string, ids []string, aliases map[string][]string) bool {
	for _, id := range ids {
		for _, a := range aliases[id] {
			if strings.Contains(text, a) {
				return true
			}
		}
	}
	return false
}

// occasionFits mirrors occasionBonus on the web, as a yes/no per occasion.
func occasionFits(p models.MapPlace, occasion string) bool {
	text := placeText(p)
	price := p.PriceLevel
	switch occasion {
	case "quick_lunch":
		return price <= 2 || strings.Contains(text, "cafe") || strings.Contains(text, "fast")
	case "date_night", "celebration":
		return price >= 2 || strings.Contains(text, "wine") || strings.Contains(text, "fine")
	case "family":
		return p.InDatabase || strings.Contains(text, "family")
	case "business":
		return price >= 2
	case "group":
		return p.FreeTables >= 2
	case "brunch":
		return strings.Contains(text, "brunch") || strings.Contains(text, "cafe") || strings.Contains(text, "breakfast")
	case "solo":
		return price <= 2 || strings.Contains(text, "cafe") || strings.Contains(text, "bar")
	}
	return false
}

// Rank filters places with the hard filters and scores them like scorePlace on the web.
// When nothing passes, it ranks everything (the caller says the match is approximate).
func Rank(places []models.MapPlace, prefs Prefs, origin *Origin, limit int) (ranked []RankedVenue, exact bool) {
	pool := make([]models.MapPlace, 0, len(places))
	for _, p := range places {
		if Matches(p, prefs, origin) {
			pool = append(pool, p)
		}
	}
	exact = len(pool) > 0
	if !exact {
		pool = places
	}
	for _, p := range pool {
		r := RankedVenue{VenueID: p.VenueID, Reasons: []string{}}
		if r.VenueID == "" {
			r.VenueID = p.ID
		}
		if len(prefs.Cuisine) > 0 && cuisineMatches(p, prefs.Cuisine) {
			r.Score += 40
			r.Reasons = append(r.Reasons, "cuisine")
		}
		if len(PriceLevels(prefs.Budget)) > 0 && p.PriceLevel > 0 && budgetMatches(p, prefs.Budget) {
			r.Score += 30
			r.Reasons = append(r.Reasons, "budget")
		}
		if len(prefs.RestaurantType) > 0 && matchesAny(placeText(p), prefs.RestaurantType, typeAliases) {
			r.Score += 20
			r.Reasons = append(r.Reasons, "type")
		}
		for _, o := range prefs.Occasion {
			if occasionFits(p, o) {
				r.Score += 7
				r.Reasons = append(r.Reasons, "occasion:"+o)
			}
		}
		for _, f := range prefs.Practical {
			switch {
			case f == "open_now" && p.OpenNow != nil && *p.OpenNow,
				f == "free_tables" && p.FreeTables > 0,
				f == "partners" && p.InDatabase:
				r.Score += 12
				r.Reasons = append(r.Reasons, f)
			}
		}
		if p.InDatabase {
			r.Score += 5
		}
		r.Score += p.Rating * 2
		ranked = append(ranked, r)
	}
	sort.SliceStable(ranked, func(i, j int) bool {
		if ranked[i].Score != ranked[j].Score {
			return ranked[i].Score > ranked[j].Score
		}
		return ranked[i].VenueID < ranked[j].VenueID
	})
	if limit > 0 && len(ranked) > limit {
		ranked = ranked[:limit]
	}
	return ranked, exact
}
