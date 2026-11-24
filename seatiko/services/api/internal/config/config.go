package config

import (
	"os"
	"strconv"
	"time"

	"github.com/joho/godotenv"
)

type Config struct {
	Addr                 string
	JWTSecret            string
	Env                  string
	UploadDir            string
	DataFile             string
	TwentyBaseURL        string
	TwentyPublicURL      string
	TwentyAPIKey         string
	TwentyWebhookSecret  string
	TwentySyncInterval   time.Duration
	GoogleConfigFile     string
	GooglePlacesAPIKey   string
	GoogleMapsBrowserKey string
	GoogleMapsMapID      string
	// S3-compatible storage for user uploads (avatars). Empty S3Bucket = local UploadDir.
	S3Endpoint  string
	S3Region    string
	S3Bucket    string
	S3AccessKey string
	S3SecretKey string
	S3PublicURL string
	S3PathStyle bool
	// Groq (OpenAI-compatible) for /discover AI; empty key = rule-based only.
	GroqAPIKey string
	GroqModel  string
}

func Load() Config {
	_ = godotenv.Load()

	addr := os.Getenv("ADDR")
	if addr == "" {
		addr = ":8080"
	}

	secret := os.Getenv("JWT_SECRET")
	if secret == "" {
		secret = "dev-seatiko-change-me"
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
		dataFile = "./data/seatiko-state.json"
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
		Addr:                 addr,
		JWTSecret:            secret,
		Env:                  env,
		UploadDir:            uploadDir,
		DataFile:             dataFile,
		TwentyBaseURL:        twentyBaseURL,
		TwentyPublicURL:      os.Getenv("TWENTY_PUBLIC_URL"),
		TwentyAPIKey:         os.Getenv("TWENTY_API_KEY"),
		TwentyWebhookSecret:  os.Getenv("TWENTY_WEBHOOK_SECRET"),
		TwentySyncInterval:   time.Duration(syncSeconds) * time.Second,
		GoogleConfigFile:     os.Getenv("GOOGLE_CONFIG_FILE"),
		GooglePlacesAPIKey:   os.Getenv("GOOGLE_PLACES_API_KEY"),
		GoogleMapsBrowserKey: os.Getenv("GOOGLE_MAPS_BROWSER_KEY"),
		GoogleMapsMapID:      os.Getenv("GOOGLE_MAPS_MAP_ID"),
		S3Endpoint:           os.Getenv("S3_ENDPOINT"),
		S3Region:             os.Getenv("S3_REGION"),
		S3Bucket:             os.Getenv("S3_BUCKET"),
		S3AccessKey:          os.Getenv("S3_ACCESS_KEY_ID"),
		S3SecretKey:          os.Getenv("S3_SECRET_ACCESS_KEY"),
		S3PublicURL:          os.Getenv("S3_PUBLIC_URL"),
		S3PathStyle:          os.Getenv("S3_PATH_STYLE") != "false",
		GroqAPIKey:           os.Getenv("GROQ_API_KEY"),
		GroqModel:            os.Getenv("GROQ_MODEL"),
	}
}
