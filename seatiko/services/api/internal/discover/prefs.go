// Package discover holds the /discover preference model shared by the map counter
// (GET /map/places filter counts) and the AI search (POST /discover/ai). It mirrors
// apps/web/src/lib/discover-preferences.ts: change both together.
package discover

import (
	"math"
	"net/url"
	"regexp"
	"strconv"
	"strings"

	"github.com/seatiko/api/internal/models"
)

var (
	CuisineIDs   = []string{"moldovan", "italian", "asian", "european", "japanese", "chinese", "mexican", "seafood", "vegetarian", "grill", "fast_food", "cafe_sweets"}
	TypeIDs      = []string{"restaurant", "cafe", "bar", "fast_food", "fine_dining", "pub", "pizzeria", "bakery", "wine_bar"}
	OccasionIDs  = []string{"quick_lunch", "date_night", "family", "business", "group", "brunch", "celebration", "solo"}
	PracticalIDs = []string{"open_now", "free_tables", "partners", "nearby", "outdoor", "parking", "wifi", "kid_friendly"}
)

const (
	BudgetMin  = 50
	BudgetMax  = 1000
	BudgetStep = 50
	// NearbyRadiusKm matches RankOptions.nearbyRadiusKm default on the web.
	NearbyRadiusKm = 3.0
)

// Budget is an MDL range per person.
type Budget struct {
	Min int `json:"min"`
	Max int `json:"max"`
}

// Prefs are the /discover filters (same query params as encodePreferences on the web).
type Prefs struct {
	Cuisine        []string `json:"cuisine"`
	RestaurantType []string `json:"restaurant_type"`
	Budget         *Budget  `json:"budget,omitempty"`
	Occasion       []string `json:"occasion"`
	Practical      []string `json:"practical"`
}

func (p Prefs) Empty() bool {
	return len(p.Cuisine) == 0 && len(p.RestaurantType) == 0 && p.Budget == nil && len(p.Occasion) == 0 && len(p.Practical) == 0
}

// Encode returns the query string the web /discover and map pages understand.
func (p Prefs) Encode() string {
	v := url.Values{}
	if len(p.Cuisine) > 0 {
		v.Set("cuisine", strings.Join(p.Cuisine, ","))
	}
	if len(p.RestaurantType) > 0 {
		v.Set("type", strings.Join(p.RestaurantType, ","))
	}
	if p.Budget != nil {
		v.Set("budget", strconv.Itoa(p.Budget.Min)+"-"+strconv.Itoa(p.Budget.Max))
	}
	if len(p.Occasion) > 0 {
		v.Set("occasion", strings.Join(p.Occasion, ","))
	}
	if len(p.Practical) > 0 {
		v.Set("practical", strings.Join(p.Practical, ","))
	}
	return v.Encode()
}

func allowed(ids []string) map[string]bool {
	m := make(map[string]bool, len(ids))
	for _, id := range ids {
		m[id] = true
	}
	return m
}

func parseList(raw string, ok map[string]bool) []string {
	out := []string{}
	seen := map[string]bool{}
	for _, part := range strings.Split(raw, ",") {
		id := strings.ToLower(strings.TrimSpace(part))
		if ok[id] && !seen[id] {
			seen[id] = true
			out = append(out, id)
		}
	}
	return out
}

// Clean drops unknown ids and normalises the budget (for values coming from an LLM).
func (p Prefs) Clean() Prefs {
	out := Prefs{
		Cuisine:        parseList(strings.Join(p.Cuisine, ","), allowed(CuisineIDs)),
		RestaurantType: parseList(strings.Join(p.RestaurantType, ","), allowed(TypeIDs)),
		Occasion:       parseList(strings.Join(p.Occasion, ","), allowed(OccasionIDs)),
		Practical:      parseList(strings.Join(p.Practical, ","), allowed(PracticalIDs)),
	}
	if p.Budget != nil {
		b := NormalizeBudget(*p.Budget)
		out.Budget = &b
	}
	return out
}

var budgetParam = regexp.MustCompile(`^(\d+)\s*-\s*(\d+)$`)

// ParsePrefs reads cuisine, type, budget, occasion and practical query params.
func ParsePrefs(q url.Values) Prefs {
	p := Prefs{
		Cuisine:        parseList(q.Get("cuisine"), allowed(CuisineIDs)),
		RestaurantType: parseList(q.Get("type"), allowed(TypeIDs)),
		Occasion:       parseList(q.Get("occasion"), allowed(OccasionIDs)),
		Practical:      parseList(q.Get("practical"), allowed(PracticalIDs)),
	}
	if m := budgetParam.FindStringSubmatch(strings.TrimSpace(q.Get("budget"))); m != nil {
		lo, _ := strconv.Atoi(m[1])
		hi, _ := strconv.Atoi(m[2])
		b := NormalizeBudget(Budget{Min: lo, Max: hi})
		p.Budget = &b
	}
	return p
}

func snap(n int, ceil bool) int {
	n = min(BudgetMax, max(BudgetMin, n))
	steps := n / BudgetStep
	if ceil && n%BudgetStep != 0 {
		steps++
	}
	return steps * BudgetStep
}

// NormalizeBudget mirrors normalizeBudgetRange: clamp to 50–1000, snap to 50, order.
func NormalizeBudget(b Budget) Budget {
	lo, hi := snap(b.Min, false), snap(b.Max, true)
	if lo > hi {
		lo, hi = snap(b.Max, false), snap(b.Min, true)
	}
	return Budget{Min: lo, Max: hi}
}

// PriceLevels mirrors priceLevelsForMdlRange (overlapping soft bands).
func PriceLevels(b *Budget) []int {
	if b == nil {
		return nil
	}
	n := NormalizeBudget(*b)
	levels := []int{}
	if n.Max >= 50 && n.Min <= 250 {
		levels = append(levels, 1)
	}
	if n.Max > 200 && n.Min <= 550 {
		levels = append(levels, 2)
	}
	if n.Max >= 500 && n.Min <= 1000 {
		levels = append(levels, 3)
	}
	return levels
}

var cuisineAliases = map[string][]string{
	"moldovan":    {"moldovan", "молдав", "moldoven"},
	"italian":     {"italian", "итальян", "pizza", "pasta"},
	"asian":       {"asian", "азиат", "thai", "korean", "vietnamese"},
	"european":    {"european", "европ", "french", "german"},
	"japanese":    {"japanese", "япон", "sushi", "ramen"},
	"chinese":     {"chinese", "китай"},
	"mexican":     {"mexican", "мексик", "taco"},
	"seafood":     {"seafood", "морепрод", "fish", "рыба"},
	"vegetarian":  {"vegetarian", "vegan", "вегетар", "plant"},
	"grill":       {"grill", "bbq", "steak", "гриль", "шашлык"},
	"fast_food":   {"fast food", "fast_food", "burger", "street"},
	"cafe_sweets": {"cafe", "coffee", "dessert", "sweet", "кондитер", "кофе"},
}

func placeText(p models.MapPlace) string {
	return strings.ToLower(strings.Join(append([]string{p.Name.RU, p.Name.EN, p.Name.RO}, p.Cuisine...), " "))
}

func cuisineMatches(p models.MapPlace, ids []string) bool {
	if len(ids) == 0 {
		return true
	}
	text := placeText(p)
	for _, id := range ids {
		for _, alias := range cuisineAliases[id] {
			if strings.Contains(text, alias) {
				return true
			}
		}
	}
	return false
}

func budgetMatches(p models.MapPlace, b *Budget) bool {
	levels := PriceLevels(b)
	if len(levels) == 0 || p.PriceLevel == 0 { // unknown price is not a mismatch
		return true
	}
	for _, l := range levels {
		if l == p.PriceLevel {
			return true
		}
	}
	return false
}

func haversineKm(aLat, aLng, bLat, bLng float64) float64 {
	rad := func(d float64) float64 { return d * math.Pi / 180 }
	dLat, dLng := rad(bLat-aLat), rad(bLng-aLng)
	s := math.Pow(math.Sin(dLat/2), 2) + math.Cos(rad(aLat))*math.Cos(rad(bLat))*math.Pow(math.Sin(dLng/2), 2)
	return 2 * 6371 * math.Asin(math.Sqrt(s))
}

// Origin is the guest's position for "nearby"; nil = ignore that filter.
type Origin struct{ Lat, Lng float64 }

// Matches mirrors passesHardFilters: cuisine, budget and practical are hard filters;
// restaurant type and occasion only affect ranking.
func Matches(p models.MapPlace, prefs Prefs, origin *Origin) bool {
	if !cuisineMatches(p, prefs.Cuisine) || !budgetMatches(p, prefs.Budget) {
		return false
	}
	for _, f := range prefs.Practical {
		switch f {
		case "partners":
			if !p.InDatabase {
				return false
			}
		case "open_now":
			if p.OpenNow == nil || !*p.OpenNow {
				return false
			}
		case "free_tables":
			if p.FreeTables <= 0 {
				return false
			}
		case "nearby":
			if origin != nil && haversineKm(origin.Lat, origin.Lng, p.Lat, p.Lng) > NearbyRadiusKm {
				return false
			}
		}
	}
	return true
}

// Counts is the "Найдено: N" contract (models.MapFilterCounts).
type Counts = models.MapFilterCounts

// Relax names the filter whose removal brings back the most places.
type Relax = models.MapFilterRelax

func count(places []models.MapPlace, prefs Prefs, origin *Origin) int {
	n := 0
	for _, p := range places {
		if Matches(p, prefs, origin) {
			n++
		}
	}
	return n
}

// Count computes Counts for the given places.
func Count(places []models.MapPlace, prefs Prefs, origin *Origin) Counts {
	c := Counts{Total: len(places), Matched: count(places, prefs, origin)}
	if c.Matched > 0 || c.Total == 0 {
		return c
	}
	try := func(name string, without Prefs) {
		if n := count(places, without, origin); n > 0 && (c.Relax == nil || n > c.Relax.Matched) {
			c.Relax = &Relax{Filter: name, Matched: n}
		}
	}
	if len(prefs.Cuisine) > 0 {
		p := prefs
		p.Cuisine = nil
		try("cuisine", p)
	}
	if prefs.Budget != nil {
		p := prefs
		p.Budget = nil
		try("budget", p)
	}
	for _, f := range prefs.Practical {
		p := prefs
		p.Practical = nil
		for _, other := range prefs.Practical {
			if other != f {
				p.Practical = append(p.Practical, other)
			}
		}
		try(f, p)
	}
	return c
}
