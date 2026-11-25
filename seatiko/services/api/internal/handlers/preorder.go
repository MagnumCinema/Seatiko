package handlers

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/seatiko/api/internal/store"
)

func writePreorderError(c *gin.Context, err error) {
	switch err {
	case store.ErrBadRequest:
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid_items"})
	case store.ErrIDDocumentRequired:
		c.JSON(http.StatusBadRequest, gin.H{"error": "id_document_required"})
	case store.ErrForbidden:
		c.JSON(http.StatusForbidden, gin.H{"error": "forbidden"})
	case store.ErrAgeVerificationRequired:
		c.JSON(http.StatusForbidden, gin.H{"error": "age_verification_required"})
	case store.ErrNotFound:
		c.JSON(http.StatusNotFound, gin.H{"error": "not_found"})
	case store.ErrPreorderDisabled:
		c.JSON(http.StatusConflict, gin.H{"error": "preorder_disabled"})
	case store.ErrPreorderClosed:
		c.JSON(http.StatusConflict, gin.H{"error": "preorder_closed"})
	case store.ErrItemUnavailable:
		c.JSON(http.StatusConflict, gin.H{"error": "item_unavailable"})
	case store.ErrAgeCheckPending:
		c.JSON(http.StatusConflict, gin.H{"error": "age_check_pending"})
	case store.ErrConflict:
		c.JSON(http.StatusConflict, gin.H{"error": "conflict"})
	default:
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal_error"})
	}
}

// GetPreorder returns the reservation's preorder (its guest, venue staff, owner or admin).
func (a *API) GetPreorder(c *gin.Context) {
	o, err := a.Store.GetPreorder(a.userID(c), c.Param("id"))
	if err != nil {
		writePreorderError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"order": o})
}

type savePreorderReq struct {
	Items []store.OrderItemInput `json:"items"`
}

// SavePreorder creates or replaces the guest's preorder for their reservation.
func (a *API) SavePreorder(c *gin.Context) {
	var req savePreorderReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid_body"})
		return
	}
	o, err := a.Store.SavePreorder(a.userID(c), c.Param("id"), req.Items)
	if err != nil {
		writePreorderError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"order": o})
}

// CancelPreorder cancels the guest's preorder before the kitchen starts it.
func (a *API) CancelPreorder(c *gin.Context) {
	o, err := a.Store.CancelPreorder(a.userID(c), c.Param("id"))
	if err != nil {
		writePreorderError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"order": o})
}

type preorderAgeCheckReq struct {
	IDDocumentChecked bool `json:"id_document_checked"`
	Approved          bool `json:"approved"`
}

// StaffPreorderAgeCheck records the in-person ID check before serving 18+ items of a preorder.
func (a *API) StaffPreorderAgeCheck(c *gin.Context) {
	var req preorderAgeCheckReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid_body"})
		return
	}
	o, err := a.Store.StaffConfirmPreorderAgeCheck(a.userID(c), c.Param("id"), req.IDDocumentChecked, req.Approved)
	if err != nil {
		writePreorderError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"order": o})
}
