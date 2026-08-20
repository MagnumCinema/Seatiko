package config

import (
	"os"
	"strconv"
	"time"

	"github.com/joho/godotenv"
)

type Config struct {
	Addr                string
	JWTSecret           string
	Env                 string
	UploadDir           string
	DataFile            string
	TwentyBaseURL       string
	TwentyAPIKey        string
	TwentyWebhookSecret string
	TwentySyncInterval  time.Duration
}

func Load() Config {
	_ = godotenv.Load()

	addr := os.Getenv("ADDR")
	if addr == "" {
		addr = ":8080"
	}

	secret := os.Getenv("JWT_SECRET")
	if secret == "" {
		secret = "dev-foodassistant-change-me"
	}

	env := os.Getenv("APP_ENV")
	if env == "" {
		env = "development"
	}

	uploadDir := os.Getenv("UPLOAD_DIR")
	if uploadDir == "" {
		uploadDir = "./data/uploads"
	}
	dataFile := os.Getenv("DATA_FILE")
	if dataFile == "" {
		dataFile = "./data/foodassistant-state.json"
	}
	twentyBaseURL := os.Getenv("TWENTY_BASE_URL")
	if twentyBaseURL == "" {
		twentyBaseURL = "http://twenty-server:3000"
	}
	syncSeconds := 15
	if raw := os.Getenv("TWENTY_SYNC_INTERVAL_SECONDS"); raw != "" {
		if parsed, err := strconv.Atoi(raw); err == nil && parsed >= 5 {
			syncSeconds = parsed
		}
	}

	return Config{
		Addr:                addr,
		JWTSecret:           secret,
		Env:                 env,
		UploadDir:           uploadDir,
		DataFile:            dataFile,
		TwentyBaseURL:       twentyBaseURL,
		TwentyAPIKey:        os.Getenv("TWENTY_API_KEY"),
		TwentyWebhookSecret: os.Getenv("TWENTY_WEBHOOK_SECRET"),
		TwentySyncInterval:  time.Duration(syncSeconds) * time.Second,
	}
}
