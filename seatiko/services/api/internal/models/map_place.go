package models

type Coordinates struct {
	Lat float64 `json:"lat"`
	Lng float64 `json:"lng"`
}

type MapBounds struct {
	South float64 `json:"south"`
	West  float64 `json:"west"`
	North float64 `json:"north"`
	East  float64 `json:"east"`
}

func (b MapBounds) Contains(lat, lng float64) bool {
	return lat >= b.South && lat <= b.North && lng >= b.West && lng <= b.East
}

type MapPlace struct {
	ID            string          `json:"id"`
	Name          LocalizedString `json:"name"`
	Lat           float64         `json:"lat"`
	Lng           float64         `json:"lng"`
	Address       LocalizedString `json:"address"`
	Rating        float64         `json:"rating,omitempty"`
	GooglePlaceID string          `json:"google_place_id,omitempty"`
	InDatabase    bool            `json:"in_database"`
	Bookable      bool            `json:"bookable"`
	VenueID       string          `json:"venue_id,omitempty"`
	FreeTables    int             `json:"free_tables"`
	OpenNow       *bool           `json:"open_now,omitempty"`
	Cuisine       []string        `json:"cuisine,omitempty"`
	PriceLevel    int             `json:"price_level,omitempty"`
	AverageCheck  int             `json:"average_check,omitempty"`
	Website       string          `json:"website,omitempty"`
}

type MapPlacesResponse struct {
	CityID  string      `json:"city_id"`
	Country string      `json:"country"`
	Center  Coordinates `json:"center"`
	Bounds  MapBounds   `json:"bounds"`
	Places  []MapPlace  `json:"places"`
	Source  struct {
		GoogleEnabled bool   `json:"google_enabled"`
		GoogleStatus  string `json:"google_status"`
		GoogleCount   int    `json:"google_count"`
		DatabaseCount int    `json:"database_count"`
	} `json:"source"`
}
