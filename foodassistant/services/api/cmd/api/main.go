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

		v1.POST("/auth/register", api.Register)
		v1.POST("/auth/login", api.Login)

		authed := v1.Group("/")
		authed.Use(auth.Middleware(cfg.JWTSecret))
		{
			authed.GET("/me", api.Me)
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
