package crm

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strings"

	"github.com/google/uuid"
)

type metadataField struct {
	ID      string           `json:"id"`
	Name    string           `json:"name"`
	Type    string           `json:"type"`
	Options []map[string]any `json:"options"`
}

type metadataObject struct {
	ID           string          `json:"id"`
	NameSingular string          `json:"nameSingular"`
	Fields       []metadataField `json:"fields"`
}

type requiredField struct {
	Name    string
	Label   string
	Type    string
	Options []string
	Target  string
}

func field(name, label, kind string) requiredField {
	return requiredField{Name: name, Label: label, Type: kind}
}

var requiredSchema = []struct {
	object string
	fields []requiredField
}{
	{"person", []requiredField{
		field("seatikoUserId", "Seatiko User ID", "TEXT"),
		field("seatikoRole", "Seatiko Role", "TEXT"),
		field("seatikoLocale", "Seatiko Locale", "TEXT"),
		field("seatikoUpdatedAt", "Seatiko Updated At", "DATE_TIME"),
	}},
	{"company", []requiredField{
		field("seatikoId", "Seatiko ID", "TEXT"),
		field("restaurantDescription", "Restaurant Description", "TEXT"),
		field("cityId", "Seatiko City ID", "TEXT"),
		field("cityName", "Город", "TEXT"),
		field("submittedAt", "Заявка отправлена", "DATE_TIME"),
		field("priceLevel", "Price Level", "NUMBER"),
		field("photoUrls", "Photo URLs", "TEXT"),
		field("venueId", "Seatiko Venue ID", "TEXT"),
		field("rejectReason", "Reject Reason", "TEXT"),
		field("seatikoUpdatedAt", "Seatiko Updated At", "DATE_TIME"),
		field("cuisine", "Cuisine", "TEXT"),
		field("openingHours", "Opening Hours", "TEXT"),
		field("averageCheckMdl", "Average Check MDL", "NUMBER"),
		field("restaurantPhones", "Restaurant Phones", "PHONES"),
		field("restaurantEmails", "Restaurant Emails", "EMAILS"),
		field("latitude", "Latitude", "NUMBER"),
		field("longitude", "Longitude", "NUMBER"),
		{Name: "restaurantStatus", Label: "Restaurant Status", Type: "SELECT", Options: []string{"DRAFT", "SUBMITTED", "UNDER_REVIEW", "APPROVED", "REJECTED", "PUBLISHED"}},
	}},
	{"task", []requiredField{
		field("seatikoTaskKey", "Seatiko Task Key", "TEXT"),
		field("seatikoApplicationId", "Seatiko Application ID", "TEXT"),
		field("seatikoAutoResolved", "Seatiko Auto Resolved", "BOOLEAN"),
	}},
	{"reservation", []requiredField{
		field("seatikoReservationId", "Seatiko Reservation ID", "TEXT"),
		field("seatikoUserId", "Seatiko User ID", "TEXT"),
		field("seatikoVenueId", "Seatiko Venue ID", "TEXT"),
		field("seatikoTableId", "Seatiko Table ID", "TEXT"),
		field("seatikoUpdatedAt", "Seatiko Updated At", "DATE_TIME"),
		field("reservedFor", "Reserved For", "DATE_TIME"),
		field("guests", "Guests", "NUMBER"),
		field("tableNumber", "Table Number", "NUMBER"),
		field("guestEmail", "Guest Email", "EMAILS"),
		{Name: "bookingStatus", Label: "Booking Status", Type: "SELECT", Options: []string{"CONFIRMED", "CHECKED_IN", "CANCELLED", "NO_SHOW"}},
		{Name: "source", Label: "Booking Source", Type: "SELECT", Options: []string{"WEB", "ANDROID", "IOS", "PHONE", "WALK_IN"}},
		{Name: "restaurant", Label: "Restaurant", Type: "RELATION", Target: "company"},
		{Name: "guest", Label: "Guest", Type: "RELATION", Target: "person"},
	}},
}

func decodeMetadataObjects(data json.RawMessage) ([]metadataObject, error) {
	var wrapper map[string]json.RawMessage
	if err := json.Unmarshal(data, &wrapper); err == nil {
		if raw, ok := wrapper["objects"]; ok {
			var objects []metadataObject
			if err := json.Unmarshal(raw, &objects); err != nil {
				return nil, err
			}
			return objects, nil
		}
	}
	var objects []metadataObject
	if err := json.Unmarshal(data, &objects); err != nil {
		return nil, err
	}
	return objects, nil
}

func (c *Client) metadataObjects(ctx context.Context) ([]metadataObject, error) {
	var objects []metadataObject
	cursor := ""
	for {
		query := url.Values{"limit": {"60"}}
		if cursor != "" {
			query.Set("starting_after", cursor)
		}
		var envelope listEnvelope
		if err := c.request(ctx, http.MethodGet, "/rest/metadata/objects?"+query.Encode(), nil, &envelope); err != nil {
			return nil, err
		}
		page, err := decodeMetadataObjects(envelope.Data)
		if err != nil {
			return nil, fmt.Errorf("decode Twenty metadata objects: %w", err)
		}
		objects = append(objects, page...)
		if !envelope.PageInfo.HasNextPage {
			return objects, nil
		}
		if envelope.PageInfo.EndCursor == "" || envelope.PageInfo.EndCursor == cursor {
			return nil, fmt.Errorf("Twenty metadata pagination returned an invalid cursor")
		}
		cursor = envelope.PageInfo.EndCursor
	}
}

func fieldByName(object metadataObject, name string) (metadataField, bool) {
	for _, field := range object.Fields {
		if field.Name == name {
			return field, true
		}
	}
	return metadataField{}, false
}

func mergeOptions(existing []map[string]any, required []string) []map[string]any {
	options := append([]map[string]any(nil), existing...)
	values := make(map[string]bool, len(existing))
	for _, option := range existing {
		value, _ := option["value"].(string)
		values[value] = true
	}
	for _, value := range required {
		if !values[value] {
			options = append(options, map[string]any{
				"id": uuid.NewString(), "color": "blue", "label": strings.ReplaceAll(value, "_", " "),
				"value": value, "position": len(options),
			})
		}
	}
	return options
}

func (c *Client) EnsureSeatikoSchema(ctx context.Context) error {
	objects, err := c.metadataObjects(ctx)
	if err != nil {
		return err
	}
	byName := make(map[string]metadataObject, len(objects))
	for _, object := range objects {
		byName[object.NameSingular] = object
	}
	if _, exists := byName["reservation"]; !exists {
		payload := map[string]any{
			"nameSingular": "reservation", "namePlural": "reservations",
			"labelSingular": "Reservation", "labelPlural": "Reservations",
			"description": "Reservations synchronized from Seatiko", "icon": "IconCalendarEvent",
		}
		if err := c.request(ctx, http.MethodPost, "/rest/metadata/objects", payload, nil); err != nil {
			return fmt.Errorf("create Twenty Reservation object: %w", err)
		}
		objects, err = c.metadataObjects(ctx)
		if err != nil {
			return err
		}
		for _, object := range objects {
			byName[object.NameSingular] = object
		}
	}
	for _, spec := range requiredSchema {
		object, ok := byName[spec.object]
		if !ok {
			return fmt.Errorf("Twenty schema is missing required object %q", spec.object)
		}
		for _, field := range spec.fields {
			if err := c.ensureField(ctx, object, field, byName[field.Target]); err != nil {
				return fmt.Errorf("Twenty field %s.%s: %w", spec.object, field.Name, err)
			}
		}
	}
	return nil
}

func (c *Client) ensureField(ctx context.Context, object metadataObject, field requiredField, target metadataObject) error {
	existing, exists := fieldByName(object, field.Name)
	options := mergeOptions(existing.Options, field.Options)
	if exists {
		if existing.Type != field.Type {
			return fmt.Errorf("expected %s, found %s", field.Type, existing.Type)
		}
		if len(options) > len(existing.Options) {
			return c.request(ctx, http.MethodPatch, "/rest/metadata/fields/"+url.PathEscape(existing.ID), map[string]any{"options": options}, nil)
		}
		return nil
	}

	payload := map[string]any{
		"objectMetadataId": object.ID, "type": field.Type, "name": field.Name,
		"label": field.Label, "isLabelSyncedWithName": false, "isNullable": true,
	}
	if len(options) > 0 {
		payload["options"] = options
	}
	if field.Target != "" {
		if target.ID == "" {
			return fmt.Errorf("relation target %q is missing", field.Target)
		}
		payload["icon"] = "IconCalendarEvent"
		payload["relationCreationPayload"] = map[string]any{
			"type": "MANY_TO_ONE", "targetObjectMetadataId": target.ID,
			"targetFieldLabel": "Reservations", "targetFieldIcon": "IconCalendarEvent",
		}
	}
	return c.request(ctx, http.MethodPost, "/rest/metadata/fields", payload, nil)
}
