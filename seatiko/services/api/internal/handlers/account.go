package handlers

import (
	"log"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/seatiko/api/internal/store"
)

// RequireActiveAccount rejects tokens of deleted or unknown accounts (JWTs stay valid
// until they expire, so the account state is checked on every request).
func (a *API) RequireActiveAccount(c *gin.Context) {
	if err := a.Store.ActiveUser(a.userID(c)); err != nil {
		code := "invalid_token"
		if err == store.ErrAccountDeleted {
			code = "account_deleted"
		}
		c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": code})
		return
	}
	c.Next()
}

type deleteMeReq struct {
	Password string `json:"password" binding:"required"`
}

// DeleteMe: DELETE /me with the current password. Anonymises the guest account
// (GDPR), cancels upcoming reservations and removes the stored avatar.
func (a *API) DeleteMe(c *gin.Context) {
	var req deleteMeReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "password_required"})
		return
	}
	res, err := a.Store.DeleteAccount(a.userID(c), req.Password)
	switch err {
	case nil:
	case store.ErrWrongPassword:
		c.JSON(http.StatusForbidden, gin.H{"error": "wrong_password"})
		return
	case store.ErrForbidden:
		c.JSON(http.StatusForbidden, gin.H{"error": "role_not_allowed"})
		return
	case store.ErrNotFound:
		c.JSON(http.StatusNotFound, gin.H{"error": "user_not_found"})
		return
	default:
		c.JSON(http.StatusInternalServerError, gin.H{"error": "delete_failed"})
		return
	}
	if res.AvatarKey != "" && a.Media != nil {
		if err := a.Media.Delete(c.Request.Context(), res.AvatarKey); err != nil {
			log.Printf("delete avatar of deleted account: %v", err)
		}
	}
	a.triggerCRM()
	c.JSON(http.StatusOK, gin.H{"deleted": true, "cancelled_reservations": res.CancelledReservations})
}
