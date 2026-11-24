package handlers

import (
	"net/http"

	"github.com/seatiko/api/internal/models"
	"github.com/seatiko/api/internal/store"
	"github.com/gin-gonic/gin"
)

func (a *API) ReplaceVenueTables(c *gin.Context) {
	var req struct {
		Tables []store.TableLayoutInput `json:"tables" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid_body"})
		return
	}
	tables, err := a.Store.ReplaceTablesLayout(a.userID(c), c.Param("venueId"), req.Tables)
	writeOpsResult(c, err, gin.H{"tables": tables}, http.StatusOK)
}

func (a *API) ListVenueMenuOwner(c *gin.Context) {
	items, err := a.Store.ListMenuForOwner(a.userID(c), c.Param("venueId"))
	writeOpsResult(c, err, gin.H{"menu": items}, http.StatusOK)
}

func (a *API) CreateVenueMenuItem(c *gin.Context) {
	a.UpsertVenueMenuItem(c)
}

func (a *API) UpdateVenueMenuItem(c *gin.Context) {
	var req store.MenuItemInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid_body"})
		return
	}
	req.ID = c.Param("itemId")
	item, err := a.Store.UpsertMenuItem(a.userID(c), c.Param("venueId"), req)
	writeOpsResult(c, err, gin.H{"item": item}, http.StatusOK)
}

func (a *API) UpsertVenueMenuItem(c *gin.Context) {
	var req store.MenuItemInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid_body"})
		return
	}
	item, err := a.Store.UpsertMenuItem(a.userID(c), c.Param("venueId"), req)
	writeOpsResult(c, err, gin.H{"item": item}, http.StatusOK)
}

func (a *API) DeleteVenueMenuItem(c *gin.Context) {
	err := a.Store.DeleteMenuItem(a.userID(c), c.Param("venueId"), c.Param("itemId"))
	writeOpsResult(c, err, gin.H{"ok": true}, http.StatusOK)
}

func (a *API) SetVenueMenuStopped(c *gin.Context) {
	var req struct {
		Stopped *bool `json:"stopped"`
	}
	_ = c.ShouldBindJSON(&req)
	stopped := true
	if req.Stopped != nil {
		stopped = *req.Stopped
	}
	item, err := a.Store.SetMenuStopped(a.userID(c), c.Param("venueId"), c.Param("itemId"), stopped)
	writeOpsResult(c, err, gin.H{"item": item}, http.StatusOK)
}

func (a *API) ListVenueQR(c *gin.Context) {
	tables, err := a.Store.ListVenueQR(a.userID(c), c.Param("venueId"))
	writeOpsResult(c, err, gin.H{"tables": tables}, http.StatusOK)
}

func (a *API) RegenerateVenueQR(c *gin.Context) {
	tables, err := a.Store.RegenerateTableQRTokens(a.userID(c), c.Param("venueId"))
	writeOpsResult(c, err, gin.H{"tables": tables}, http.StatusOK)
}

func (a *API) UpdateVenueBookingRules(c *gin.Context) {
	var req store.BookingRulesInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid_body"})
		return
	}
	venue, err := a.Store.UpdateVenueBookingRules(a.userID(c), c.Param("venueId"), req)
	writeOpsResult(c, err, gin.H{"venue": venue}, http.StatusOK)
}

func (a *API) GetVenueAnalytics(c *gin.Context) {
	analytics, err := a.Store.VenueAnalytics(a.userID(c), c.Param("venueId"))
	writeOpsResult(c, err, gin.H{"analytics": analytics}, http.StatusOK)
}

func (a *API) InviteVenueStaff(c *gin.Context) {
	var req struct {
		Name  string `json:"name"`
		Email string `json:"email" binding:"required"`
		Role  string `json:"role"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid_body"})
		return
	}
	member, err := a.Store.InviteStaff(a.userID(c), c.Param("venueId"), req.Email, req.Name, req.Role)
	writeOpsResult(c, err, gin.H{"staff": member}, http.StatusCreated)
}

func (a *API) CreateVenueWorkShift(c *gin.Context) {
	var req store.WorkShiftInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid_body"})
		return
	}
	shift, err := a.Store.CreateWorkShift(a.userID(c), c.Param("venueId"), req)
	writeOpsResult(c, err, gin.H{"shift": shift}, http.StatusCreated)
}

func (a *API) ListVenueWorkShifts(c *gin.Context) {
	role := c.Query("role")
	shifts, err := a.Store.ListWorkShifts(a.userID(c), c.Param("venueId"), role)
	writeOpsResult(c, err, gin.H{"shifts": shifts}, http.StatusOK)
}

func (a *API) DeleteVenueWorkShift(c *gin.Context) {
	err := a.Store.DeleteWorkShift(a.userID(c), c.Param("venueId"), c.Param("shiftId"))
	writeOpsResult(c, err, gin.H{"ok": true}, http.StatusOK)
}

func (a *API) ListMyStaffShifts(c *gin.Context) {
	shifts, err := a.Store.ListMyStaffShifts(a.userID(c))
	writeOpsResult(c, err, gin.H{"shifts": shifts}, http.StatusOK)
}

func (a *API) RespondStaffShift(c *gin.Context) {
	var req struct {
		Status string `json:"status" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid_body"})
		return
	}
	shift, err := a.Store.RespondToWorkShift(a.userID(c), c.Param("shiftId"), req.Status)
	writeOpsResult(c, err, gin.H{"shift": shift}, http.StatusOK)
}

func (a *API) ListVenueStaff(c *gin.Context) {
	members, err := a.Store.ListStaff(a.userID(c), c.Param("venueId"))
	writeOpsResult(c, err, gin.H{"staff": members}, http.StatusOK)
}

func (a *API) RemoveVenueStaff(c *gin.Context) {
	err := a.Store.RemoveStaff(a.userID(c), c.Param("venueId"), c.Param("staffId"))
	writeOpsResult(c, err, gin.H{"ok": true}, http.StatusOK)
}

func (a *API) ToggleStaffShift(c *gin.Context) {
	var req struct {
		OnShift *bool `json:"on_shift"`
	}
	_ = c.ShouldBindJSON(&req)
	member, err := a.Store.ToggleStaffShift(a.userID(c), c.Param("venueId"), c.Param("staffId"), req.OnShift)
	writeOpsResult(c, err, gin.H{"staff": member}, http.StatusOK)
}

func (a *API) AcceptStaffInvite(c *gin.Context) {
	member, err := a.Store.AcceptStaffInvite(a.userID(c), c.Param("id"))
	writeOpsResult(c, err, gin.H{"staff": member}, http.StatusOK)
}

func (a *API) SubmitProfileChangeRequest(c *gin.Context) {
	var req models.ApplicationPatch
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid_body"})
		return
	}
	change, err := a.Store.SubmitProfileChangeRequest(a.userID(c), c.Param("id"), req)
	writeOpsResult(c, err, gin.H{"change_request": change}, http.StatusCreated)
}

func (a *API) ListMyProfileChangeRequests(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{"change_requests": a.Store.ListProfileChangeRequests(a.userID(c))})
}

func (a *API) AdminListProfileChangeRequests(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{"change_requests": a.Store.AdminListProfileChangeRequests()})
}

func (a *API) AdminReviewProfileChange(c *gin.Context) {
	var req struct {
		Status string `json:"status" binding:"required"`
		Note   string `json:"note"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid_body"})
		return
	}
	change, err := a.Store.AdminReviewProfileChange(a.userID(c), c.Param("id"), req.Status, req.Note)
	if err == nil {
		a.triggerCRM()
	}
	writeOpsResult(c, err, gin.H{"change_request": change}, http.StatusOK)
}

func (a *API) gateStaffVenue(c *gin.Context, venueID string) bool {
	if venueID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "venue_id_required"})
		return false
	}
	if err := a.Store.RequireStaffOrOwner(a.userID(c), venueID); err != nil {
		if err == store.ErrForbidden {
			c.JSON(http.StatusForbidden, gin.H{"error": "forbidden"})
			return false
		}
		c.JSON(http.StatusNotFound, gin.H{"error": "not_found"})
		return false
	}
	return true
}

func (a *API) StaffListWaiterCalls(c *gin.Context) {
	venueID := c.Query("venue_id")
	if !a.gateStaffVenue(c, venueID) {
		return
	}
	a.ListWaiterCalls(c)
}

func (a *API) StaffAcceptWaiterCall(c *gin.Context) {
	existing, err := a.Store.GetWaiterCall(c.Param("id"))
	if err != nil {
		writeOpsResult(c, err, nil, http.StatusOK)
		return
	}
	if !a.gateStaffVenue(c, existing.VenueID) {
		return
	}
	a.AcceptWaiterCall(c)
}

func (a *API) StaffCompleteWaiterCall(c *gin.Context) {
	existing, err := a.Store.GetWaiterCall(c.Param("id"))
	if err != nil {
		writeOpsResult(c, err, nil, http.StatusOK)
		return
	}
	if !a.gateStaffVenue(c, existing.VenueID) {
		return
	}
	call, err := a.Store.CompleteWaiterCall(c.Param("id"))
	writeOpsResult(c, err, gin.H{"waiter_call": call}, http.StatusOK)
}

func (a *API) StaffListOrders(c *gin.Context) {
	venueID := c.Query("venue_id")
	if !a.gateStaffVenue(c, venueID) {
		return
	}
	orders, err := a.Store.ListVenueOrders(venueID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not_found"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"orders": orders})
}

func (a *API) StaffUpdateOrderStatus(c *gin.Context) {
	var req struct {
		Status  string `json:"status" binding:"required"`
		VenueID string `json:"venue_id"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid_body"})
		return
	}
	order, err := a.Store.GetOrder(c.Param("id"))
	if err != nil {
		writeOpsResult(c, err, nil, http.StatusOK)
		return
	}
	venueID := req.VenueID
	if venueID == "" {
		venueID = c.Query("venue_id")
	}
	if venueID == "" {
		venueID = order.VenueID
	}
	if !a.gateStaffVenue(c, venueID) {
		return
	}
	if order.VenueID != venueID {
		c.JSON(http.StatusForbidden, gin.H{"error": "forbidden"})
		return
	}
	updated, err := a.Store.UpdateOrderStatus(c.Param("id"), models.OrderStatus(req.Status))
	writeOpsResult(c, err, gin.H{"order": updated}, http.StatusOK)
}

func (a *API) StaffListReservations(c *gin.Context) {
	venueID := c.Query("venue_id")
	if !a.gateStaffVenue(c, venueID) {
		return
	}
	reservations, err := a.Store.ListVenueReservationsStaff(venueID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not_found"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"reservations": reservations})
}

func writeOpsResult(c *gin.Context, err error, okBody gin.H, okStatus int) {
	switch err {
	case nil:
		c.JSON(okStatus, okBody)
	case store.ErrForbidden:
		c.JSON(http.StatusForbidden, gin.H{"error": "forbidden"})
	case store.ErrNotFound:
		c.JSON(http.StatusNotFound, gin.H{"error": "not_found"})
	case store.ErrBadRequest, store.ErrInvalidStatus:
		c.JSON(http.StatusBadRequest, gin.H{"error": "bad_request"})
	case store.ErrConflict:
		c.JSON(http.StatusConflict, gin.H{"error": "conflict"})
	default:
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal_error"})
	}
}
