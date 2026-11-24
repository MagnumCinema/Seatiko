package handlers

import (
	"log"
	"math"
	"net/http"
	"strconv"
	"strings"
	"unicode"
	"unicode/utf8"

	"github.com/gin-gonic/gin"
	"github.com/seatiko/api/internal/discover"
	"github.com/seatiko/api/internal/models"
	"github.com/seatiko/api/internal/places"
	"github.com/seatiko/api/internal/store"
	"golang.org/x/text/unicode/norm"
)

func intersectMapBounds(scope models.MapBounds, raw string) (models.MapBounds, bool) {
	parts := strings.Split(raw, ",")
	if len(parts) != 4 {
		return models.MapBounds{}, false
	}
	var coords [4]float64
	for i, part := range parts {
		value, err := strconv.ParseFloat(strings.TrimSpace(part), 64)
		if err != nil || math.IsInf(value, 0) || math.IsNaN(value) {
			return models.MapBounds{}, false
		}
		coords[i] = value
	}
	south, west, north, east := coords[0], coords[1], coords[2], coords[3]
	if south < -90 || north > 90 || west < -180 || east > 180 || south >= north || west >= east {
		return models.MapBounds{}, false
	}
	bounds := models.MapBounds{
		South: math.Max(scope.South, south), West: math.Max(scope.West, west),
		North: math.Min(scope.North, north), East: math.Min(scope.East, east),
	}
	return bounds, bounds.South < bounds.North && bounds.West < bounds.East
}

func normalizeMapSearch(value string) string {
	return strings.Map(func(r rune) rune {
		switch {
		case unicode.IsMark(r) || r == '\'' || r == '’':
			return -1
		case unicode.IsLetter(r) || unicode.IsNumber(r):
			return unicode.ToLower(r)
		default:
			return ' '
		}
	}, norm.NFD.String(value))
}

func matchesMapSearch(place models.MapPlace, terms []string) bool {
	name, address := place.Name, place.Address
	text := normalizeMapSearch(strings.Join([]string{name.RU, name.EN, name.RO, address.RU, address.EN, address.RO}, " "))
	for _, term := range terms {
		if !strings.Contains(text, term) {
			return false
		}
	}
	return true
}

func (a *API) ListMapPlaces(c *gin.Context) {
	c.Header("Cache-Control", "no-store")
	cityID := c.DefaultQuery("city_id", store.DefaultCityID)
	bounds := store.MoldovaBounds
	center := models.Coordinates{Lat: (bounds.South + bounds.North) / 2, Lng: (bounds.West + bounds.East) / 2}
	venueCity := ""
	if cityID != "all" {
		city, err := a.Store.GetCity(cityID)
		if err != nil || city.Country != "MD" || city.Bounds == (models.MapBounds{}) {
			c.JSON(http.StatusNotFound, gin.H{"error": "city_not_found"})
			return
		}
		bounds, center, venueCity = city.Bounds, city.Center, city.ID
	}

	if raw, ok := c.GetQuery("bounds"); ok {
		var valid bool
		bounds, valid = intersectMapBounds(bounds, raw)
		if !valid {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid_map_bounds"})
			return
		}
		center = models.Coordinates{Lat: (bounds.South + bounds.North) / 2, Lng: (bounds.West + bounds.East) / 2}
	}
	language := c.DefaultQuery("lang", "ru")
	if language != "ru" && language != "ro" && language != "en" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid_map_language"})
		return
	}
	includeGoogle, err := strconv.ParseBool(c.DefaultQuery("include_google", "true"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid_include_google"})
		return
	}
	bookableOnly, err := strconv.ParseBool(c.DefaultQuery("bookable_only", "false"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid_bookable_only"})
		return
	}
	query := strings.TrimSpace(c.Query("q"))
	if !utf8.ValidString(query) || utf8.RuneCountInString(query) > 100 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid_map_query"})
		return
	}
	terms := strings.Fields(normalizeMapSearch(query))
	if len(terms) == 0 {
		query = ""
	}

	venues, bookable := a.Store.ListMapVenues(venueCity)
	scoped := venues[:0]
	for _, venue := range venues {
		if bounds.Contains(venue.Lat, venue.Lng) && (!bookableOnly || bookable[venue.ID]) {
			scoped = append(scoped, venue)
		}
	}

	var google []places.GoogleFoodPlace
	response := models.MapPlacesResponse{CityID: cityID, Country: "MD", Center: center, Bounds: bounds}
	includeGoogle = includeGoogle && !bookableOnly
	var placesClient *places.Client
	if includeGoogle {
		placesClient = a.Maps.Current().Places
	}
	switch {
	case !includeGoogle:
		response.Source.GoogleStatus = "not_requested"
	case !placesClient.Enabled():
		response.Source.GoogleStatus = "disabled"
	default:
		found, err := placesClient.SearchFood(c.Request.Context(), bounds, language, query)
		if err != nil {
			if c.Request.Context().Err() == nil {
				log.Printf("Google Places map search for %s: %v", cityID, err)
			}
			response.Source.GoogleStatus = "unavailable"
		} else {
			google = found
			response.Source.GoogleStatus = "ready"
			response.Source.GoogleEnabled = true
		}
	}
	response.Source.GoogleCount = len(google)
	googleMatches := make(map[string]bool, len(google))
	for _, place := range google {
		if id := places.NormalizePlaceID(place.ID); id != "" {
			googleMatches[id] = true
		}
	}
	merged := places.MergeMapPlaces(scoped, google)
	response.Places = merged[:0]
	for _, place := range merged {
		if place.InDatabase {
			if len(terms) > 0 && !googleMatches[place.GooglePlaceID] && !matchesMapSearch(place, terms) {
				continue
			}
			place.Bookable = bookable[place.VenueID]
			response.Source.DatabaseCount++
		}
		response.Places = append(response.Places, place)
	}
	// "Найдено: N" for /discover: counts with the same hard filters as the web.
	if prefs := discover.ParsePrefs(c.Request.URL.Query()); !prefs.Empty() {
		var origin *discover.Origin
		lat, latErr := strconv.ParseFloat(c.Query("lat"), 64)
		lng, lngErr := strconv.ParseFloat(c.Query("lng"), 64)
		if latErr == nil && lngErr == nil && !math.IsNaN(lat) && !math.IsNaN(lng) {
			origin = &discover.Origin{Lat: lat, Lng: lng}
		}
		counts := discover.Count(response.Places, prefs, origin)
		response.Filters = &counts
	}
	c.JSON(http.StatusOK, response)
}

func (a *API) GetMapConfig(c *gin.Context) {
	maps := a.Maps.Current()
	c.Header("Cache-Control", "no-store")
	c.JSON(http.StatusOK, gin.H{
		"cities":          a.Store.ListCities(),
		"country_bounds":  store.MoldovaBounds,
		"google_maps_key": maps.BrowserKey,
		"google_maps_id":  maps.MapID,
	})
}
