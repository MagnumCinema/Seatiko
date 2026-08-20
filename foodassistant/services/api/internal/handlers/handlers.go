package handlers

import (
	"net/http"
	"time"

	"github.com/foodassistant/api/internal/auth"
	"github.com/foodassistant/api/internal/store"
	"github.com/gin-gonic/gin"
)

type API struct {
	Store     *store.MemoryStore
	JWTSecret string
}

func (a *API) Health(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{"status": "ok", "service": "foodassistant-api"})
}

func (a *API) ListCities(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{"cities": a.Store.ListCities()})
}

func (a *API) ListVenues(c *gin.Context) {
	cityID := c.Query("city_id")
	if cityID == "" {
		cityID = "city-balti"
	}
	c.JSON(http.StatusOK, gin.H{"venues": a.Store.ListVenues(cityID)})
}

func (a *API) GetVenue(c *gin.Context) {
	v, err := a.Store.GetVenue(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "venue_not_found"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"venue": v})
}

func (a *API) ListTables(c *gin.Context) {
	if _, err := a.Store.GetVenue(c.Param("id")); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "venue_not_found"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"tables": a.Store.ListTables(c.Param("id"))})
}

type registerReq struct {
	Email     string `json:"email" binding:"required,email"`
	Password  string `json:"password" binding:"required,min=6"`
	FirstName string `json:"first_name"`
	LastName  string `json:"last_name"`
	Locale    string `json:"locale"`
}

type loginReq struct {
	Email    string `json:"email" binding:"required,email"`
	Password string `json:"password" binding:"required"`
}

func (a *API) Register(c *gin.Context) {
	var req registerReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid_body"})
		return
	}
	u, err := a.Store.Register(req.Email, req.Password, req.FirstName, req.LastName, req.Locale)
	if err == store.ErrEmailTaken {
		c.JSON(http.StatusConflict, gin.H{"error": "email_taken"})
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "register_failed"})
		return
	}
	token, err := auth.IssueToken(a.JWTSecret, u.ID, u.Email, 7*24*time.Hour)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "token_failed"})
		return
	}
	c.JSON(http.StatusCreated, gin.H{"token": token, "user": u})
}

func (a *API) Login(c *gin.Context) {
	var req loginReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid_body"})
		return
	}
	u, err := a.Store.Authenticate(req.Email, req.Password)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid_credentials"})
		return
	}
	token, err := auth.IssueToken(a.JWTSecret, u.ID, u.Email, 7*24*time.Hour)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "token_failed"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"token": token, "user": u})
}

func (a *API) Me(c *gin.Context) {
	userID, _ := c.Get("userID")
	u, err := a.Store.GetUser(userID.(string))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "user_not_found"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"user": u})
}
