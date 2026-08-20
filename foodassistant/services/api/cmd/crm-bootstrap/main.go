package main

import (
	"context"
	"log"
	"os"

	"github.com/foodassistant/api/internal/crm"
)

func main() {
	baseURL := os.Getenv("TWENTY_BASE_URL")
	if baseURL == "" {
		baseURL = "http://crm.localhost"
	}
	apiKey := os.Getenv("TWENTY_API_KEY")
	if apiKey == "" {
		log.Fatal("TWENTY_API_KEY is required")
	}
	if err := crm.NewClient(baseURL, apiKey).EnsureFoodAssistantSchema(context.Background()); err != nil {
		log.Fatalf("bootstrap Twenty CRM schema: %v", err)
	}
	log.Print("Twenty CRM schema is compatible with FoodAssistant")
}
