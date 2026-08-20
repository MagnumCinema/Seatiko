package crm

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"

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
	Name  string
	Label string
	Type  string
}

var requiredSchema = map[string][]requiredField{
	"person": {
		{Name: "foodassistantUserId", Label: "FoodAssistant User ID", Type: "TEXT"},
		{Name: "foodassistantRole", Label: "FoodAssistant Role", Type: "TEXT"},
		{Name: "foodassistantLocale", Label: "FoodAssistant Locale", Type: "TEXT"},
		{Name: "foodassistantUpdatedAt", Label: "FoodAssistant Updated At", Type: "DATE_TIME"},
	},
	"company": {
		{Name: "foodassistantId", Label: "FoodAssistant ID", Type: "TEXT"},
		{Name: "restaurantDescription", Label: "Restaurant Description", Type: "TEXT"},
		{Name: "cityId", Label: "FoodAssistant City ID", Type: "TEXT"},
		{Name: "priceLevel", Label: "Price Level", Type: "NUMBER"},
		{Name: "photoUrls", Label: "Photo URLs", Type: "TEXT"},
		{Name: "venueId", Label: "FoodAssistant Venue ID", Type: "TEXT"},
		{Name: "rejectReason", Label: "Reject Reason", Type: "TEXT"},
		{Name: "foodassistantUpdatedAt", Label: "FoodAssistant Updated At", Type: "DATE_TIME"},
	},
	"reservation": {
		{Name: "foodassistantReservationId", Label: "FoodAssistant Reservation ID", Type: "TEXT"},
		{Name: "foodassistantUserId", Label: "FoodAssistant User ID", Type: "TEXT"},
		{Name: "foodassistantVenueId", Label: "FoodAssistant Venue ID", Type: "TEXT"},
		{Name: "foodassistantTableId", Label: "FoodAssistant Table ID", Type: "TEXT"},
		{Name: "foodassistantUpdatedAt", Label: "FoodAssistant Updated At", Type: "DATE_TIME"},
	},
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
	var envelope listEnvelope
	if err := c.request(ctx, http.MethodGet, "/rest/metadata/objects?limit=200", nil, &envelope); err != nil {
		return nil, err
	}
	objects, err := decodeMetadataObjects(envelope.Data)
	if err != nil {
		return nil, fmt.Errorf("decode Twenty metadata objects: %w", err)
	}
	return objects, nil
}

func fieldByName(object metadataObject, name string) (metadataField, bool) {
	for _, field := range object.Fields {
		if field.Name == name {
			return field, true
		}
	}
	return metadataField{}, false
}

func (c *Client) EnsureFoodAssistantSchema(ctx context.Context) error {
	objects, err := c.metadataObjects(ctx)
	if err != nil {
		return err
	}
	byName := make(map[string]metadataObject, len(objects))
	for _, object := range objects {
		byName[object.NameSingular] = object
	}
	for objectName, fields := range requiredSchema {
		object, ok := byName[objectName]
		if !ok {
			return fmt.Errorf("Twenty schema is missing required object %q", objectName)
		}
		for _, field := range fields {
			if _, exists := fieldByName(object, field.Name); exists {
				continue
			}
			payload := map[string]any{
				"objectMetadataId":      object.ID,
				"type":                  field.Type,
				"name":                  field.Name,
				"label":                 field.Label,
				"isLabelSyncedWithName": false,
			}
			if err := c.request(ctx, http.MethodPost, "/rest/metadata/fields", payload, nil); err != nil {
				return fmt.Errorf("create Twenty field %s.%s: %w", objectName, field.Name, err)
			}
		}
	}

	company := byName["company"]
	statusField, ok := fieldByName(company, "restaurantStatus")
	if !ok {
		return fmt.Errorf("Twenty company.restaurantStatus field is missing")
	}
	for _, option := range statusField.Options {
		if option["value"] == "REJECTED" {
			return nil
		}
	}
	options := append([]map[string]any(nil), statusField.Options...)
	options = append(options, map[string]any{
		"id":       uuid.NewString(),
		"color":    "orange",
		"label":    "REJECTED",
		"value":    "REJECTED",
		"position": len(options),
	})
	if err := c.request(ctx, http.MethodPatch, "/rest/metadata/fields/"+statusField.ID, map[string]any{"options": options}, nil); err != nil {
		return fmt.Errorf("add REJECTED restaurant status: %w", err)
	}
	return nil
}
