package handlers

import (
	"io"
	"log"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/seatiko/api/internal/media"
)

// UploadAvatar: POST /me/avatar (multipart field "file" or "avatar", JPEG/PNG/WebP up to 5 MB).
// Stored as a 512×512 JPEG (centre crop, EXIF removed) in S3 or the local upload dir.
func (a *API) UploadAvatar(c *gin.Context) {
	if a.Media == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "uploads_disabled"})
		return
	}
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, media.MaxAvatarBytes+64<<10)
	file, err := c.FormFile("file")
	if err != nil {
		file, err = c.FormFile("avatar")
	}
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "file_required"})
		return
	}
	if file.Size > media.MaxAvatarBytes {
		c.JSON(http.StatusRequestEntityTooLarge, gin.H{"error": "file_too_large"})
		return
	}
	f, err := file.Open()
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "file_required"})
		return
	}
	defer f.Close()
	raw, err := io.ReadAll(io.LimitReader(f, media.MaxAvatarBytes+1))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "file_required"})
		return
	}
	out, err := media.ProcessAvatar(raw)
	switch err {
	case nil:
	case media.ErrTooLarge:
		c.JSON(http.StatusRequestEntityTooLarge, gin.H{"error": "file_too_large"})
		return
	default:
		c.JSON(http.StatusUnsupportedMediaType, gin.H{"error": "unsupported_image"})
		return
	}

	userID := a.userID(c)
	key := "avatars/" + userID + "/" + uuid.NewString() + ".jpg"
	url, err := a.Media.Put(c.Request.Context(), key, "image/jpeg", out)
	if err != nil {
		log.Printf("avatar upload: %v", err)
		c.JSON(http.StatusBadGateway, gin.H{"error": "storage_unavailable"})
		return
	}
	user, previous, err := a.Store.SetAvatar(userID, url, key)
	if err != nil {
		_ = a.Media.Delete(c.Request.Context(), key)
		c.JSON(http.StatusNotFound, gin.H{"error": "user_not_found"})
		return
	}
	if previous != "" {
		if err := a.Media.Delete(c.Request.Context(), previous); err != nil {
			log.Printf("delete previous avatar: %v", err)
		}
	}
	c.JSON(http.StatusOK, gin.H{"user": user})
}

// DeleteAvatar: DELETE /me/avatar removes the photo from storage and the profile.
func (a *API) DeleteAvatar(c *gin.Context) {
	user, previous, err := a.Store.SetAvatar(a.userID(c), "", "")
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "user_not_found"})
		return
	}
	if previous != "" && a.Media != nil {
		if err := a.Media.Delete(c.Request.Context(), previous); err != nil {
			log.Printf("delete avatar: %v", err)
		}
	}
	c.JSON(http.StatusOK, gin.H{"user": user})
}
