package config

import (
	"os"

	"github.com/joho/godotenv"
)

type Config struct {
	Addr      string
	JWTSecret string
	Env       string
	UploadDir string
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

	return Config{
		Addr:      addr,
		JWTSecret: secret,
		Env:       env,
		UploadDir: uploadDir,
	}
}
