package places

import (
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"testing"

	"github.com/seatiko/api/internal/models"
)

type searchTransport func(*http.Request) (*http.Response, error)

func (transport searchTransport) RoundTrip(req *http.Request) (*http.Response, error) {
	return transport(req)
}

func TestMapSearchUsesRequestedAreaAndKeepsMoldovanResults(t *testing.T) {
	client := New("test-key")
	client.http.Transport = searchTransport(func(request *http.Request) (*http.Response, error) {
		if request.URL.Path != "/v1/places:searchText" {
			t.Errorf("unexpected Google path %s", request.URL.Path)
		}
		var body struct {
			Language string `json:"languageCode"`
			Region   string `json:"regionCode"`
			Location struct {
				Rectangle struct {
					Low struct{ Latitude float64 } `json:"low"`
				} `json:"rectangle"`
			} `json:"locationRestriction"`
		}
		if err := json.NewDecoder(request.Body).Decode(&body); err != nil {
			return nil, err
		}
		if body.Language != "ro" || body.Region != "MD" || body.Location.Rectangle.Low.Latitude != 46.9 {
			t.Errorf("incorrect search params: %+v", body)
		}
		return &http.Response{StatusCode: 200, Body: io.NopCloser(strings.NewReader(`{"places":[
			{"id":"in","postalAddress":{"regionCode":"MD"},"location":{"latitude":47,"longitude":28.8}},
			{"id":"neighbor","postalAddress":{"regionCode":"RO"},"location":{"latitude":47,"longitude":28.8}},
			{"id":"outside","postalAddress":{"regionCode":"MD"},"location":{"latitude":47.7,"longitude":28.8}}
		]}`))}, nil
	})
	places, err := client.SearchFood(t.Context(), models.MapBounds{South: 46.9, West: 28.7, North: 47.2, East: 29.1}, "ro")
	if err != nil || len(places) != 1 || places[0].ID != "in" {
		t.Fatalf("search returned %v, %v", places, err)
	}
}
