package discover

import (
	"net/url"
	"reflect"
	"testing"

	"github.com/seatiko/api/internal/models"
)

func boolPtr(b bool) *bool { return &b }

func TestParseAndEncodePrefs(t *testing.T) {
	q, _ := url.ParseQuery("cuisine=italian,klingon,italian&type=pub&budget=120-460&occasion=date_night&practical=open_now,teleport")
	p := ParsePrefs(q)
	want := Prefs{Cuisine: []string{"italian"}, RestaurantType: []string{"pub"}, Budget: &Budget{100, 500},
		Occasion: []string{"date_night"}, Practical: []string{"open_now"}}
	if !reflect.DeepEqual(p, want) {
		t.Fatalf("parsed %+v", p)
	}
	if ParsePrefs(url.Values{}).Empty() != true {
		t.Fatal("no params must be empty")
	}
	again := ParsePrefs(mustQuery(p.Encode()))
	if !reflect.DeepEqual(again, p) {
		t.Fatalf("encode/parse round trip: %s → %+v", p.Encode(), again)
	}
}

func mustQuery(s string) url.Values { q, _ := url.ParseQuery(s); return q }

// Same bands as priceLevelsForMdlRange on the web.
func TestPriceLevels(t *testing.T) {
	cases := map[Budget][]int{{50, 200}: {1}, {200, 400}: {1, 2}, {400, 700}: {2, 3}, {700, 1000}: {3}, {50, 1000}: {1, 2, 3}}
	for b, want := range cases {
		if got := PriceLevels(&b); !reflect.DeepEqual(got, want) {
			t.Errorf("%v → %v, want %v", b, got, want)
		}
	}
}

func TestMatchesAndCounts(t *testing.T) {
	places := []models.MapPlace{
		{ID: "pizza", Name: models.LocalizedString{EN: "Pizza Roma"}, Cuisine: []string{"italian"}, PriceLevel: 2, OpenNow: boolPtr(true), InDatabase: true, FreeTables: 2, Lat: 47.76, Lng: 27.93},
		{ID: "pub", Name: models.LocalizedString{EN: "Beermaster Pub"}, Cuisine: []string{"pub", "grill"}, PriceLevel: 2, OpenNow: boolPtr(false), InDatabase: true, Lat: 47.75, Lng: 27.92},
		{ID: "google", Name: models.LocalizedString{RU: "Суши бар"}, PriceLevel: 0, Lat: 47.80, Lng: 27.89},
		{ID: "grill2", Name: models.LocalizedString{EN: "Night Grill"}, Cuisine: []string{"grill"}, OpenNow: boolPtr(false), Lat: 47.70, Lng: 27.80},
	}
	c := Count(places, Prefs{Cuisine: []string{"italian"}}, nil)
	if c.Total != 4 || c.Matched != 1 || c.Relax != nil {
		t.Fatalf("italian: %+v", c)
	}
	if !Matches(places[2], Prefs{Budget: &Budget{700, 1000}}, nil) {
		t.Fatal("unknown price level must not exclude a place")
	}
	if Matches(places[0], Prefs{Budget: &Budget{700, 1000}}, nil) {
		t.Fatal("level 2 place passed a 700–1000 budget")
	}

	none := Count(places, Prefs{Cuisine: []string{"grill"}, Practical: []string{"open_now"}}, nil)
	if none.Matched != 0 || none.Relax == nil || none.Relax.Filter != "open_now" || none.Relax.Matched != 2 {
		t.Fatalf("relax hint %+v", none)
	}
	near := &Origin{Lat: 47.76, Lng: 27.93}
	if n := Count(places, Prefs{Practical: []string{"nearby"}}, near).Matched; n != 2 {
		t.Fatalf("nearby within 3 km = %d, want 2", n)
	}
	if n := Count(places, Prefs{Practical: []string{"nearby"}}, nil).Matched; n != 4 {
		t.Fatal("nearby without a position must not filter")
	}
	if n := Count(places, Prefs{Practical: []string{"free_tables", "partners"}}, nil).Matched; n != 1 {
		t.Fatalf("free tables + partners = %d", n)
	}
}
