package places

import (
	"errors"
	"log"
	"os"
	"strings"
	"sync"

	"github.com/joho/godotenv"
)

type Credentials struct {
	PlacesKey  string
	BrowserKey string
	MapID      string
}

type MapServices struct {
	Places     *Client
	BrowserKey string
	MapID      string
}

type Integration struct {
	path     string
	defaults Credentials

	mu       sync.Mutex
	services MapServices
	badFile  bool
}

func NewIntegration(path string, defaults Credentials) *Integration {
	return &Integration{
		path:     path,
		defaults: defaults,
		services: MapServices{Places: New(defaults.PlacesKey), BrowserKey: defaults.BrowserKey, MapID: defaults.MapID},
	}
}

// Current reads optional Google overrides without changing the process environment.
func (i *Integration) Current() MapServices {
	if i == nil {
		return MapServices{}
	}
	if i.path == "" {
		return i.services
	}

	i.mu.Lock()
	defer i.mu.Unlock()

	values, err := godotenv.Read(i.path)
	if err != nil && !errors.Is(err, os.ErrNotExist) {
		if !i.badFile {
			log.Print("Google Maps configuration could not be read; keeping the last valid configuration")
			i.badFile = true
		}
		return i.services
	}
	i.badFile = false

	keys := i.defaults
	if value, exists := values["GOOGLE_PLACES_API_KEY"]; exists {
		keys.PlacesKey = strings.TrimSpace(value)
	}
	if value, exists := values["GOOGLE_MAPS_BROWSER_KEY"]; exists {
		keys.BrowserKey = strings.TrimSpace(value)
	}
	if value, exists := values["GOOGLE_MAPS_MAP_ID"]; exists {
		keys.MapID = strings.TrimSpace(value)
	}

	if strings.TrimSpace(keys.PlacesKey) != i.services.Places.apiKey {
		i.services.Places = New(keys.PlacesKey)
	}
	i.services.BrowserKey = keys.BrowserKey
	i.services.MapID = keys.MapID
	return i.services
}
