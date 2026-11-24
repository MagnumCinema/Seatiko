package main

import (
	"context"
	"log"
	"os"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/seatiko/api/internal/apidocs"
	"github.com/seatiko/api/internal/auth"
	"github.com/seatiko/api/internal/config"
	"github.com/seatiko/api/internal/crm"
	"github.com/seatiko/api/internal/handlers"
	"github.com/seatiko/api/internal/models"
	"github.com/seatiko/api/internal/places"
	"github.com/seatiko/api/internal/store"
)

func main() {
	cfg := config.Load()
	if err := os.MkdirAll(cfg.UploadDir, 0o755); err != nil {
		log.Fatalf("upload dir: %v", err)
	}

	mem, err := store.NewPersistent(cfg.DataFile)
	if err != nil {
		log.Fatalf("load persistent state: %v", err)
	}
	var crmSyncer *crm.Syncer
	if cfg.TwentyAPIKey != "" {
		crmSyncer = crm.NewSyncer(
			crm.NewClient(cfg.TwentyBaseURL, cfg.TwentyAPIKey),
			mem,
			cfg.TwentyWebhookSecret,
			cfg.TwentySyncInterval,
		)
		go crmSyncer.Run(context.Background())
		log.Printf("Twenty CRM synchronization enabled")
	} else {
		log.Printf("Twenty CRM synchronization disabled: TWENTY_API_KEY is empty")
	}
	api := &handlers.API{
		Store:        mem,
		CRM:          crmSyncer,
		CRMPublicURL: cfg.TwentyPublicURL,
		Maps: places.NewIntegration(cfg.GoogleConfigFile, places.Credentials{
			PlacesKey: cfg.GooglePlacesAPIKey, BrowserKey: cfg.GoogleMapsBrowserKey, MapID: cfg.GoogleMapsMapID,
		}),
		JWTSecret: cfg.JWTSecret,
		UploadDir: cfg.UploadDir,
	}

	r := newRouter(api)
	log.Printf("Seatiko API listening on %s", cfg.Addr)
	if err := r.Run(cfg.Addr); err != nil {
		log.Fatal(err)
	}
}

func newRouter(api *handlers.API) *gin.Engine {
	r := gin.Default()
	apidocs.Register(r)
	r.Use(corsMiddleware())
	r.MaxMultipartMemory = 8 << 20 // 8 MiB

	r.GET("/healthz", api.Health)
	r.Static("/uploads", api.UploadDir)

	getRole := func(userID string) (string, error) {
		u, err := api.Store.GetUser(userID)
		if err != nil {
			return "", err
		}
		return u.Role, nil
	}

	v1 := r.Group("/api/v1")
	{
		v1.GET("/integrations/twenty/status", api.CRMStatus)
		v1.POST("/integrations/twenty/webhook", api.TwentyWebhook)
		v1.GET("/cities", api.ListCities)
		v1.GET("/venues", api.ListVenues)
		v1.GET("/availability", auth.RateLimitMiddleware(60, time.Minute), api.SearchAvailability)
		v1.GET("/map/config", api.GetMapConfig)
		v1.GET("/map/places", auth.RateLimitMiddleware(30, time.Minute), api.ListMapPlaces)
		v1.GET("/places/photo", api.PlacePhoto)
		v1.GET("/venues/:id", api.GetVenue)
		v1.GET("/venues/:id/places", api.GetVenuePlaces)
		v1.GET("/venues/:id/tables", api.ListTables)
		v1.GET("/venues/:id/schedule", api.ListVenueSchedule)
		v1.GET("/venues/:id/menu", api.ListMenu)
		v1.GET("/venues/:id/waitlist/summary", api.GetWaitlistSummary)
		v1.GET("/collections", api.ListCollections)
		v1.POST("/discover/ai", api.AIDiscover)

		authLimit := auth.RateLimitMiddleware(40, time.Minute)
		v1.POST("/auth/register", authLimit, api.Register)
		v1.POST("/auth/login", authLimit, api.Login)

		authed := v1.Group("/")
		authed.Use(auth.Middleware(api.JWTSecret))
		{
			authed.GET("/me", api.Me)
			authed.PATCH("/me", api.UpdateMe)
			authed.PATCH("/me/email", api.UpdateEmail)
			authed.PATCH("/me/password", api.UpdatePassword)
			authed.GET("/me/venues/:id/preorder-menu", api.MyPreorderMenu)
			authed.POST("/staff/invites/:id/accept", api.AcceptStaffInvite)

			authed.POST("/reservations", api.CreateReservation)
			authed.GET("/reservations", api.ListReservations)
			authed.PATCH("/reservations/:id", api.UpdateReservation)
			authed.POST("/reservations/:id/confirm-arrival", api.ConfirmArrival)
			authed.POST("/reservations/:id/cancel", api.CancelReservation)
			authed.GET("/reservations/:id/preorder", api.GetPreorder)
			authed.PUT("/reservations/:id/preorder", api.SavePreorder)
			authed.DELETE("/reservations/:id/preorder", api.CancelPreorder)
			authed.DELETE("/reservations/:id", api.DeleteReservation)
			authed.DELETE("/reservations/history", api.ClearHistoryReservations)

			authed.POST("/event-inquiries", api.CreateEventInquiry)
			authed.GET("/event-inquiries", api.ListEventInquiries)

			authed.POST("/tables/:id/watch", api.WatchTable)

			authed.POST("/waitlist", api.JoinWaitlist)
			authed.GET("/waitlist", api.ListMyWaitlist)
			authed.DELETE("/waitlist/:id", api.LeaveWaitlist)

			authed.POST("/sessions/qr", api.ScanQR)
			authed.GET("/sessions/:id", api.GetSession)
			authed.POST("/sessions/:id/close", api.CloseSession)
			authed.POST("/sessions/:id/orders", api.CreateOrder)
			authed.POST("/sessions/:id/waiter-calls", api.CreateWaiterCall)

			authed.GET("/orders", api.ListOrders)
			authed.GET("/orders/:id", api.GetOrder)
			authed.POST("/payments", api.PayOrder)

			staff := authed.Group("/staff")
			staff.Use(auth.RoleMiddleware(getRole, models.RoleStaff, models.RoleRestaurant, models.RoleAdmin))
			{
				staff.GET("/waiter-calls", api.StaffListWaiterCalls)
				staff.POST("/waiter-calls/:id/accept", api.StaffAcceptWaiterCall)
				staff.POST("/waiter-calls/:id/complete", api.StaffCompleteWaiterCall)
				staff.GET("/orders", api.StaffListOrders)
				staff.PATCH("/orders/:id", api.StaffUpdateOrderStatus)
				staff.POST("/orders/:id/age-check", api.StaffPreorderAgeCheck)
				staff.GET("/reservations", api.StaffListReservations)
				staff.POST("/reservations/:id/adult-verification", api.StaffGrantAdultPreorder)
				staff.POST("/venues/:venueId/guests/:userId/adult-verification/revoke", api.StaffRevokeAdultPreorder)
				staff.GET("/waitlist", api.StaffListWaitlist)
				staff.POST("/waitlist", api.StaffAddWaitlist)
				staff.POST("/waitlist/:id/notify", api.StaffNotifyWaitlist)
				staff.POST("/waitlist/:id/seat", api.StaffSeatWaitlist)
				staff.POST("/waitlist/:id/close", api.StaffCloseWaitlist)
			}

			restaurant := authed.Group("/restaurant")
			restaurant.Use(auth.RoleMiddleware(getRole, models.RoleRestaurant, models.RoleAdmin))
			{
				restaurant.POST("/applications", api.CreateRestaurantApplication)
				restaurant.GET("/applications", api.ListMyApplications)
				restaurant.GET("/reservations", api.ListRestaurantReservations)
				restaurant.GET("/applications/:id", api.GetMyApplication)
				restaurant.GET("/applications/:id/activity", api.ListApplicationActivity)
				restaurant.PATCH("/applications/:id", api.UpdateRestaurantApplication)
				restaurant.POST("/applications/:id/photos", api.UploadApplicationPhoto)
				restaurant.DELETE("/applications/:id/photos", api.RemoveApplicationPhoto)
				restaurant.POST("/applications/:id/submit", api.SubmitRestaurantApplication)
				restaurant.POST("/applications/:id/change-requests", api.SubmitProfileChangeRequest)
				restaurant.GET("/change-requests", api.ListMyProfileChangeRequests)

				restaurant.PUT("/venues/:venueId/tables", api.ReplaceVenueTables)
				restaurant.GET("/venues/:venueId/menu", api.ListVenueMenuOwner)
				restaurant.POST("/venues/:venueId/menu", api.CreateVenueMenuItem)
				restaurant.PATCH("/venues/:venueId/menu/:itemId", api.UpdateVenueMenuItem)
				restaurant.DELETE("/venues/:venueId/menu/:itemId", api.DeleteVenueMenuItem)
				restaurant.POST("/venues/:venueId/menu/:itemId/stop", api.SetVenueMenuStopped)
				restaurant.POST("/venues/:venueId/qr/regenerate", api.RegenerateVenueQR)
				restaurant.GET("/venues/:venueId/qr", api.ListVenueQR)
				restaurant.PATCH("/venues/:venueId/booking-rules", api.UpdateVenueBookingRules)
				restaurant.GET("/venues/:venueId/analytics", api.GetVenueAnalytics)
				restaurant.POST("/venues/:venueId/staff/invite", api.InviteVenueStaff)
				restaurant.GET("/venues/:venueId/staff", api.ListVenueStaff)
			}

			admin := authed.Group("/admin")
			admin.Use(auth.RoleMiddleware(getRole, models.RoleAdmin))
			{
				admin.GET("/overview", api.AdminOverview)
				admin.GET("/people", api.AdminListPeople)
				admin.GET("/companies", api.AdminListCompanies)
				admin.GET("/reservations", api.AdminListReservations)
				admin.GET("/orders", api.AdminListOrders)
				admin.GET("/adult-permission-log", api.AdminAdultPermissionLog)
				admin.GET("/crm/status", api.AdminCRMStatus)
				admin.GET("/applications", api.AdminListApplications)
				admin.POST("/applications/:id/review", api.AdminReviewApplication)
				admin.POST("/applications/:id/publish", api.AdminPublishApplication)
				admin.GET("/change-requests", api.AdminListProfileChangeRequests)
				admin.POST("/change-requests/:id/review", api.AdminReviewProfileChange)
				admin.POST("/integrations/twenty/reconcile", api.ReconcileCRM)
			}
		}
	}

	return r
}

func corsMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Header("Access-Control-Allow-Origin", "*")
		c.Header("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS")
		c.Header("Access-Control-Allow-Headers", "Authorization,Content-Type,Accept-Language")
		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(204)
			return
		}
		c.Next()
	}
}
