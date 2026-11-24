package handlers

import (
	"log"
	"net/http"
	"strings"
	"unicode/utf8"

	"github.com/gin-gonic/gin"
	"github.com/seatiko/api/internal/discover"
	"github.com/seatiko/api/internal/models"
	"github.com/seatiko/api/internal/places"
	"github.com/seatiko/api/internal/store"
)

const maxDiscoverQuery = 300

type aiDiscoverReq struct {
	Query  string          `json:"query"`
	CityID string          `json:"city_id"`
	Locale string          `json:"locale"`
	Prefs  *discover.Prefs `json:"prefs"`
	// Filters is the legacy chip list of older clients; ignored.
	Filters []string `json:"filters"`
}

// AIDiscover: POST /discover/ai. Reads a free-text request into /discover filters
// (Groq when configured, keyword rules otherwise or on any model error), merges them
// with the current filters and ranks the city's venues. `venues` keeps the old shape
// for the mobile app and legacy web clients.
func (a *API) AIDiscover(c *gin.Context) {
	var req aiDiscoverReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid_body"})
		return
	}
	query := strings.TrimSpace(req.Query)
	if !utf8.ValidString(query) || utf8.RuneCountInString(query) > maxDiscoverQuery {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid_query"})
		return
	}
	cityID := req.CityID
	if cityID == "" {
		cityID = store.DefaultCityID
	}
	current := discover.Prefs{}
	if req.Prefs != nil {
		current = req.Prefs.Clean()
	}

	next := discover.ParseText(query)
	source, explanation := "rules", ""
	if query != "" && a.Groq.Enabled() {
		reading, err := a.Groq.Read(c.Request.Context(), query, current, req.Locale)
		switch {
		case err != nil:
			log.Printf("discover AI: groq failed, using rules: %v", err)
		case !reading.Prefs.Empty() || next.Empty():
			next, source, explanation = reading.Prefs, "groq", reading.Explanation
		}
	}
	prefs := discover.Merge(current, next)

	venues, bookable := a.Store.ListMapVenues(cityID)
	mapPlaces := places.MergeMapPlaces(venues, nil)
	for i := range mapPlaces {
		mapPlaces[i].Bookable = bookable[mapPlaces[i].VenueID]
	}
	ranked, exact := discover.Rank(mapPlaces, prefs, nil, 8)

	byID := make(map[string]models.Venue, len(venues))
	for _, v := range venues {
		byID[v.ID] = v
	}
	legacy := make([]models.Venue, 0, len(ranked))
	for _, r := range ranked {
		if v, ok := byID[r.VenueID]; ok {
			legacy = append(legacy, v)
		}
	}
	c.JSON(http.StatusOK, gin.H{
		"venues":       legacy,
		"ranked":       ranked,
		"prefs":        prefs,
		"query_string": prefs.Encode(),
		"exact":        exact,
		"source":       source,
		"explanation":  explanation,
	})
}
