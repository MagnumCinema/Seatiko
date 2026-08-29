package handlers

import (
	"net/http"

	"github.com/foodassistant/api/internal/models"
	"github.com/foodassistant/api/internal/store"
	"github.com/gin-gonic/gin"
)

func (a *API) GetWaitlistSummary(c *gin.Context) {
	summary, err := a.Store.WaitlistSummary(c.Param("id"))
	writeOpsResult(c, err, gin.H{"summary": summary}, http.StatusOK)
}

func (a *API) JoinWaitlist(c *gin.Context) {
	var req store.WaitlistInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid_body"})
		return
	}
	entry, err := a.Store.JoinWaitlist(a.userID(c), req)
	writeOpsResult(c, err, gin.H{"entry": entry}, http.StatusCreated)
}

func (a *API) ListMyWaitlist(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{"waitlist": a.Store.ListMyWaitlist(a.userID(c))})
}

func (a *API) LeaveWaitlist(c *gin.Context) {
	entry, err := a.Store.LeaveWaitlist(a.userID(c), c.Param("id"))
	writeOpsResult(c, err, gin.H{"entry": entry}, http.StatusOK)
}

func (a *API) StaffListWaitlist(c *gin.Context) {
	venueID := c.Query("venue_id")
	if !a.gateStaffVenue(c, venueID) {
		return
	}
	entries, err := a.Store.ListVenueWaitlist(venueID)
	writeOpsResult(c, err, gin.H{"waitlist": entries}, http.StatusOK)
}

// StaffAddWaitlist registers a walk-in from the host stand.
func (a *API) StaffAddWaitlist(c *gin.Context) {
	var req store.WaitlistInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid_body"})
		return
	}
	if !a.gateStaffVenue(c, req.VenueID) {
		return
	}
	req.Source = models.WaitlistSourceHost
	entry, err := a.Store.JoinWaitlist("", req)
	writeOpsResult(c, err, gin.H{"entry": entry}, http.StatusCreated)
}

func (a *API) StaffNotifyWaitlist(c *gin.Context) {
	var req struct {
		TableID string `json:"table_id"`
	}
	_ = c.ShouldBindJSON(&req)
	entry, ok := a.gateWaitlistEntry(c)
	if !ok {
		return
	}
	updated, err := a.Store.NotifyWaitlistEntry(entry.ID, req.TableID)
	writeOpsResult(c, err, gin.H{"entry": updated}, http.StatusOK)
}

func (a *API) StaffSeatWaitlist(c *gin.Context) {
	var req struct {
		TableID string `json:"table_id"`
	}
	_ = c.ShouldBindJSON(&req)
	entry, ok := a.gateWaitlistEntry(c)
	if !ok {
		return
	}
	updated, err := a.Store.SeatWaitlistEntry(entry.ID, req.TableID)
	writeOpsResult(c, err, gin.H{"entry": updated}, http.StatusOK)
}

func (a *API) StaffCloseWaitlist(c *gin.Context) {
	var req struct {
		Status string `json:"status"`
	}
	_ = c.ShouldBindJSON(&req)
	entry, ok := a.gateWaitlistEntry(c)
	if !ok {
		return
	}
	status := models.WaitlistStatus(req.Status)
	if status == "" {
		status = models.WaitlistLeft
	}
	updated, err := a.Store.CloseWaitlistEntry(entry.ID, status)
	writeOpsResult(c, err, gin.H{"entry": updated}, http.StatusOK)
}

func (a *API) gateWaitlistEntry(c *gin.Context) (models.WaitlistEntry, bool) {
	entry, err := a.Store.GetWaitlistEntry(c.Param("id"))
	if err != nil {
		writeOpsResult(c, err, nil, http.StatusOK)
		return models.WaitlistEntry{}, false
	}
	if !a.gateStaffVenue(c, entry.VenueID) {
		return models.WaitlistEntry{}, false
	}
	return entry, true
}
