package handlers

import (
	"log"
	"math"
	"net/http"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/seatiko/api/internal/models"
	"github.com/seatiko/api/internal/places"
	"github.com/seatiko/api/internal/store"
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
	venues := a.Store.ListVenues(venueCity)
	filtered := venues[:0]
	for _, venue := range venues {
		if bounds.Contains(venue.Lat, venue.Lng) {
			filtered = append(filtered, venue)
		}
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

	var google []places.GoogleFoodPlace
	response := models.MapPlacesResponse{CityID: cityID, Country: "MD", Center: center, Bounds: bounds}
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
		found, err := placesClient.SearchFood(c.Request.Context(), bounds, language)
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
	response.Source.DatabaseCount = len(filtered)
	response.Source.GoogleCount = len(google)
	response.Places = places.MergeMapPlaces(filtered, google)
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
