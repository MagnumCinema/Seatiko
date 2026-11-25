package discover

import (
	"context"
	"net/http"
	"net/http/httptest"
	"reflect"
	"testing"
)

func TestParseText(t *testing.T) {
	cases := []struct {
		query string
		want  Prefs
	}{
		{"недорогое итальянское на свидание", Prefs{Cuisine: []string{"italian"}, Occasion: []string{"date_night"}, Budget: &Budget{50, 200}}},
		{"cheap sushi near me", Prefs{Cuisine: []string{"japanese"}, Practical: []string{"nearby"}, Budget: &Budget{50, 200}}},
		{"pizza pentru familie cu copii", Prefs{Cuisine: []string{"italian"}, RestaurantType: []string{"pizzeria"}, Occasion: []string{"family"}, Practical: []string{"kid_friendly"}}},
		{"шашлык с друзьями до 300 лей", Prefs{Cuisine: []string{"grill"}, Occasion: []string{"group"}, Budget: &Budget{50, 300}}},
		{"romantic dinner, 40 euro", Prefs{Occasion: []string{"date_night"}, Budget: &Budget{50, 800}}},
		{"паб с террасой", Prefs{RestaurantType: []string{"pub"}, Practical: []string{"outdoor"}}},
		{"барбекю", Prefs{Cuisine: []string{"grill"}}},
		{"дорогой ресторан на юбилей", Prefs{Occasion: []string{"celebration"}, Budget: &Budget{700, 1000}}},
	}
	for _, tc := range cases {
		got := ParseText(tc.query).Clean()
		want := tc.want.Clean()
		if !reflect.DeepEqual(got, want) {
			t.Errorf("%q\n got %+v %v\nwant %+v %v", tc.query, got, got.Budget, want, want.Budget)
		}
	}
}

func TestMergeKeepsUntouchedFields(t *testing.T) {
	current := Prefs{Cuisine: []string{"moldovan"}, Budget: &Budget{50, 200}, Practical: []string{"open_now"}}
	got := Merge(current, Prefs{Occasion: []string{"family"}, Practical: []string{"nearby"}})
	if !reflect.DeepEqual(got.Cuisine, []string{"moldovan"}) || got.Budget == nil || !reflect.DeepEqual(got.Occasion, []string{"family"}) ||
		!reflect.DeepEqual(got.Practical, []string{"open_now", "nearby"}) {
		t.Fatalf("merge %+v", got)
	}
	if got := Merge(current, Prefs{Cuisine: []string{"italian"}}); !reflect.DeepEqual(got.Cuisine, []string{"italian"}) {
		t.Fatalf("new cuisine must replace the old one: %+v", got.Cuisine)
	}
}

func TestParseAIContent(t *testing.T) {
	r, err := parseAIContent("Sure! {\"cuisine\":[\"italian\",\"martian\"],\"restaurant_type\":[],\"budget\":{\"min\":30,\"max\":5000},\"occasion\":[\"date_night\"],\"practical\":[\"open_now\"],\"explanation\":\"Ищу итальянский ресторан для свидания.\"} ")
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(r.Prefs.Cuisine, []string{"italian"}) || *r.Prefs.Budget != (Budget{50, 1000}) || r.Explanation == "" {
		t.Fatalf("parsed %+v", r)
	}
	if _, err := parseAIContent("no json here"); err == nil {
		t.Fatal("garbage accepted")
	}
}

func TestGroqClientAgainstFakeServer(t *testing.T) {
	var gotAuth, gotModel string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotAuth = r.Header.Get("Authorization")
		var body struct {
			Model string `json:"model"`
		}
		_ = decodeJSON(r, &body)
		gotModel = body.Model
		_, _ = w.Write([]byte(`{"choices":[{"message":{"content":"{\"cuisine\":[\"seafood\"],\"restaurant_type\":[],\"budget\":null,\"occasion\":[],\"practical\":[],\"explanation\":\"Fish.\"}"}}]}`))
	}))
	defer srv.Close()
	g := &Groq{APIKey: "k", BaseURL: srv.URL}
	r, err := g.Read(context.Background(), "fish please", Prefs{}, "en")
	if err != nil || !reflect.DeepEqual(r.Prefs.Cuisine, []string{"seafood"}) {
		t.Fatalf("read: %v %+v", err, r)
	}
	if gotAuth != "Bearer k" || gotModel != DefaultGroqModel {
		t.Fatalf("auth %q model %q", gotAuth, gotModel)
	}

	failing := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		http.Error(w, `{"error":"rate limit"}`, http.StatusTooManyRequests)
	}))
	defer failing.Close()
	if _, err := (&Groq{APIKey: "k", BaseURL: failing.URL}).Read(context.Background(), "x", Prefs{}, "ru"); err == nil {
		t.Fatal("429 must be an error so the caller falls back to rules")
	}
	if (&Groq{}).Enabled() {
		t.Fatal("no key must disable Groq")
	}
}

func decodeJSON(r *http.Request, v any) error { return jsonDecode(r.Body, v) }
