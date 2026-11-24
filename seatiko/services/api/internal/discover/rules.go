package discover

import (
	"regexp"
	"strconv"
	"strings"
	"unicode"

	"golang.org/x/text/unicode/norm"
)

// Rule-based reading of a free-text request ("недорогое итальянское на свидание",
// "cheap sushi near me", "pizza pentru familie"). Always available; the LLM only
// refines it. Stems are lower-case, without diacritics.

var keywordRules = []struct {
	field string // cuisine, type, occasion, practical
	id    string
	stems []string
}{
	{"cuisine", "moldovan", []string{"молдав", "moldov", "mamalig", "мамалыг", "placint", "плацинд", "sarmal", "сармал"}},
	{"cuisine", "italian", []string{"итальян", "italian", "pizza", "пицц", "pasta", "паст", "italien"}},
	{"cuisine", "asian", []string{"азиат", "asian", "asiat", "thai", "тайск", "wok", "вок", "korean", "корейск"}},
	{"cuisine", "european", []string{"европ", "europe", "french", "француз", "francez"}},
	{"cuisine", "japanese", []string{"япон", "japan", "japonez", "sushi", "суши", "ramen", "рамен"}},
	{"cuisine", "chinese", []string{"китай", "chinese", "chinez"}},
	{"cuisine", "mexican", []string{"мексик", "mexic", "taco", "тако", "burrito", "буррито"}},
	{"cuisine", "seafood", []string{"морепрод", "seafood", "fructe de mare", "рыб", "fish", "peste", "pește"}},
	{"cuisine", "vegetarian", []string{"вегетар", "vegetar", "веган", "vegan", "постн"}},
	{"cuisine", "grill", []string{"гриль", "grill", "шашлык", "bbq", "барбекю", "стейк", "steak", "мяс", "meat", "carne"}},
	{"cuisine", "fast_food", []string{"бургер", "burger", "фастфуд", "fast food", "fastfood", "шаурм", "shaorm"}},
	{"cuisine", "cafe_sweets", []string{"десерт", "dessert", "desert", "сладк", "sweet", "dulc", "торт", "cake", "кофе", "coffee", "cafea"}},

	{"type", "cafe", []string{"кафе", "cafe", "cafenea", "кофейн"}},
	{"type", "bar", []string{"бар ", "bar "}},
	{"type", "pub", []string{"паб", "pub", "пив", "beer", "bere"}},
	{"type", "pizzeria", []string{"пиццери", "pizzer"}},
	{"type", "bakery", []string{"пекарн", "bakery", "brutar", "patiser"}},
	{"type", "wine_bar", []string{"вин", "wine", "vin"}},
	{"type", "fine_dining", []string{"изыскан", "ресторан высок", "fine dining", "gourmet", "гурман", "мишлен", "michelin"}},
	{"type", "fast_food", []string{"перекус", "snack", "на бегу"}},

	{"occasion", "date_night", []string{"свидан", "романт", "date", "romantic", "intalnire", "întâlnire", "романтич", "вдвоем", "вдвоём", "девушк", "парнем"}},
	{"occasion", "family", []string{"семь", "семей", "family", "familie", "с детьми", "with kids", "copii", "родител"}},
	{"occasion", "business", []string{"делов", "business", "afaceri", "переговор", "встреча с партнер", "коллег"}},
	{"occasion", "group", []string{"компани", "друз", "friends", "prieteni", "group", "grup", "большой стол"}},
	{"occasion", "brunch", []string{"бранч", "brunch", "завтрак", "breakfast", "mic dejun"}},
	{"occasion", "celebration", []string{"день рожд", "birthday", "праздн", "celebrat", "aniversar", "юбилей", "отмет", "банкет"}},
	{"occasion", "quick_lunch", []string{"обед", "lunch", "pranz", "prânz", "быстро", "quick"}},
	{"occasion", "solo", []string{"один", "одна", "solo", "singur"}},

	{"practical", "open_now", []string{"сейчас", "открыт", "open now", "deschis", "прямо сейчас"}},
	{"practical", "free_tables", []string{"свободн", "free table", "mese libere", "без брони", "забронир"}},
	{"practical", "nearby", []string{"рядом", "близко", "nearby", "near me", "aproape", "поблизост"}},
	{"practical", "outdoor", []string{"террас", "terrace", "terasa", "terasă", "на улице", "outdoor"}},
	{"practical", "parking", []string{"парков", "parking", "parcare"}},
	{"practical", "wifi", []string{"wifi", "wi-fi", "вайфай", "интернет"}},
	{"practical", "kid_friendly", []string{"детск", "kids", "copii", "детей"}},
}

var (
	cheapStems   = []string{"недорог", "дешев", "дёшев", "бюджет", "cheap", "budget", "ieftin", "эконом"}
	premiumStems = []string{"дорог", "премиум", "премиальн", "premium", "luxury", "люкс", "scump", "шикарн"}
	amountRe     = regexp.MustCompile(`(\d{2,4})\s*(?:-|–|до|to|pana la|până la)?\s*(\d{2,4})?\s*(?:mdl|лей|лея|lei|l\b|руб)?`)
	upToRe       = regexp.MustCompile(`(?:до|не дороже|under|up to|pana la|până la|max)\s*(\d{2,4})`)
	euroRe       = regexp.MustCompile(`(\d{1,3})\s*(?:€|eur|евро|euro)`)
)

// normalizeText lower-cases and strips diacritics (ș→s, ă→a, ё stays ё, handled by stems).
func normalizeText(s string) string {
	var b strings.Builder
	for _, r := range norm.NFD.String(strings.ToLower(s)) {
		if unicode.Is(unicode.Mn, r) {
			continue
		}
		b.WriteRune(r)
	}
	return " " + strings.Join(strings.Fields(b.String()), " ") + " "
}

func containsAny(text string, stems []string) bool {
	for _, stem := range stems {
		n := normalizeText(stem)
		// Keep a trailing space when the stem has one ("bar ") so "barbecue" does not match.
		needle := strings.TrimLeft(n, " ")
		if !strings.HasSuffix(stem, " ") {
			needle = strings.TrimRight(needle, " ")
		}
		if strings.Contains(text, needle) {
			return true
		}
	}
	return false
}

func addUnique(list []string, id string) []string {
	for _, x := range list {
		if x == id {
			return list
		}
	}
	return append(list, id)
}

// ParseText turns a free-text request into preferences with keyword rules.
func ParseText(query string) Prefs {
	text := normalizeText(query)
	p := Prefs{Cuisine: []string{}, RestaurantType: []string{}, Occasion: []string{}, Practical: []string{}}
	for _, rule := range keywordRules {
		if !containsAny(text, rule.stems) {
			continue
		}
		switch rule.field {
		case "cuisine":
			p.Cuisine = addUnique(p.Cuisine, rule.id)
		case "type":
			p.RestaurantType = addUnique(p.RestaurantType, rule.id)
		case "occasion":
			p.Occasion = addUnique(p.Occasion, rule.id)
		case "practical":
			p.Practical = addUnique(p.Practical, rule.id)
		}
	}
	// "wine" also matches inside other words rarely; pizza implies pizzeria type too.
	if containsAny(text, []string{"pizza", "пицц"}) {
		p.RestaurantType = addUnique(p.RestaurantType, "pizzeria")
	}

	switch {
	case euroRe.MatchString(text):
		eur, _ := strconv.Atoi(euroRe.FindStringSubmatch(text)[1])
		b := NormalizeBudget(Budget{Min: BudgetMin, Max: eur * 20}) // ≈ 20 MDL per EUR
		p.Budget = &b
	case upToRe.MatchString(text):
		hi, _ := strconv.Atoi(upToRe.FindStringSubmatch(text)[1])
		b := NormalizeBudget(Budget{Min: BudgetMin, Max: hi})
		p.Budget = &b
	case containsAny(text, cheapStems):
		p.Budget = &Budget{Min: BudgetMin, Max: 200}
	case containsAny(text, premiumStems) && !containsAny(text, []string{"недорог", "не дорог"}):
		p.Budget = &Budget{Min: 700, Max: BudgetMax}
	case containsAny(text, []string{"mdl", "лей", "лея", "lei"}):
		if m := amountRe.FindStringSubmatch(text); m != nil {
			lo, _ := strconv.Atoi(m[1])
			hi := lo
			if m[2] != "" {
				hi, _ = strconv.Atoi(m[2])
			}
			b := NormalizeBudget(Budget{Min: BudgetMin, Max: hi}) // "300 лей" = up to 300
			if m[2] != "" {
				b = NormalizeBudget(Budget{Min: min(lo, hi), Max: max(lo, hi)})
			}
			p.Budget = &b
		}
	}
	return p
}

// Merge applies newly understood preferences over the current ones: a field the
// request talks about replaces the old value, untouched fields are kept.
func Merge(current, next Prefs) Prefs {
	out := current
	if len(next.Cuisine) > 0 {
		out.Cuisine = next.Cuisine
	}
	if len(next.RestaurantType) > 0 {
		out.RestaurantType = next.RestaurantType
	}
	if next.Budget != nil {
		out.Budget = next.Budget
	}
	if len(next.Occasion) > 0 {
		out.Occasion = next.Occasion
	}
	for _, f := range next.Practical {
		out.Practical = addUnique(out.Practical, f)
	}
	return out.Clean()
}
