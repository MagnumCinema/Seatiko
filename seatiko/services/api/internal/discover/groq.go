package discover

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

// DefaultGroqModel is used when GROQ_MODEL is empty (multilingual, JSON mode).
const DefaultGroqModel = "openai/gpt-oss-120b"

// Groq calls Groq's OpenAI-compatible chat completions API to read a request.
type Groq struct {
	APIKey  string
	Model   string
	BaseURL string // default https://api.groq.com/openai/v1
	HTTP    *http.Client
}

func (g *Groq) Enabled() bool { return g != nil && g.APIKey != "" }

// AIReading is what the model returns: preferences plus a one-sentence explanation.
type AIReading struct {
	Prefs       Prefs
	Explanation string
}

const systemPrompt = `You turn a restaurant request from a guest in Bălți, Moldova into search filters.
The request can be in Russian, Romanian or English. Reply with one JSON object only:
{"cuisine":[...],"restaurant_type":[...],"budget":{"min":int,"max":int} or null,"occasion":[...],"practical":[...],"explanation":"..."}
Allowed ids (use only these, leave a list empty when the request says nothing about it):
cuisine: %s
restaurant_type: %s
occasion: %s
practical: %s
budget is MDL per person between 50 and 1000 (≈20 MDL per EUR): cheap/budget ≈ 50-200; moderate, "not too expensive",
mid-range ≈ 200-450; expensive/premium ≈ 700-1000; a number like "up to 300" ≈ 50-300; null if price is not mentioned.
Hints: wine → restaurant_type wine_bar; beer → pub; pizza → cuisine italian and restaurant_type pizzeria; coffee or desserts →
cuisine cafe_sweets and restaurant_type cafe; with kids → occasion family and practical kid_friendly; romantic or a date →
occasion date_night; birthday or anniversary → celebration; "now" or "tonight" → practical open_now.
explanation: one short sentence in %s saying what you will look for. Do not invent restaurant names.`

func (g *Groq) endpoint() string {
	base := g.BaseURL
	if base == "" {
		base = "https://api.groq.com/openai/v1"
	}
	return strings.TrimRight(base, "/") + "/chat/completions"
}

var localeNames = map[string]string{"ru": "Russian", "en": "English", "ro": "Romanian"}

// Read asks the model for preferences; locale (ru/en/ro) picks the explanation language.
// Callers fall back to ParseText on any error.
func (g *Groq) Read(ctx context.Context, query string, current Prefs, locale string) (AIReading, error) {
	if !g.Enabled() {
		return AIReading{}, errors.New("groq disabled")
	}
	model := g.Model
	if model == "" {
		model = DefaultGroqModel
	}
	language, ok := localeNames[locale]
	if !ok {
		language = "the language of the request"
	}
	currentJSON, _ := json.Marshal(current)
	body := map[string]any{
		"model":       model,
		"temperature": 0,
		"messages": []map[string]string{
			{"role": "system", "content": fmt.Sprintf(systemPrompt,
				strings.Join(CuisineIDs, ", "), strings.Join(TypeIDs, ", "),
				strings.Join(OccasionIDs, ", "), strings.Join(PracticalIDs, ", "), language)},
			{"role": "user", "content": "Current filters: " + string(currentJSON) + "\nRequest: " + query},
		},
		"response_format":       map[string]string{"type": "json_object"},
		"max_completion_tokens": 700,
	}
	if strings.HasPrefix(model, "openai/gpt-oss") {
		body["reasoning_effort"] = "low"
	}
	raw, _ := json.Marshal(body)
	ctx, cancel := context.WithTimeout(ctx, 8*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, g.endpoint(), bytes.NewReader(raw))
	if err != nil {
		return AIReading{}, err
	}
	req.Header.Set("Authorization", "Bearer "+g.APIKey)
	req.Header.Set("Content-Type", "application/json")
	client := g.HTTP
	if client == nil {
		client = &http.Client{Timeout: 10 * time.Second}
	}
	res, err := client.Do(req)
	if err != nil {
		return AIReading{}, err
	}
	defer res.Body.Close()
	data, _ := io.ReadAll(io.LimitReader(res.Body, 1<<20))
	if res.StatusCode != http.StatusOK {
		return AIReading{}, fmt.Errorf("groq: %d %s", res.StatusCode, strings.TrimSpace(string(data[:min(len(data), 300)])))
	}
	var completion struct {
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
		} `json:"choices"`
	}
	if err := json.Unmarshal(data, &completion); err != nil || len(completion.Choices) == 0 {
		return AIReading{}, fmt.Errorf("groq: unexpected response")
	}
	return parseAIContent(completion.Choices[0].Message.Content)
}

func parseAIContent(content string) (AIReading, error) {
	content = strings.TrimSpace(content)
	if i := strings.Index(content, "{"); i > 0 {
		content = content[i:]
	}
	if j := strings.LastIndex(content, "}"); j >= 0 && j < len(content)-1 {
		content = content[:j+1]
	}
	var out struct {
		Cuisine        []string `json:"cuisine"`
		RestaurantType []string `json:"restaurant_type"`
		Budget         *Budget  `json:"budget"`
		Occasion       []string `json:"occasion"`
		Practical      []string `json:"practical"`
		Explanation    string   `json:"explanation"`
	}
	if err := json.Unmarshal([]byte(content), &out); err != nil {
		return AIReading{}, fmt.Errorf("groq: invalid JSON: %w", err)
	}
	prefs := Prefs{Cuisine: out.Cuisine, RestaurantType: out.RestaurantType, Budget: out.Budget,
		Occasion: out.Occasion, Practical: out.Practical}.Clean()
	explanation := strings.TrimSpace(out.Explanation)
	if len([]rune(explanation)) > 300 {
		explanation = string([]rune(explanation)[:300])
	}
	return AIReading{Prefs: prefs, Explanation: explanation}, nil
}
