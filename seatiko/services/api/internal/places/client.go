package places

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"time"

	"github.com/seatiko/api/internal/models"
)

// PhotoProxyPath is the public API route that resolves a Places photo server-side,
// so the Google API key never reaches the browser.
const PhotoProxyPath = "/api/v1/places/photo"

var photoNamePattern = regexp.MustCompile(`^places/[A-Za-z0-9_-]+/photos/[A-Za-z0-9_-]+$`)

// ValidPhotoName reports whether name is a Places photo resource name.
func ValidPhotoName(name string) bool {
	return photoNamePattern.MatchString(name)
}

// PhotoProxyURL returns the relative API URL that serves the given photo.
func PhotoProxyURL(name string) string {
	return PhotoProxyPath + "?name=" + url.QueryEscape(name)
}

// IsLegacyPhotoURL matches direct Places media URLs, which embed the API key.
func IsLegacyPhotoURL(u string) bool {
	return strings.Contains(u, "places.googleapis.com/") && strings.Contains(u, "/media")
}

// Client talks to Google Places API (New). Empty API key disables live fetches.
type Client struct {
	apiKey string
	http   *http.Client
}

func New(apiKey string) *Client {
	return &Client{
		apiKey: strings.TrimSpace(apiKey),
		http:   &http.Client{Timeout: 12 * time.Second},
	}
}

func (c *Client) Enabled() bool {
	return c != nil && c.apiKey != ""
}

type Enrichment struct {
	PlaceID     string
	Rating      float64
	ReviewCount int
	PhotoURLs   []string
	Reviews     []models.VenueReview
	Source      string
}

// Enrich looks up a place near lat/lng by name and returns photos + reviews.
func (c *Client) Enrich(ctx context.Context, name, address string, lat, lng float64, placeID string) (Enrichment, error) {
	if !c.Enabled() {
		return Enrichment{}, fmt.Errorf("places disabled")
	}
	id := strings.TrimSpace(placeID)
	if id == "" {
		query := strings.TrimSpace(name)
		if address != "" {
			query = query + " " + strings.TrimSpace(address)
		}
		if !strings.Contains(strings.ToLower(query), "bălți") &&
			!strings.Contains(strings.ToLower(query), "balti") &&
			!strings.Contains(query, "Бельц") {
			query = query + " Bălți Moldova"
		}
		found, err := c.searchText(ctx, query, lat, lng)
		if err != nil {
			return Enrichment{}, err
		}
		id = found
	}
	return c.details(ctx, id)
}

func (c *Client) searchText(ctx context.Context, name string, lat, lng float64) (string, error) {
	body := map[string]any{
		"textQuery": name,
		"locationBias": map[string]any{
			"circle": map[string]any{
				"center": map[string]any{"latitude": lat, "longitude": lng},
				"radius": float64(800),
			},
		},
		"maxResultCount": 1,
		"languageCode":   "ru",
	}
	raw, err := c.post(ctx, "https://places.googleapis.com/v1/places:searchText", body, "places.id,places.displayName")
	if err != nil {
		return "", err
	}
	var parsed struct {
		Places []struct {
			ID string `json:"id"`
		} `json:"places"`
	}
	if err := json.Unmarshal(raw, &parsed); err != nil {
		return "", err
	}
	if len(parsed.Places) == 0 || parsed.Places[0].ID == "" {
		return "", fmt.Errorf("place_not_found")
	}
	return parsed.Places[0].ID, nil
}

func (c *Client) details(ctx context.Context, placeID string) (Enrichment, error) {
	id := placeID
	if !strings.HasPrefix(id, "places/") {
		id = "places/" + id
	}
	endpoint := "https://places.googleapis.com/v1/" + id
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return Enrichment{}, err
	}
	req.Header.Set("X-Goog-Api-Key", c.apiKey)
	req.Header.Set("X-Goog-FieldMask", "id,rating,userRatingCount,reviews,photos")
	res, err := c.http.Do(req)
	if err != nil {
		return Enrichment{}, err
	}
	defer res.Body.Close()
	raw, err := io.ReadAll(res.Body)
	if err != nil {
		return Enrichment{}, err
	}
	if res.StatusCode >= 300 {
		return Enrichment{}, fmt.Errorf("places details %d: %s", res.StatusCode, string(raw))
	}
	var parsed struct {
		ID              string  `json:"id"`
		Rating          float64 `json:"rating"`
		UserRatingCount int     `json:"userRatingCount"`
		Reviews         []struct {
			Rating float64 `json:"rating"`
			Text   struct {
				Text string `json:"text"`
			} `json:"text"`
			RelativeTime      string `json:"relativePublishTimeDescription"`
			AuthorAttribution struct {
				DisplayName string `json:"displayName"`
				URI         string `json:"uri"`
			} `json:"authorAttribution"`
		} `json:"reviews"`
		Photos []struct {
			Name string `json:"name"`
		} `json:"photos"`
	}
	if err := json.Unmarshal(raw, &parsed); err != nil {
		return Enrichment{}, err
	}
	out := Enrichment{
		PlaceID:     strings.TrimPrefix(parsed.ID, "places/"),
		Rating:      parsed.Rating,
		ReviewCount: parsed.UserRatingCount,
		Source:      "google",
	}
	for _, review := range parsed.Reviews {
		out.Reviews = append(out.Reviews, models.VenueReview{
			Author:     review.AuthorAttribution.DisplayName,
			Rating:     review.Rating,
			Text:       review.Text.Text,
			Relative:   review.RelativeTime,
			Source:     "google",
			ProfileURL: review.AuthorAttribution.URI,
		})
	}
	var names []string
	for _, photo := range parsed.Photos {
		if len(names) >= 8 {
			break
		}
		if ValidPhotoName(photo.Name) {
			names = append(names, photo.Name)
		}
	}
	// Photo media is billed separately from place details; keep local photos
	// unless Google can actually serve them.
	if len(names) > 0 {
		if _, err := c.PhotoURI(ctx, names[0]); err != nil {
			log.Printf("places photos unavailable for %s: %v", out.PlaceID, err)
			names = nil
		}
	}
	for _, name := range names {
		out.PhotoURLs = append(out.PhotoURLs, PhotoProxyURL(name))
	}
	return out, nil
}

// PhotoURI resolves a Places photo resource name to a short-lived public image URL.
func (c *Client) PhotoURI(ctx context.Context, name string) (string, error) {
	if !c.Enabled() {
		return "", fmt.Errorf("places disabled")
	}
	if !ValidPhotoName(name) {
		return "", fmt.Errorf("invalid photo name")
	}
	endpoint := "https://places.googleapis.com/v1/" + name +
		"/media?maxHeightPx=1200&maxWidthPx=1600&skipHttpRedirect=true"
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return "", err
	}
	req.Header.Set("X-Goog-Api-Key", c.apiKey)
	res, err := c.http.Do(req)
	if err != nil {
		return "", err
	}
	defer res.Body.Close()
	raw, err := io.ReadAll(res.Body)
	if err != nil {
		return "", err
	}
	if res.StatusCode >= 300 {
		return "", fmt.Errorf("places photo %d", res.StatusCode)
	}
	var parsed struct {
		PhotoURI string `json:"photoUri"`
	}
	if err := json.Unmarshal(raw, &parsed); err != nil {
		return "", err
	}
	if parsed.PhotoURI == "" {
		return "", fmt.Errorf("places photo: empty uri")
	}
	return parsed.PhotoURI, nil
}

func (c *Client) post(ctx context.Context, url string, body any, fieldMask string) ([]byte, error) {
	payload, err := json.Marshal(body)
	if err != nil {
		return nil, err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(payload))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Goog-Api-Key", c.apiKey)
	req.Header.Set("X-Goog-FieldMask", fieldMask)
	res, err := c.http.Do(req)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()
	raw, err := io.ReadAll(res.Body)
	if err != nil {
		return nil, err
	}
	if res.StatusCode >= 300 {
		return nil, fmt.Errorf("places search %d: %s", res.StatusCode, string(raw))
	}
	return raw, nil
}
