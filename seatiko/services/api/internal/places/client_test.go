package places

import (
	"strings"
	"testing"
)

func TestValidPhotoName(t *testing.T) {
	cases := map[string]bool{
		"places/ChIJVwgxOgVny0ARa5XnlVAeKN4/photos/AVoNoXR_gk-m0": true,
		"places/abc/photos/def/media":                             false,
		"places/../photos/x":                                      false,
		"https://places.googleapis.com/v1/places/a/photos/b":      false,
		"":                            false,
		"places/abc/photos/def?key=1": false,
	}
	for name, want := range cases {
		if got := ValidPhotoName(name); got != want {
			t.Errorf("ValidPhotoName(%q) = %v, want %v", name, got, want)
		}
	}
}

func TestPhotoProxyURLHidesAPIKey(t *testing.T) {
	got := PhotoProxyURL("places/abc/photos/def")
	if got != "/api/v1/places/photo?name=places%2Fabc%2Fphotos%2Fdef" {
		t.Fatalf("PhotoProxyURL = %q", got)
	}
	if strings.Contains(got, "key=") || IsLegacyPhotoURL(got) {
		t.Fatalf("proxy URL must not expose the key: %q", got)
	}
}

func TestIsLegacyPhotoURL(t *testing.T) {
	legacy := "https://places.googleapis.com/v1/places/a/photos/b/media?maxHeightPx=1200&key=secret"
	if !IsLegacyPhotoURL(legacy) {
		t.Fatal("expected direct Places media URL to be legacy")
	}
	if IsLegacyPhotoURL("https://images.unsplash.com/photo-1?w=1200") {
		t.Fatal("unsplash URL is not legacy")
	}
}

func TestPhotoURI_Disabled(t *testing.T) {
	if _, err := New("").PhotoURI(t.Context(), "places/a/photos/b"); err == nil {
		t.Fatal("expected error when disabled")
	}
}
