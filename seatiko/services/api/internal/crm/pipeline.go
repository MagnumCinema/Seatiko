package crm

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"

	"github.com/google/uuid"
)

const seatikoPipelineName = "Seatiko · Подключение ресторанов"

type pipelineView struct {
	ID         string `json:"id"`
	Name       string `json:"name"`
	ViewFields []struct {
		FieldMetadataID string `json:"fieldMetadataId"`
	} `json:"viewFields"`
	ViewGroups []struct {
		ID         string `json:"id"`
		FieldValue string `json:"fieldValue"`
		IsVisible  bool   `json:"isVisible"`
	} `json:"viewGroups"`
	ViewFilters []struct {
		FieldMetadataID string `json:"fieldMetadataId"`
		Operand         string `json:"operand"`
	} `json:"viewFilters"`
}

func (c *Client) pipelineGraphQL(ctx context.Context, query string, variables map[string]any, output any) error {
	var response struct {
		Data   json.RawMessage `json:"data"`
		Errors []struct {
			Message string `json:"message"`
		} `json:"errors"`
	}
	if err := c.request(ctx, http.MethodPost, "/metadata", map[string]any{"query": query, "variables": variables}, &response); err != nil {
		return err
	}
	if len(response.Errors) > 0 {
		return fmt.Errorf("Twenty pipeline metadata: %s", response.Errors[0].Message)
	}
	if output != nil {
		if err := json.Unmarshal(response.Data, output); err != nil {
			return fmt.Errorf("decode Twenty pipeline metadata: %w", err)
		}
	}
	return nil
}

// EnsureSeatikoPipeline creates a workspace-wide onboarding board over the
// authoritative Company status. Existing column order and field layouts remain
// editable; retries only add missing configuration and never create sample data.
func (c *Client) EnsureSeatikoPipeline(ctx context.Context) error {
	objects, err := c.metadataObjects(ctx)
	if err != nil {
		return err
	}
	var company metadataObject
	for _, object := range objects {
		if object.NameSingular == "company" {
			company = object
			break
		}
	}
	status, found := fieldByName(company, "restaurantStatus")
	if company.ID == "" || !found || status.Type != "SELECT" {
		return fmt.Errorf("Twenty pipeline requires company.restaurantStatus SELECT")
	}
	identity, found := fieldByName(company, "seatikoId")
	if !found {
		return fmt.Errorf("Twenty pipeline requires company.seatikoId")
	}
	var result struct {
		Views []pipelineView `json:"getViews"`
	}
	query := `query SeatikoPipeline($objectID:String!){getViews(objectMetadataId:$objectID){id name viewFields{fieldMetadataId} viewGroups{id fieldValue isVisible} viewFilters{fieldMetadataId operand}}}`
	if err := c.pipelineGraphQL(ctx, query, map[string]any{"objectID": company.ID}, &result); err != nil {
		return err
	}
	var view pipelineView
	for _, candidate := range result.Views {
		if candidate.Name == seatikoPipelineName {
			if view.ID != "" {
				return fmt.Errorf("Twenty pipeline has duplicate named views")
			}
			view = candidate
		}
	}
	stableID := func(kind string) string {
		return uuid.NewSHA1(uuid.NameSpaceURL, []byte("seatiko/pipeline/"+company.ID+"/"+kind)).String()
	}
	if view.ID == "" {
		var created struct {
			View struct {
				ID string `json:"id"`
			} `json:"createView"`
		}
		input := map[string]any{
			"id": stableID("view"), "name": seatikoPipelineName, "objectMetadataId": company.ID,
			"type": "KANBAN", "icon": "IconBuildingStore", "visibility": "WORKSPACE",
			"mainGroupByFieldMetadataId": status.ID, "kanbanAggregateOperation": "COUNT",
			"shouldHideEmptyGroups": false, "position": 1,
		}
		if err := c.pipelineGraphQL(ctx, `mutation SeatikoCreatePipeline($input:CreateViewInput!){createView(input:$input){id}}`, map[string]any{"input": input}, &created); err != nil {
			return err
		}
		view.ID = created.View.ID
		if view.ID == "" {
			return fmt.Errorf("Twenty pipeline create response has no view ID")
		}
		// Twenty creates the initial board fields and status groups itself.
		// Read those defaults before adding any missing configuration.
		if err := c.pipelineGraphQL(ctx, query, map[string]any{"objectID": company.ID}, &result); err != nil {
			return err
		}
		createdID := view.ID
		view = pipelineView{}
		for _, candidate := range result.Views {
			if candidate.ID == createdID {
				view = candidate
				break
			}
		}
		if view.ID == "" {
			return fmt.Errorf("Twenty pipeline is not visible yet; retry setup")
		}
		for _, group := range view.ViewGroups {
			if group.FieldValue == "" && group.ID != "" && group.IsVisible {
				input := map[string]any{"id": group.ID, "update": map[string]any{"isVisible": false}}
				if err := c.pipelineGraphQL(ctx, `mutation SeatikoPipelineHideEmpty($input:UpdateViewGroupInput!){updateViewGroup(input:$input){id}}`, map[string]any{"input": input}, nil); err != nil {
					return err
				}
			}
		}
	}
	fields := map[string]bool{}
	for _, existing := range view.ViewFields {
		fields[existing.FieldMetadataID] = true
	}
	for position, name := range []string{"name", "restaurantStatus", "cityName", "restaurantPhones", "restaurantEmails", "submittedAt", "rejectReason"} {
		field, exists := fieldByName(company, name)
		if !exists || fields[field.ID] {
			continue
		}
		input := map[string]any{"id": stableID("field/" + field.ID), "viewId": view.ID, "fieldMetadataId": field.ID, "isVisible": true, "position": position, "size": 180}
		if err := c.pipelineGraphQL(ctx, `mutation SeatikoPipelineField($input:CreateViewFieldInput!){createViewField(input:$input){id}}`, map[string]any{"input": input}, nil); err != nil {
			return err
		}
	}
	groups := map[string]bool{}
	for _, existing := range view.ViewGroups {
		groups[existing.FieldValue] = true
	}
	for position, stage := range []string{"DRAFT", "SUBMITTED", "UNDER_REVIEW", "APPROVED", "REJECTED", "PUBLISHED"} {
		if groups[stage] {
			continue
		}
		input := map[string]any{"id": stableID("group/" + stage), "viewId": view.ID, "fieldValue": stage, "isVisible": true, "position": position}
		if err := c.pipelineGraphQL(ctx, `mutation SeatikoPipelineGroup($input:CreateViewGroupInput!){createViewGroup(input:$input){id}}`, map[string]any{"input": input}, nil); err != nil {
			return err
		}
	}
	for _, filter := range view.ViewFilters {
		if filter.FieldMetadataID == identity.ID && filter.Operand == "IS_NOT_EMPTY" {
			return nil
		}
	}
	input := map[string]any{"id": stableID("filter/identity"), "viewId": view.ID, "fieldMetadataId": identity.ID, "operand": "IS_NOT_EMPTY", "value": ""}
	return c.pipelineGraphQL(ctx, `mutation SeatikoPipelineFilter($input:CreateViewFilterInput!){createViewFilter(input:$input){id}}`, map[string]any{"input": input}, nil)
}
