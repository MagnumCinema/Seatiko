package main

import (
	"log"

	"github.com/foodassistant/api/internal/auth"
	"github.com/foodassistant/api/internal/config"
	"github.com/foodassistant/api/internal/handlers"
	"github.com/foodassistant/api/internal/store"
	"github.com/gin-gonic/gin"
)

func main() {
	cfg := config.Load()
	mem := store.NewMemory()
	api := &handlers.API{Store: mem, JWTSecret: cfg.JWTSecret}

	r := gin.Default()
	r.Use(corsMiddleware())

	r.GET("/healthz", api.Health)

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
