package store

import "github.com/seatiko/api/internal/models"

// Per-venue booking rule defaults; the web client mirrors them in src/lib/venue-rules.ts.
const (
	DefaultBookingIntervalMin    = 30
	DefaultVisitDurationMin      = 90
	DefaultMaxVisitDurationMin   = 180
	MinVisitDurationMin          = 30
	DefaultHoldMinutes           = 15
	DefaultMaxLateArrivalMin     = 30
	DefaultSessionStartBeforeMin = 60
	DefaultReleaseBeforeMin      = 15
)

type ruleLimit struct{ min, max int }

// Allowed ranges for owner-configured rules (minutes).
var (
	bookingIntervalLimit    = ruleLimit{15, 120}
	visitDurationLimit      = ruleLimit{30, 360}
	maxVisitDurationLimit   = ruleLimit{60, 480}
	holdMinutesLimit        = ruleLimit{0, 60}
	maxLateArrivalLimit     = ruleLimit{0, 120}
	sessionStartBeforeLimit = ruleLimit{0, 180}
	releaseBeforeLimit      = ruleLimit{0, 60}
)

func (l ruleLimit) ok(v int) bool { return v >= l.min && v <= l.max }

// visitMinutes is the default booking length preselected for guests at this venue.
func visitMinutes(v models.Venue) int {
	d := DefaultVisitDurationMin
	if v.VisitDurationMin > 0 {
		d = v.VisitDurationMin
	}
	if m := maxVisitMinutes(v); d > m {
		d = m
	}
	return d
}

// maxVisitMinutes is the longest booking a guest may choose at this venue.
func maxVisitMinutes(v models.Venue) int {
	if v.MaxVisitDurationMin > 0 {
		return v.MaxVisitDurationMin
	}
	return DefaultMaxVisitDurationMin
}

// reservationMinutes is how long this booking holds its table (guest's choice, else venue default).
func reservationMinutes(r models.Reservation, v models.Venue) int {
	if r.DurationMin > 0 {
		return r.DurationMin
	}
	return visitMinutes(v)
}

// maxLateArrivalMinutes is how late a guest may announce arriving ("I'm coming");
// never less than the lateness tolerated without warning.
func maxLateArrivalMinutes(v models.Venue) int {
	limit := v.MaxLateArrivalMin
	if limit <= 0 {
		limit = DefaultMaxLateArrivalMin
	}
	if v.HoldMinutes > limit {
		limit = v.HoldMinutes
	}
	return limit
}

// validateBookingRules checks owner-set values; zero means "use the default" for
// everything except hold_minutes, where 0 is a valid "no grace period".
func validateBookingRules(v models.Venue) error {
	optional := []struct {
		value int
		limit ruleLimit
	}{
		{v.BookingIntervalMin, bookingIntervalLimit},
		{v.VisitDurationMin, visitDurationLimit},
		{v.MaxVisitDurationMin, maxVisitDurationLimit},
		{v.MaxLateArrivalMin, maxLateArrivalLimit},
		{v.SessionStartBeforeMin, sessionStartBeforeLimit},
		{v.ReleaseBeforeMin, releaseBeforeLimit},
	}
	for _, rule := range optional {
		if rule.value != 0 && !rule.limit.ok(rule.value) {
			return ErrBadRequest
		}
	}
	if !holdMinutesLimit.ok(v.HoldMinutes) {
		return ErrBadRequest
	}
	if v.MaxLateArrivalMin != 0 && v.MaxLateArrivalMin < v.HoldMinutes {
		return ErrBadRequest
	}
	if v.VisitDurationMin != 0 && v.VisitDurationMin > maxVisitMinutes(v) {
		return ErrBadRequest
	}
	return nil
}
