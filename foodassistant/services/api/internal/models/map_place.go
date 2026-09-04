package models

type MapPlace struct {
	ID             string          `json:"id"`
	Name           LocalizedString `json:"name"`
	Lat            float64         `json:"lat"`
	Lng            float64         `json:"lng"`
	Address        LocalizedString `json:"address"`
	Rating         float64         `json:"rating,omitempty"`
	GooglePlaceID  string          `json:"google_place_id,omitempty"`
	InDatabase     bool            `json:"in_database"`
	VenueID        string          `json:"venue_id,omitempty"`
	FreeTables     int             `json:"free_tables"`
	OpenNow        *bool           `json:"open_now,omitempty"`
	Cuisine        []string        `json:"cuisine,omitempty"`
	PriceLevel     int             `json:"price_level,omitempty"`
	AverageCheck   int             `json:"average_check,omitempty"`
	Website        string          `json:"website,omitempty"`
}

type MapPlacesResponse struct {
	CityID  string `json:"city_id"`
	Center  struct {
		Lat float64 `json:"lat"`
		Lng float64 `json:"lng"`
	} `json:"center"`
	Places []MapPlace `json:"places"`
	Source struct {
		GoogleEnabled  bool `json:"google_enabled"`
		GoogleCount    int  `json:"google_count"`
		DatabaseCount  int  `json:"database_count"`
	} `json:"source"`
}
