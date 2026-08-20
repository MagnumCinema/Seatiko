package handlers

import (
	"net/http"
	"time"

	"github.com/foodassistant/api/internal/auth"
	"github.com/foodassistant/api/internal/models"
	"github.com/foodassistant/api/internal/store"
	"github.com/gin-gonic/gin"
)

type API struct {
	Store     *store.MemoryStore
	JWTSecret string
}

func (a *API) userID(c *gin.Context) string {
	v, _ := c.Get("userID")
	s, _ := v.(string)
	return s
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
	u, err := a.Store.GetUser(a.userID(c))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "user_not_found"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"user": u})
}

type updateMeReq struct {
	FirstName   *string `json:"first_name"`
	LastName    *string `json:"last_name"`
	DisplayName *string `json:"display_name"`
	Phone       *string `json:"phone"`
	Locale      *string `json:"locale"`
}

func (a *API) UpdateMe(c *gin.Context) {
	var req updateMeReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid_body"})
		return
	}
	u, err := a.Store.UpdateUser(a.userID(c), store.UserProfileUpdate{
		FirstName:   req.FirstName,
		LastName:    req.LastName,
		DisplayName: req.DisplayName,
		Phone:       req.Phone,
		Locale:      req.Locale,
	})
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "user_not_found"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"user": u})
}

type createReservationReq struct {
	VenueID     string    `json:"venue_id" binding:"required"`
	TableID     string    `json:"table_id" binding:"required"`
	Guests      int       `json:"guests" binding:"required,min=1"`
	ReservedFor time.Time `json:"reserved_for" binding:"required"`
}

func (a *API) CreateReservation(c *gin.Context) {
	var req createReservationReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid_body"})
		return
	}
	r, err := a.Store.CreateReservation(a.userID(c), req.VenueID, req.TableID, req.Guests, req.ReservedFor)
	switch err {
	case nil:
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
	r, err := a.Store.ConfirmArrival(a.userID(c), c.Param("id"))
	switch err {
	case nil:
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
