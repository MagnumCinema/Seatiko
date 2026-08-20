package main

import (
	"log"
	"os"

	"github.com/foodassistant/api/internal/auth"
	"github.com/foodassistant/api/internal/config"
	"github.com/foodassistant/api/internal/handlers"
	"github.com/foodassistant/api/internal/models"
	"github.com/foodassistant/api/internal/store"
	"github.com/gin-gonic/gin"
)

func main() {
	cfg := config.Load()
	if err := os.MkdirAll(cfg.UploadDir, 0o755); err != nil {
		log.Fatalf("upload dir: %v", err)
	}

	mem := store.NewMemory()
	api := &handlers.API{Store: mem, JWTSecret: cfg.JWTSecret, UploadDir: cfg.UploadDir}

	r := gin.Default()
	r.Use(corsMiddleware())
	r.MaxMultipartMemory = 8 << 20 // 8 MiB

	r.GET("/healthz", api.Health)
	r.Static("/uploads", cfg.UploadDir)

	v1 := r.Group("/api/v1")
	{
		v1.GET("/cities", api.ListCities)
		v1.GET("/venues", api.ListVenues)
		v1.GET("/venues/:id", api.GetVenue)
		v1.GET("/venues/:id/tables", api.ListTables)
		v1.GET("/venues/:id/menu", api.ListMenu)
		v1.GET("/collections", api.ListCollections)
		v1.POST("/discover/ai", api.AIDiscover)

		v1.POST("/auth/register", api.Register)
		v1.POST("/auth/login", api.Login)

		authed := v1.Group("/")
		authed.Use(auth.Middleware(cfg.JWTSecret))
		{
			authed.GET("/me", api.Me)
			authed.PATCH("/me", api.UpdateMe)

			authed.POST("/reservations", api.CreateReservation)
			authed.GET("/reservations", api.ListReservations)
			authed.POST("/reservations/:id/confirm-arrival", api.ConfirmArrival)

			authed.POST("/tables/:id/watch", api.WatchTable)

			authed.POST("/sessions/qr", api.ScanQR)
			authed.GET("/sessions/:id", api.GetSession)
			authed.POST("/sessions/:id/close", api.CloseSession)
			authed.POST("/sessions/:id/orders", api.CreateOrder)
			authed.POST("/sessions/:id/waiter-calls", api.CreateWaiterCall)

			authed.GET("/orders", api.ListOrders)

			authed.GET("/staff/waiter-calls", api.ListWaiterCalls)
			authed.POST("/staff/waiter-calls/:id/accept", api.AcceptWaiterCall)

			restaurant := authed.Group("/restaurant")
			restaurant.Use(auth.RoleMiddleware(func(userID string) (string, error) {
				u, err := mem.GetUser(userID)
				if err != nil {
					return "", err
				}
				return u.Role, nil
			}, models.RoleRestaurant, models.RoleAdmin))
			{
				restaurant.POST("/applications", api.CreateRestaurantApplication)
				restaurant.GET("/applications", api.ListMyApplications)
				restaurant.GET("/applications/:id", api.GetMyApplication)
				restaurant.PATCH("/applications/:id", api.UpdateRestaurantApplication)
				restaurant.POST("/applications/:id/photos", api.UploadApplicationPhoto)
				restaurant.DELETE("/applications/:id/photos", api.RemoveApplicationPhoto)
				restaurant.POST("/applications/:id/submit", api.SubmitRestaurantApplication)
			}

			admin := authed.Group("/admin")
			admin.Use(auth.RoleMiddleware(func(userID string) (string, error) {
				u, err := mem.GetUser(userID)
				if err != nil {
					return "", err
				}
				return u.Role, nil
			}, models.RoleAdmin))
			{
				admin.GET("/applications", api.AdminListApplications)
				admin.POST("/applications/:id/review", api.AdminReviewApplication)
				admin.POST("/applications/:id/publish", api.AdminPublishApplication)
			}
		}
	}

	log.Printf("FoodAssistant API listening on %s", cfg.Addr)
	if err := r.Run(cfg.Addr); err != nil {
		log.Fatal(err)
	}
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
