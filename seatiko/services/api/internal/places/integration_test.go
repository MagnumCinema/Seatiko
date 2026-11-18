package places

import (
	"os"
	"path/filepath"
	"testing"
)

func TestMapServicesFollowConfigurationFile(t *testing.T) {
	path := filepath.Join(t.TempDir(), "google.env")
	integration := NewIntegration(path, Credentials{
		PlacesKey: "startup-server", BrowserKey: "startup-browser", MapID: "startup-map",
	})
	startup := integration.Current()
	if startup.Places.apiKey != "startup-server" || startup.BrowserKey != "startup-browser" || startup.MapID != "startup-map" {
		t.Fatal("expected startup credentials until the file exists")
	}

	if err := os.WriteFile(path, []byte("GOOGLE_MAPS_BROWSER_KEY=browser-one\nGOOGLE_MAPS_MAP_ID=map-one\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	first := integration.Current()
	if first.Places != startup.Places || first.BrowserKey != "browser-one" || first.MapID != "map-one" {
		t.Fatal("expected browser overrides and the existing Places client")
	}

	replacement := filepath.Join(filepath.Dir(path), "replacement.env")
	err := os.WriteFile(replacement, []byte("GOOGLE_PLACES_API_KEY=server-two\nGOOGLE_MAPS_BROWSER_KEY=\n"), 0o600)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.Rename(replacement, path); err != nil {
		t.Fatal(err)
	}
	second := integration.Current()
	if second.Places.apiKey != "server-two" || second.BrowserKey != "" || second.MapID != "startup-map" {
		t.Fatal("expected the replacement file and startup fallback for the omitted map ID")
	}

	if err := os.WriteFile(path, []byte("GOOGLE_MAPS_BROWSER_KEY=\"unterminated"), 0o600); err != nil {
		t.Fatal(err)
	}
	if result := integration.Current(); result != second {
		t.Fatal("expected the last valid configuration during a malformed save")
	}

	if err := os.Remove(path); err != nil {
		t.Fatal(err)
	}
	fallback := integration.Current()
	if fallback.Places.apiKey != "startup-server" || fallback.BrowserKey != "startup-browser" {
		t.Fatal("expected startup credentials after deleting the overrides")
	}
}
