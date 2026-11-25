package handlers

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/seatiko/api/internal/models"
	"github.com/seatiko/api/internal/store"
)

// adultStatus is what staff see about a guest's 18+ permission (no other personal data).
func adultStatus(u models.User) gin.H {
	return gin.H{
		"user_id":                u.ID,
		"adult_preorder_allowed": u.AdultPreorderAllowed,
		"adult_verification":     u.AdultVerification,
	}
}

func writeAdultError(c *gin.Context, err error) {
	switch err {
	case store.ErrIDDocumentRequired:
		c.JSON(http.StatusBadRequest, gin.H{"error": "id_document_required"})
	case store.ErrBadRequest:
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid_id_document_type"})
	case store.ErrVisitRequired:
		c.JSON(http.StatusConflict, gin.H{"error": "visit_required"})
	case store.ErrForbidden:
		c.JSON(http.StatusForbidden, gin.H{"error": "forbidden"})
	case store.ErrNotFound:
		c.JSON(http.StatusNotFound, gin.H{"error": "not_found"})
	default:
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal_error"})
	}
}

type adultGrantReq struct {
	IDDocumentChecked bool   `json:"id_document_checked"`
	IDDocumentType    string `json:"id_document_type"`
}

// StaffGrantAdultPreorder: staff confirm in person that the checked-in guest of this
// reservation is 18+, after seeing an ID. Recorded on the staff member's account.
func (a *API) StaffGrantAdultPreorder(c *gin.Context) {
	var req adultGrantReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid_body"})
		return
	}
	guest, err := a.Store.GrantAdultPreorder(a.userID(c), c.Param("id"), store.AdultGrantInput{
		IDDocumentChecked: req.IDDocumentChecked,
		IDDocumentType:    req.IDDocumentType,
	})
	if err != nil {
		writeAdultError(c, err)
		return
	}
	a.triggerCRM()
	c.JSON(http.StatusOK, adultStatus(guest))
}

type adultRevokeReq struct {
	Reason string `json:"reason"`
}

// StaffRevokeAdultPreorder: the venue owner or a platform admin withdraws 18+ preorder.
func (a *API) StaffRevokeAdultPreorder(c *gin.Context) {
	var req adultRevokeReq
	if c.Request.ContentLength > 0 {
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid_body"})
			return
		}
	}
	guest, err := a.Store.RevokeAdultPreorder(a.userID(c), c.Param("venueId"), c.Param("userId"), req.Reason)
	if err != nil {
		writeAdultError(c, err)
		return
	}
	a.triggerCRM()
	c.JSON(http.StatusOK, adultStatus(guest))
}

// MyPreorderMenu is the venue menu for preordering as the current guest, with
// requires_age_18 items marked not orderable until staff grant 18+.
func (a *API) MyPreorderMenu(c *gin.Context) {
	items, err := a.Store.PreorderMenu(a.userID(c), c.Param("id"))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "venue_not_found"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"menu": items})
}

// AdminAdultPermissionLog is the 18+ grant / revoke audit, optionally for one guest.
func (a *API) AdminAdultPermissionLog(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{"entries": a.Store.ListAdultPermissionLog(c.Query("user_id"))})
}
