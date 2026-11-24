package handlers

import (
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/seatiko/api/internal/store"
)

const (
	maxAvailabilityGuests   = 50
	maxAvailabilityLimit    = 12
	maxAvailabilityWindow   = 360
	maxAvailabilityDuration = 480
	maxAvailabilityDaysOut  = 90
)

// intQuery reads an optional integer query param within [min, max].
func intQuery(c *gin.Context, key string, def, min, max int) (int, bool) {
	raw, ok := c.GetQuery(key)
	if !ok || raw == "" {
		return def, true
	}
	n, err := strconv.Atoi(raw)
	if err != nil || n < min || n > max {
		return 0, false
	}
	return n, true
}

// SearchAvailability answers GET /availability: venues with a free table for the party
// around the wanted time, with the nearest free starts and the table for each.
func (a *API) SearchAvailability(c *gin.Context) {
	c.Header("Cache-Control", "no-store")

	cityID := c.DefaultQuery("city_id", store.DefaultCityID)
	if cityID == "all" {
		cityID = ""
	} else if _, err := a.Store.GetCity(cityID); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "city_not_found"})
		return
	}

	guests, ok := intQuery(c, "guests", 2, 1, maxAvailabilityGuests)
	if !ok {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid_guests"})
		return
	}
	duration, ok := intQuery(c, "duration_min", 0, 0, maxAvailabilityDuration)
	if !ok {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid_duration"})
		return
	}
	window, ok := intQuery(c, "window_min", store.DefaultAvailabilityWindowMin, 0, maxAvailabilityWindow)
	if !ok {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid_window"})
		return
	}
	limit, ok := intQuery(c, "limit", 4, 1, maxAvailabilityLimit)
	if !ok {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid_limit"})
		return
	}

	now := time.Now().UTC()
	day := now
	var target *time.Time
	if raw := c.Query("at"); raw != "" {
		at, err := time.Parse(time.RFC3339, raw)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid_at"})
			return
		}
		at = at.UTC()
		target, day = &at, at
	} else if raw := c.Query("date"); raw != "" {
		d, err := time.ParseInLocation("2006-01-02", raw, store.VenueLocation)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid_date"})
			return
		}
		day = d
	}
	if day.After(now.AddDate(0, 0, maxAvailabilityDaysOut)) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "date_too_far"})
		return
	}

	venues := a.Store.SearchAvailability(store.AvailabilityQuery{
		CityID:      cityID,
		Day:         day,
		Target:      target,
		Guests:      guests,
		DurationMin: duration,
		WindowMin:   window,
		Limit:       limit,
		Now:         now,
	})
	c.JSON(http.StatusOK, gin.H{"venues": venues, "timezone": store.VenueLocation.String()})
}
