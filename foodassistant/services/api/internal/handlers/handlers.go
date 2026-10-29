package handlers

import (
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/foodassistant/api/internal/auth"
	"github.com/foodassistant/api/internal/crm"
	"github.com/foodassistant/api/internal/models"
	"github.com/foodassistant/api/internal/places"
	"github.com/foodassistant/api/internal/store"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

type API struct {
	Store     *store.MemoryStore
	CRM       *crm.Syncer
	Places    *places.Client
	JWTSecret string
	UploadDir string
}

func (a *API) triggerCRM() {
	if a.CRM != nil {
		a.CRM.Trigger()
	}
}

func (a *API) userID(c *gin.Context) string {
	v, _ := c.Get("userID")
	s, _ := v.(string)
	return s
}

func (a *API) Health(c *gin.Context) {
	response := gin.H{"status": "ok", "service": "foodassistant-api"}
	if a.CRM != nil {
		response["crm"] = a.CRM.Status()
	}
	c.JSON(http.StatusOK, response)
}

func (a *API) CRMStatus(c *gin.Context) {
	if a.CRM == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"enabled": false, "healthy": false})
		return
	}
	c.JSON(http.StatusOK, a.CRM.Status())
}

func (a *API) TwentyWebhook(c *gin.Context) {
	if a.CRM == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "crm_disabled"})
		return
	}
	payload, err := io.ReadAll(io.LimitReader(c.Request.Body, 2<<20))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid_body"})
		return
	}
	applied, err := a.CRM.HandleWebhook(
		payload,
		c.GetHeader("X-Twenty-Webhook-Signature"),
		c.GetHeader("X-Twenty-Webhook-Timestamp"),
	)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid_webhook"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"accepted": true, "applied": applied})
}

func (a *API) ReconcileCRM(c *gin.Context) {
	if a.CRM == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "crm_disabled"})
		return
	}
	if err := a.CRM.Reconcile(c.Request.Context()); err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": "crm_sync_failed"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": "synchronized"})
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

func (a *API) ListMapPlaces(c *gin.Context) {
	cityID := c.Query("city_id")
	if cityID == "" {
		cityID = "city-balti"
	}
	const (
		baltiLat = 47.7622
		baltiLng = 27.9289
		radiusM  = 4000.0
	)

	venues := a.Store.ListVenues(cityID)
	var googlePlaces []places.GoogleFoodPlace
	googleEnabled := a.Places != nil && a.Places.Enabled()
	if googleEnabled {
		found, err := a.Places.SearchNearbyFood(c.Request.Context(), baltiLat, baltiLng, radiusM)
		if err != nil {
			log.Printf("map places google: %v", err)
			googleEnabled = false
		} else {
			googlePlaces = found
		}
	}

	merged := places.MergeMapPlaces(venues, googlePlaces)
	resp := models.MapPlacesResponse{
		CityID: cityID,
		Places: merged,
	}
	resp.Center.Lat = baltiLat
	resp.Center.Lng = baltiLng
	resp.Source.GoogleEnabled = googleEnabled
	resp.Source.GoogleCount = len(googlePlaces)
	resp.Source.DatabaseCount = len(venues)
	c.JSON(http.StatusOK, resp)
}

func (a *API) GetVenue(c *gin.Context) {
	v, err := a.Store.GetVenue(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "venue_not_found"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"venue": v})
}

func (a *API) GetVenuePlaces(c *gin.Context) {
	v, err := a.Store.GetVenue(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "venue_not_found"})
		return
	}

	source := "local"
	photos := append([]string(nil), v.PhotoURLs...)
	if len(photos) == 0 && v.ImageURL != "" {
		photos = []string{v.ImageURL}
	}
	reviews := append([]models.VenueReview(nil), v.Reviews...)
	rating := v.Rating
	reviewCount := v.ReviewCount
	placeID := v.GooglePlaceID

	if a.Places != nil && a.Places.Enabled() {
		enriched, enrichErr := a.Places.Enrich(
			c.Request.Context(),
			v.Name.RU,
			v.Address.RU,
			v.Lat,
			v.Lng,
			v.GooglePlaceID,
		)
		if enrichErr == nil {
			source = "google"
			placeID = enriched.PlaceID
			if enriched.Rating > 0 {
				rating = enriched.Rating
			}
			if enriched.ReviewCount > 0 {
				reviewCount = enriched.ReviewCount
			}
			if len(enriched.PhotoURLs) > 0 {
				photos = enriched.PhotoURLs
			}
			if len(enriched.Reviews) > 0 {
				reviews = enriched.Reviews
			}
			_ = a.Store.ApplyVenuePlaces(v.ID, placeID, rating, reviewCount, photos, reviews)
		} else {
			log.Printf("places enrich %s: %v", v.ID, enrichErr)
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"source":       source,
		"google_place_id": placeID,
		"rating":       rating,
		"review_count": reviewCount,
		"photo_urls":   photos,
		"reviews":      reviews,
		"live_google":  a.Places != nil && a.Places.Enabled(),
	})
}

func (a *API) ListTables(c *gin.Context) {
	if _, err := a.Store.GetVenue(c.Param("id")); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "venue_not_found"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"tables": a.Store.ListTables(c.Param("id"))})
}

func (a *API) ListVenueSchedule(c *gin.Context) {
	slots, err := a.Store.ListVenueSchedule(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "venue_not_found"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"slots": slots})
}

func (a *API) ListMenu(c *gin.Context) {
	items, err := a.Store.ListMenu(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "venue_not_found"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"menu": items})
}

func (a *API) ListCollections(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{"collections": a.Store.ListCollections()})
}

type aiDiscoverReq struct {
	Query string `json:"query"`
}

func (a *API) AIDiscover(c *gin.Context) {
	var req aiDiscoverReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid_body"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"venues": a.Store.AIRecommend(req.Query)})
}

type registerReq struct {
	Email     string `json:"email" binding:"required,email"`
	Password  string `json:"password" binding:"required,min=6"`
	FirstName string `json:"first_name"`
	LastName  string `json:"last_name"`
	Locale    string `json:"locale"`
	Role      string `json:"role"`
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
	u, err := a.Store.Register(req.Email, req.Password, req.FirstName, req.LastName, req.Locale, req.Role)
	if err == store.ErrEmailTaken {
		c.JSON(http.StatusConflict, gin.H{"error": "email_taken"})
		return
	}
	if err == store.ErrBadRequest {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid_role"})
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
	a.triggerCRM()
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
	u, err := a.Store.GetUser(a.userID(c))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "user_not_found"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"user": u})
}

type updateMeReq struct {
	FirstName       *string   `json:"first_name"`
	LastName        *string   `json:"last_name"`
	DisplayName     *string   `json:"display_name"`
	Phone           *string   `json:"phone"`
	Locale          *string   `json:"locale"`
	DietPreferences *[]string `json:"diet_preferences"`
	FavoriteVenues  *[]string `json:"favorite_venues"`
}

func (a *API) UpdateMe(c *gin.Context) {
	var req updateMeReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid_body"})
		return
	}
	u, err := a.Store.UpdateUser(a.userID(c), store.UserProfileUpdate{
		FirstName:       req.FirstName,
		LastName:        req.LastName,
		DisplayName:     req.DisplayName,
		Phone:           req.Phone,
		Locale:          req.Locale,
		DietPreferences: req.DietPreferences,
		FavoriteVenues:  req.FavoriteVenues,
	})
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "user_not_found"})
		return
	}
	a.triggerCRM()
	c.JSON(http.StatusOK, gin.H{"user": u})
}

type createReservationReq struct {
	VenueID     string    `json:"venue_id" binding:"required"`
	TableID     string    `json:"table_id" binding:"required"`
	Guests      int       `json:"guests" binding:"required,min=1"`
	ReservedFor time.Time `json:"reserved_for" binding:"required"`
	Source      string    `json:"source"`
}

func (a *API) CreateReservation(c *gin.Context) {
	var req createReservationReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid_body"})
		return
	}
	r, err := a.Store.CreateReservation(a.userID(c), req.VenueID, req.TableID, req.Guests, req.ReservedFor, req.Source)
	switch err {
	case nil:
		a.triggerCRM()
		c.JSON(http.StatusCreated, gin.H{"reservation": r})
	case store.ErrTableNotFree:
		c.JSON(http.StatusConflict, gin.H{"error": "table_not_free"})
	case store.ErrBadRequest:
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid_guests"})
	case store.ErrNotFound:
		c.JSON(http.StatusNotFound, gin.H{"error": "not_found"})
	default:
		c.JSON(http.StatusInternalServerError, gin.H{"error": "create_failed"})
	}
}

func (a *API) ListReservations(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{"reservations": a.Store.ListReservations(a.userID(c))})
}

func (a *API) ConfirmArrival(c *gin.Context) {
	var body struct {
		ExpectedArrival *time.Time `json:"expected_arrival"`
	}
	_ = c.ShouldBindJSON(&body)
	r, err := a.Store.ConfirmArrival(a.userID(c), c.Param("id"), body.ExpectedArrival)
	switch err {
	case nil:
		a.triggerCRM()
		c.JSON(http.StatusOK, gin.H{"reservation": r})
	case store.ErrNotFound:
		c.JSON(http.StatusNotFound, gin.H{"error": "reservation_not_found"})
	case store.ErrForbidden:
		c.JSON(http.StatusForbidden, gin.H{"error": "forbidden"})
	case store.ErrConflict:
		c.JSON(http.StatusConflict, gin.H{"error": "invalid_status"})
	default:
		c.JSON(http.StatusInternalServerError, gin.H{"error": "confirm_failed"})
	}
}

type watchTableReq struct {
	VenueID string `json:"venue_id" binding:"required"`
}

func (a *API) WatchTable(c *gin.Context) {
	var req watchTableReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid_body"})
		return
	}
	w, err := a.Store.CreateTableWatch(a.userID(c), req.VenueID, c.Param("id"))
	if err == store.ErrNotFound {
		c.JSON(http.StatusNotFound, gin.H{"error": "not_found"})
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "watch_failed"})
		return
	}
	c.JSON(http.StatusCreated, gin.H{"watch": w})
}

type scanQRReq struct {
	VenueID string `json:"venue_id" binding:"required"`
	TableID string `json:"table_id" binding:"required"`
	Token   string `json:"token"`
}

func (a *API) ScanQR(c *gin.Context) {
	var req scanQRReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid_body"})
		return
	}
	sess, err := a.Store.ScanQR(a.userID(c), req.VenueID, req.TableID, req.Token)
	switch err {
	case nil:
		c.JSON(http.StatusCreated, gin.H{"session": sess})
	case store.ErrInvalidQR:
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid_qr_token"})
	case store.ErrNotFound:
		c.JSON(http.StatusNotFound, gin.H{"error": "not_found"})
	case store.ErrForbidden:
		c.JSON(http.StatusForbidden, gin.H{"error": "forbidden"})
	case store.ErrConflict:
		c.JSON(http.StatusConflict, gin.H{"error": "table_unavailable"})
	default:
		c.JSON(http.StatusInternalServerError, gin.H{"error": "scan_failed"})
	}
}

func (a *API) GetSession(c *gin.Context) {
	sess, err := a.Store.GetSession(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "session_not_found"})
		return
	}
	if sess.UserID != a.userID(c) {
		c.JSON(http.StatusForbidden, gin.H{"error": "forbidden"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"session": sess})
}

func (a *API) CloseSession(c *gin.Context) {
	sess, err := a.Store.CloseSession(a.userID(c), c.Param("id"))
	switch err {
	case nil:
		c.JSON(http.StatusOK, gin.H{"session": sess})
	case store.ErrNotFound:
		c.JSON(http.StatusNotFound, gin.H{"error": "session_not_found"})
	case store.ErrForbidden:
		c.JSON(http.StatusForbidden, gin.H{"error": "forbidden"})
	case store.ErrSessionClosed:
		c.JSON(http.StatusConflict, gin.H{"error": "session_closed"})
	default:
		c.JSON(http.StatusInternalServerError, gin.H{"error": "close_failed"})
	}
}

type createOrderReq struct {
	Items []store.OrderItemInput `json:"items" binding:"required,min=1"`
}

func (a *API) CreateOrder(c *gin.Context) {
	var req createOrderReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid_body"})
		return
	}
	o, err := a.Store.CreateOrder(c.Param("id"), a.userID(c), req.Items)
	switch err {
	case nil:
		c.JSON(http.StatusCreated, gin.H{"order": o})
	case store.ErrNotFound:
		c.JSON(http.StatusNotFound, gin.H{"error": "not_found"})
	case store.ErrForbidden:
		c.JSON(http.StatusForbidden, gin.H{"error": "forbidden"})
	case store.ErrSessionClosed:
		c.JSON(http.StatusConflict, gin.H{"error": "session_closed"})
	case store.ErrBadRequest:
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid_items"})
	default:
		c.JSON(http.StatusInternalServerError, gin.H{"error": "order_failed"})
	}
}

func (a *API) ListOrders(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{"orders": a.Store.ListOrders(a.userID(c))})
}

func (a *API) GetOrder(c *gin.Context) {
	o, err := a.Store.GetOrder(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "order_not_found"})
		return
	}
	if o.UserID != a.userID(c) {
		c.JSON(http.StatusForbidden, gin.H{"error": "forbidden"})
		return
	}
	if venue, err := a.Store.GetVenue(o.VenueID); err == nil {
		o.VenueName = venue.Name
	}
	c.JSON(http.StatusOK, gin.H{"order": o})
}

type payOrderReq struct {
	OrderID string `json:"order_id"`
	Method  string `json:"method"`
}

func (a *API) PayOrder(c *gin.Context) {
	var req payOrderReq
	if err := c.ShouldBindJSON(&req); err != nil || strings.TrimSpace(req.OrderID) == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid_body"})
		return
	}
	o, err := a.Store.PayOrder(a.userID(c), req.OrderID, req.Method)
	switch err {
	case nil:
		status := "paid"
		if o.Status != models.OrderPaid {
			status = "pending"
		}
		c.JSON(http.StatusOK, gin.H{"status": status, "order": o})
	case store.ErrNotFound:
		c.JSON(http.StatusNotFound, gin.H{"error": "order_not_found"})
	case store.ErrForbidden:
		c.JSON(http.StatusForbidden, gin.H{"error": "forbidden"})
	case store.ErrConflict:
		c.JSON(http.StatusConflict, gin.H{"error": "conflict"})
	case store.ErrBadRequest:
		c.JSON(http.StatusBadRequest, gin.H{"error": "bad_request"})
	default:
		c.JSON(http.StatusInternalServerError, gin.H{"error": "payment_failed"})
	}
}

type waiterCallReq struct {
	Reason models.WaiterCallReason `json:"reason" binding:"required"`
}

func (a *API) CreateWaiterCall(c *gin.Context) {
	var req waiterCallReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid_body"})
		return
	}
	// ensure session belongs to caller
	sess, err := a.Store.GetSession(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "session_not_found"})
		return
	}
	if sess.UserID != a.userID(c) {
		c.JSON(http.StatusForbidden, gin.H{"error": "forbidden"})
		return
	}
	wc, err := a.Store.CreateWaiterCall(c.Param("id"), req.Reason)
	switch err {
	case nil:
		c.JSON(http.StatusCreated, gin.H{"waiter_call": wc})
	case store.ErrNotFound:
		c.JSON(http.StatusNotFound, gin.H{"error": "session_not_found"})
	case store.ErrSessionClosed:
		c.JSON(http.StatusConflict, gin.H{"error": "session_closed"})
	case store.ErrBadRequest:
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid_reason"})
	default:
		c.JSON(http.StatusInternalServerError, gin.H{"error": "call_failed"})
	}
}

func (a *API) ListWaiterCalls(c *gin.Context) {
	venueID := c.Query("venue_id")
	calls, err := a.Store.ListWaiterCalls(venueID)
	switch err {
	case nil:
		c.JSON(http.StatusOK, gin.H{"waiter_calls": calls})
	case store.ErrBadRequest:
		c.JSON(http.StatusBadRequest, gin.H{"error": "venue_id_required"})
	case store.ErrNotFound:
		c.JSON(http.StatusNotFound, gin.H{"error": "venue_not_found"})
	default:
		c.JSON(http.StatusInternalServerError, gin.H{"error": "list_failed"})
	}
}

func (a *API) AcceptWaiterCall(c *gin.Context) {
	wc, err := a.Store.AcceptWaiterCall(c.Param("id"))
	switch err {
	case nil:
		c.JSON(http.StatusOK, gin.H{"waiter_call": wc})
	case store.ErrNotFound:
		c.JSON(http.StatusNotFound, gin.H{"error": "not_found"})
	case store.ErrConflict:
		c.JSON(http.StatusConflict, gin.H{"error": "already_accepted"})
	default:
		c.JSON(http.StatusInternalServerError, gin.H{"error": "accept_failed"})
	}
}

func (a *API) CreateRestaurantApplication(c *gin.Context) {
	app, err := a.Store.CreateApplication(a.userID(c))
	switch err {
	case nil:
		a.triggerCRM()
		c.JSON(http.StatusCreated, gin.H{"application": app})
	case store.ErrForbidden:
		c.JSON(http.StatusForbidden, gin.H{"error": "forbidden"})
	case store.ErrNotFound:
		c.JSON(http.StatusNotFound, gin.H{"error": "user_not_found"})
	default:
		c.JSON(http.StatusInternalServerError, gin.H{"error": "create_failed"})
	}
}

func (a *API) ListMyApplications(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{"applications": a.Store.ListApplicationsByOwner(a.userID(c))})
}

func (a *API) GetMyApplication(c *gin.Context) {
	app, err := a.Store.GetApplication(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not_found"})
		return
	}
	if app.OwnerUserID != a.userID(c) {
		u, uerr := a.Store.GetUser(a.userID(c))
		if uerr != nil || u.Role != models.RoleAdmin {
			c.JSON(http.StatusForbidden, gin.H{"error": "forbidden"})
			return
		}
	}
	c.JSON(http.StatusOK, gin.H{"application": app})
}

func (a *API) ListApplicationActivity(c *gin.Context) {
	activity, err := a.Store.ListApplicationActivity(a.userID(c), c.Param("id"))
	switch err {
	case nil:
		c.JSON(http.StatusOK, gin.H{"activity": activity})
	case store.ErrNotFound:
		c.JSON(http.StatusNotFound, gin.H{"error": "not_found"})
	case store.ErrForbidden:
		c.JSON(http.StatusForbidden, gin.H{"error": "forbidden"})
	default:
		c.JSON(http.StatusInternalServerError, gin.H{"error": "list_failed"})
	}
}

func (a *API) ListRestaurantReservations(c *gin.Context) {
	reservations, err := a.Store.ListRestaurantReservations(a.userID(c))
	switch err {
	case nil:
		c.JSON(http.StatusOK, gin.H{"reservations": reservations})
	case store.ErrNotFound:
		c.JSON(http.StatusNotFound, gin.H{"error": "not_found"})
	case store.ErrForbidden:
		c.JSON(http.StatusForbidden, gin.H{"error": "forbidden"})
	default:
		c.JSON(http.StatusInternalServerError, gin.H{"error": "list_failed"})
	}
}

type updateApplicationReq struct {
	Name         *models.LocalizedString `json:"name"`
	Description  *models.LocalizedString `json:"description"`
	Address      *models.LocalizedString `json:"address"`
	Cuisine      *[]string               `json:"cuisine"`
	Phone        *string                 `json:"phone"`
	Email        *string                 `json:"email"`
	Website      *string                 `json:"website"`
	CityID       *string                 `json:"city_id"`
	Lat          *float64                `json:"lat"`
	Lng          *float64                `json:"lng"`
	PriceLevel   *int                    `json:"price_level"`
	AverageCheck *int                    `json:"average_check"`
	HoursText    *string                 `json:"hours_text"`
}

func (a *API) UpdateRestaurantApplication(c *gin.Context) {
	var req updateApplicationReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid_body"})
		return
	}
	app, err := a.Store.UpdateApplication(a.userID(c), c.Param("id"), store.ApplicationUpdate{
		Name:         req.Name,
		Description:  req.Description,
		Address:      req.Address,
		Cuisine:      req.Cuisine,
		Phone:        req.Phone,
		Email:        req.Email,
		Website:      req.Website,
		CityID:       req.CityID,
		Lat:          req.Lat,
		Lng:          req.Lng,
		PriceLevel:   req.PriceLevel,
		AverageCheck: req.AverageCheck,
		HoursText:    req.HoursText,
	})
	switch err {
	case nil:
		a.triggerCRM()
		c.JSON(http.StatusOK, gin.H{"application": app})
	case store.ErrNotFound:
		c.JSON(http.StatusNotFound, gin.H{"error": "not_found"})
	case store.ErrForbidden:
		c.JSON(http.StatusForbidden, gin.H{"error": "forbidden"})
	case store.ErrConflict:
		c.JSON(http.StatusConflict, gin.H{"error": "not_editable"})
	case store.ErrBadRequest:
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid_fields"})
	default:
		c.JSON(http.StatusInternalServerError, gin.H{"error": "update_failed"})
	}
}

const maxPhotoBytes = 5 << 20 // 5MB

var allowedPhotoTypes = map[string]string{
	"image/jpeg": ".jpg",
	"image/png":  ".png",
	"image/webp": ".webp",
}

func (a *API) UploadApplicationPhoto(c *gin.Context) {
	file, err := c.FormFile("photo")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "photo_required"})
		return
	}
	if file.Size > maxPhotoBytes {
		c.JSON(http.StatusBadRequest, gin.H{"error": "file_too_large"})
		return
	}

	src, err := file.Open()
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid_file"})
		return
	}
	defer src.Close()

	header := make([]byte, 512)
	n, _ := io.ReadFull(src, header)
	contentType := http.DetectContentType(header[:n])
	// webp sniff may come back as application/octet-stream; fall back to extension
	ext, ok := allowedPhotoTypes[contentType]
	if !ok {
		lower := strings.ToLower(file.Filename)
		switch {
		case strings.HasSuffix(lower, ".webp") && (contentType == "application/octet-stream" || contentType == "image/webp"):
			ext, ok = ".webp", true
		case strings.HasSuffix(lower, ".jpg") || strings.HasSuffix(lower, ".jpeg"):
			if contentType == "image/jpeg" {
				ext, ok = ".jpg", true
			}
		case strings.HasSuffix(lower, ".png"):
			if contentType == "image/png" {
				ext, ok = ".png", true
			}
		}
	}
	if !ok {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid_file_type"})
		return
	}

	if err := os.MkdirAll(a.UploadDir, 0o755); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "upload_failed"})
		return
	}

	filename := uuid.NewString() + ext
	dstPath := filepath.Join(a.UploadDir, filename)
	dst, err := os.Create(dstPath)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "upload_failed"})
		return
	}
	defer dst.Close()

	if _, err := dst.Write(header[:n]); err != nil {
		_ = os.Remove(dstPath)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "upload_failed"})
		return
	}
	if _, err := io.Copy(dst, src); err != nil {
		_ = os.Remove(dstPath)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "upload_failed"})
		return
	}

	url := "/uploads/" + filename
	app, err := a.Store.AddPhoto(a.userID(c), c.Param("id"), url)
	switch err {
	case nil:
		a.triggerCRM()
		c.JSON(http.StatusCreated, gin.H{"application": app, "url": url})
	case store.ErrNotFound:
		_ = os.Remove(dstPath)
		c.JSON(http.StatusNotFound, gin.H{"error": "not_found"})
	case store.ErrForbidden:
		_ = os.Remove(dstPath)
		c.JSON(http.StatusForbidden, gin.H{"error": "forbidden"})
	case store.ErrConflict:
		_ = os.Remove(dstPath)
		c.JSON(http.StatusConflict, gin.H{"error": "not_editable"})
	case store.ErrBadRequest:
		_ = os.Remove(dstPath)
		c.JSON(http.StatusBadRequest, gin.H{"error": "max_photos"})
	default:
		_ = os.Remove(dstPath)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "upload_failed"})
	}
}

type removePhotoReq struct {
	URL string `json:"url" binding:"required"`
}

func (a *API) RemoveApplicationPhoto(c *gin.Context) {
	var req removePhotoReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid_body"})
		return
	}
	app, err := a.Store.RemovePhoto(a.userID(c), c.Param("id"), req.URL)
	switch err {
	case nil:
		// Best-effort delete of local file under uploads
		if strings.HasPrefix(req.URL, "/uploads/") {
			name := filepath.Base(req.URL)
			_ = os.Remove(filepath.Join(a.UploadDir, name))
		}
		a.triggerCRM()
		c.JSON(http.StatusOK, gin.H{"application": app})
	case store.ErrNotFound:
		c.JSON(http.StatusNotFound, gin.H{"error": "not_found"})
	case store.ErrForbidden:
		c.JSON(http.StatusForbidden, gin.H{"error": "forbidden"})
	case store.ErrConflict:
		c.JSON(http.StatusConflict, gin.H{"error": "not_editable"})
	default:
		c.JSON(http.StatusInternalServerError, gin.H{"error": "remove_failed"})
	}
}

func (a *API) SubmitRestaurantApplication(c *gin.Context) {
	app, err := a.Store.SubmitApplication(a.userID(c), c.Param("id"))
	switch err {
	case nil:
		a.triggerCRM()
		c.JSON(http.StatusOK, gin.H{"application": app})
	case store.ErrNotFound:
		c.JSON(http.StatusNotFound, gin.H{"error": "not_found"})
	case store.ErrForbidden:
		c.JSON(http.StatusForbidden, gin.H{"error": "forbidden"})
	case store.ErrConflict:
		c.JSON(http.StatusConflict, gin.H{"error": "invalid_status"})
	case store.ErrBadRequest:
		c.JSON(http.StatusBadRequest, gin.H{"error": "incomplete"})
	default:
		c.JSON(http.StatusInternalServerError, gin.H{"error": "submit_failed"})
	}
}

func (a *API) AdminListApplications(c *gin.Context) {
	status := c.Query("status")
	c.JSON(http.StatusOK, gin.H{"applications": a.Store.ListAllApplications(status)})
}

type adminReviewReq struct {
	Status       string `json:"status" binding:"required"`
	RejectReason string `json:"reject_reason"`
}

func (a *API) AdminReviewApplication(c *gin.Context) {
	var req adminReviewReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid_body"})
		return
	}
	app, err := a.Store.AdminSetStatus(a.userID(c), c.Param("id"), models.ApplicationStatus(req.Status), req.RejectReason)
	switch err {
	case nil:
		a.triggerCRM()
		c.JSON(http.StatusOK, gin.H{"application": app})
	case store.ErrNotFound:
		c.JSON(http.StatusNotFound, gin.H{"error": "not_found"})
	case store.ErrForbidden:
		c.JSON(http.StatusForbidden, gin.H{"error": "forbidden"})
	case store.ErrInvalidStatus:
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid_status"})
	case store.ErrBadRequest:
		c.JSON(http.StatusBadRequest, gin.H{"error": "reject_reason_required"})
	default:
		c.JSON(http.StatusInternalServerError, gin.H{"error": "review_failed"})
	}
}

func (a *API) AdminPublishApplication(c *gin.Context) {
	app, err := a.Store.PublishApplication(a.userID(c), c.Param("id"))
	switch err {
	case nil:
		a.triggerCRM()
		c.JSON(http.StatusOK, gin.H{"application": app, "venue_id": app.VenueID})
	case store.ErrNotFound:
		c.JSON(http.StatusNotFound, gin.H{"error": "not_found"})
	case store.ErrForbidden:
		c.JSON(http.StatusForbidden, gin.H{"error": "forbidden"})
	case store.ErrConflict:
		c.JSON(http.StatusConflict, gin.H{"error": "not_approvable"})
	default:
		c.JSON(http.StatusInternalServerError, gin.H{"error": "publish_failed"})
	}
}
