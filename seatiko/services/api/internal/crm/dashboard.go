package crm

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"

	"github.com/google/uuid"
)

const seatikoDashboardID = "d3b7d10e-dc4f-5bf9-b54d-2da803ef9572"
const seatikoDashboardName = "Seatiko — обзор"

type dashboardWidget struct {
	ID    string `json:"id"`
	Title string `json:"title"`
}
type dashboardTab struct {
	ID      string            `json:"id"`
	Title   string            `json:"title"`
	Widgets []dashboardWidget `json:"widgets"`
}
type dashboardLayout struct {
	ID   string         `json:"id"`
	Name string         `json:"name"`
	Tabs []dashboardTab `json:"tabs"`
}

func (c *Client) dashboardGraphQL(ctx context.Context, query string, variables map[string]any, result any) error {
	var envelope struct {
		Data   json.RawMessage `json:"data"`
		Errors []struct {
			Message string `json:"message"`
		} `json:"errors"`
	}
	if err := c.request(ctx, http.MethodPost, "/metadata", map[string]any{"query": query, "variables": variables}, &envelope); err != nil {
		return err
	}
	if len(envelope.Errors) != 0 {
		return fmt.Errorf("Twenty dashboard: %s", envelope.Errors[0].Message)
	}
	if result != nil {
		return json.Unmarshal(envelope.Data, result)
	}
	return nil
}

// EnsureSeatikoDashboard repairs incomplete initialization without changing charts
// or layout choices that managers have already customized. All metrics are native
// Twenty aggregations restricted to records linked to Seatiko.
func (c *Client) EnsureSeatikoDashboard(ctx context.Context) error {
	objects, err := c.metadataObjects(ctx)
	if err != nil {
		return err
	}
	byName := make(map[string]metadataObject, len(objects))
	for _, object := range objects {
		byName[object.NameSingular] = object
	}
	widgets, err := seatikoDashboardWidgets(byName)
	if err != nil {
		return err
	}
	var layouts struct {
		Layouts []dashboardLayout `json:"getPageLayouts"`
	}
	if err := c.dashboardGraphQL(ctx, `{getPageLayouts(pageLayoutType:DASHBOARD){id name tabs{id title widgets{id title}}}}`, nil, &layouts); err != nil {
		return err
	}
	dashboards, err := c.listAll(ctx, "dashboards")
	if err != nil {
		return err
	}
	linkedLayoutID := ""
	for _, dashboard := range dashboards {
		if recordID(dashboard) == seatikoDashboardID {
			linkedLayoutID = stringField(dashboard, "pageLayoutId")
			if linkedLayoutID == "" {
				return fmt.Errorf("Seatiko dashboard has no page layout")
			}
		}
	}
	var layout dashboardLayout
	for _, candidate := range layouts.Layouts {
		if (linkedLayoutID != "" && candidate.ID == linkedLayoutID) || (linkedLayoutID == "" && candidate.Name == seatikoDashboardName) {
			if layout.ID != "" {
				return fmt.Errorf("multiple Seatiko dashboard layouts found")
			}
			layout = candidate
		}
	}
	if linkedLayoutID != "" && layout.ID == "" {
		return fmt.Errorf("Seatiko dashboard layout %s is missing", linkedLayoutID)
	}
	if layout.ID == "" {
		var created struct {
			Layout dashboardLayout `json:"createPageLayout"`
		}
		if err := c.dashboardGraphQL(ctx, `mutation($input:CreatePageLayoutInput!){createPageLayout(input:$input){id name}}`, map[string]any{"input": map[string]any{"name": seatikoDashboardName, "type": "DASHBOARD"}}, &created); err != nil {
			return err
		}
		layout = created.Layout
		if layout.ID == "" {
			return fmt.Errorf("Twenty created dashboard layout without an id")
		}
	}
	var tab dashboardTab
	for _, candidate := range layout.Tabs {
		if candidate.Title == "Показатели" {
			if tab.ID != "" {
				return fmt.Errorf("multiple Seatiko dashboard tabs found")
			}
			tab = candidate
		}
	}
	if tab.ID == "" {
		var created struct {
			Tab dashboardTab `json:"createPageLayoutTab"`
		}
		if err := c.dashboardGraphQL(ctx, `mutation($input:CreatePageLayoutTabInput!){createPageLayoutTab(input:$input){id title}}`, map[string]any{"input": map[string]any{"pageLayoutId": layout.ID, "title": "Показатели", "position": 0}}, &created); err != nil {
			return err
		}
		tab = created.Tab
		if tab.ID == "" {
			return fmt.Errorf("Twenty created dashboard tab without an id")
		}
	}
	for _, widget := range widgets {
		present := 0
		for _, existing := range tab.Widgets {
			if existing.Title == widget["title"] {
				present++
			}
		}
		if present > 1 {
			return fmt.Errorf("multiple Seatiko dashboard widgets named %q", widget["title"])
		}
		if present == 1 {
			continue
		}
		widget["pageLayoutTabId"] = tab.ID
		var created struct {
			Widget dashboardWidget `json:"createPageLayoutWidget"`
		}
		if err := c.dashboardGraphQL(ctx, `mutation($input:CreatePageLayoutWidgetInput!){createPageLayoutWidget(input:$input){id title}}`, map[string]any{"input": widget}, &created); err != nil {
			return err
		}
		if created.Widget.ID == "" {
			return fmt.Errorf("Twenty created dashboard widget without an id")
		}
	}
	if linkedLayoutID == "" {
		_, err = c.createRecord(ctx, "dashboards", map[string]any{"id": seatikoDashboardID, "title": seatikoDashboardName, "pageLayoutId": layout.ID})
	}
	return err
}

func seatikoDashboardWidgets(objects map[string]metadataObject) ([]map[string]any, error) {
	type spec struct {
		title, object, group             string
		row, column, rowSpan, columnSpan int
	}
	specs := []spec{
		{"Заявки ресторанов", "company", "", 0, 0, 2, 6},
		{"Бронирования", "reservation", "", 0, 6, 2, 6},
		{"Заявки по статусам", "company", "restaurantStatus", 2, 0, 6, 6},
		{"Бронирования по статусам", "reservation", "bookingStatus", 2, 6, 6, 6},
		{"Заявки по городам", "company", "cityName", 8, 0, 6, 12},
	}
	widgets := make([]map[string]any, 0, len(specs))
	for _, spec := range specs {
		object := objects[spec.object]
		idField, hasID := fieldByName(object, "id")
		identity := "seatikoId"
		if spec.object == "reservation" {
			identity = "seatikoReservationId"
		}
		identityField, hasIdentity := fieldByName(object, identity)
		if object.ID == "" || !hasID || !hasIdentity {
			return nil, fmt.Errorf("Twenty dashboard requires %s.id and %s", spec.object, identity)
		}
		configuration := map[string]any{
			"configurationType": "AGGREGATE_CHART", "aggregateFieldMetadataId": idField.ID, "aggregateOperation": "COUNT",
			"displayDataLabel": true, "timezone": "Europe/Chisinau", "firstDayOfTheWeek": 1,
			"filter": map[string]any{"recordFilters": []any{map[string]any{
				"id":              uuid.NewSHA1(uuid.NameSpaceURL, []byte("seatiko/dashboard/"+object.ID+"/"+spec.title+"/identity")).String(),
				"fieldMetadataId": identityField.ID, "type": "TEXT", "operand": "IS_NOT_EMPTY",
				"value": "", "displayValue": "", "label": "Seatiko ID",
			}}, "recordFilterGroups": []any{}},
		}
		if spec.group != "" {
			groupField, ok := fieldByName(object, spec.group)
			if !ok {
				return nil, fmt.Errorf("Twenty dashboard requires %s.%s", spec.object, spec.group)
			}
			configuration["configurationType"] = "BAR_CHART"
			configuration["primaryAxisGroupByFieldMetadataId"] = groupField.ID
			configuration["primaryAxisOrderBy"] = "FIELD_ASC"
			configuration["axisNameDisplay"] = "NONE"
			configuration["displayLegend"] = false
			configuration["layout"] = "VERTICAL"
			configuration["color"] = "blue"
		}
		position := map[string]any{"layoutMode": "GRID", "row": spec.row, "column": spec.column, "rowSpan": spec.rowSpan, "columnSpan": spec.columnSpan}
		widgets = append(widgets, map[string]any{"title": spec.title, "type": "GRAPH", "objectMetadataId": object.ID, "position": position, "configuration": configuration})
	}
	return widgets, nil
}
