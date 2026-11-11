package crm

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

type Client struct {
	baseURL string
	apiKey  string
	http    *http.Client
}

func NewClient(baseURL, apiKey string) *Client {
	return &Client{
		baseURL: strings.TrimRight(baseURL, "/"),
		apiKey:  apiKey,
		http:    &http.Client{Timeout: 10 * time.Second},
	}
}

type pageInfo struct {
	EndCursor   string `json:"endCursor"`
	HasNextPage bool   `json:"hasNextPage"`
}

type listEnvelope struct {
	Data       json.RawMessage `json:"data"`
	PageInfo   pageInfo        `json:"pageInfo"`
	TotalCount int             `json:"totalCount"`
}

func (c *Client) request(ctx context.Context, method, path string, body any, output any) error {
	var reader io.Reader
	if body != nil {
		encoded, err := json.Marshal(body)
		if err != nil {
			return fmt.Errorf("encode Twenty request: %w", err)
		}
		reader = bytes.NewReader(encoded)
	}
	req, err := http.NewRequestWithContext(ctx, method, c.baseURL+path, reader)
	if err != nil {
		return fmt.Errorf("create Twenty request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+c.apiKey)
	req.Header.Set("Accept", "application/json")
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	response, err := c.http.Do(req)
	if err != nil {
		return fmt.Errorf("call Twenty: %w", err)
	}
	defer response.Body.Close()
	payload, err := io.ReadAll(io.LimitReader(response.Body, 4<<20))
	if err != nil {
		return fmt.Errorf("read Twenty response: %w", err)
	}
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		var apiError struct {
			Error    string   `json:"error"`
			Messages []string `json:"messages"`
		}
		_ = json.Unmarshal(payload, &apiError)
		message := strings.Join(apiError.Messages, "; ")
		if message == "" {
			message = apiError.Error
		}
		if message == "" {
			message = strings.TrimSpace(string(payload))
		}
		return fmt.Errorf("Twenty %s %s returned %d: %s", method, path, response.StatusCode, message)
	}
	if output != nil && len(payload) > 0 {
		if err := json.Unmarshal(payload, output); err != nil {
			return fmt.Errorf("decode Twenty response: %w", err)
		}
	}
	return nil
}

func decodeCollection(data json.RawMessage, pluralName string) ([]map[string]any, error) {
	var wrapper map[string]json.RawMessage
	if err := json.Unmarshal(data, &wrapper); err == nil {
		if raw, ok := wrapper[pluralName]; ok {
			var records []map[string]any
			if err := json.Unmarshal(raw, &records); err != nil {
				return nil, err
			}
			return records, nil
		}
	}
	var records []map[string]any
	if err := json.Unmarshal(data, &records); err != nil {
		return nil, err
	}
	return records, nil
}

func (c *Client) listAll(ctx context.Context, pluralName string) ([]map[string]any, error) {
	records := make([]map[string]any, 0)
	startingAfter := ""
	for {
		values := url.Values{}
		values.Set("limit", "60")
		values.Set("depth", "0")
		if startingAfter != "" {
			values.Set("starting_after", startingAfter)
		}
		var envelope listEnvelope
		if err := c.request(ctx, http.MethodGet, "/rest/"+pluralName+"?"+values.Encode(), nil, &envelope); err != nil {
			return nil, err
		}
		page, err := decodeCollection(envelope.Data, pluralName)
		if err != nil {
			return nil, fmt.Errorf("decode Twenty %s list: %w", pluralName, err)
		}
		records = append(records, page...)
		if !envelope.PageInfo.HasNextPage || envelope.PageInfo.EndCursor == "" {
			return records, nil
		}
		startingAfter = envelope.PageInfo.EndCursor
	}
}

func recordID(record map[string]any) string {
	id, _ := record["id"].(string)
	return id
}

func stringField(record map[string]any, name string) string {
	value, _ := record[name].(string)
	return value
}

func compositeString(record map[string]any, field, key string) string {
	value, _ := record[field].(map[string]any)
	text, _ := value[key].(string)
	return text
}

func (c *Client) createRecord(ctx context.Context, pluralName string, payload map[string]any) (string, error) {
	var envelope struct {
		Data map[string]json.RawMessage `json:"data"`
	}
	if err := c.request(ctx, http.MethodPost, "/rest/"+pluralName+"?depth=0", payload, &envelope); err != nil {
		return "", err
	}
	for _, raw := range envelope.Data {
		var record map[string]any
		if json.Unmarshal(raw, &record) == nil && recordID(record) != "" {
			return recordID(record), nil
		}
	}
	return "", fmt.Errorf("Twenty create %s response has no record id", pluralName)
}

func (c *Client) updateRecord(ctx context.Context, pluralName, id string, payload map[string]any) error {
	return c.request(ctx, http.MethodPatch, "/rest/"+pluralName+"/"+url.PathEscape(id)+"?depth=0", payload, nil)
}

func (c *Client) upsertRecord(
	ctx context.Context,
	pluralName string,
	payload map[string]any,
	match func(map[string]any) bool,
) (string, error) {
	records, err := c.listAll(ctx, pluralName)
	if err != nil {
		return "", err
	}
	matches := make([]map[string]any, 0, 1)
	for _, record := range records {
		if match(record) {
			matches = append(matches, record)
		}
	}
	if len(matches) > 1 {
		return "", fmt.Errorf("Twenty conflict: %d %s records match the same Seatiko identity", len(matches), pluralName)
	}
	if len(matches) == 1 {
		id := recordID(matches[0])
		if id == "" {
			return "", fmt.Errorf("Twenty %s match has no id", pluralName)
		}
		if err := c.updateRecord(ctx, pluralName, id, payload); err != nil {
			return "", err
		}
		return id, nil
	}
	return c.createRecord(ctx, pluralName, payload)
}
