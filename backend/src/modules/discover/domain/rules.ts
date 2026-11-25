// Rule-based reading of a free-text request ("недорогое итальянское на свидание",
// "cheap sushi near me", "pizza pentru familie"), ported from internal/discover/rules.go.
// Always available; the language model only refines it. Stems are lower-case, no diacritics.
import { BUDGET_MAX, BUDGET_MIN, cleanPrefs, normalizeBudget, type Prefs } from './prefs.js';

type Field = 'cuisine' | 'restaurant_type' | 'occasion' | 'practical';

const RULES: Array<[Field, string, string[]]> = [
  ['cuisine', 'moldovan', ['молдав', 'moldov', 'mamalig', 'мамалыг', 'placint', 'плацинд', 'sarmal', 'сармал']],
  ['cuisine', 'italian', ['итальян', 'italian', 'pizza', 'пицц', 'pasta', 'паст', 'italien']],
  ['cuisine', 'asian', ['азиат', 'asian', 'asiat', 'thai', 'тайск', 'wok', 'вок', 'korean', 'корейск']],
  ['cuisine', 'european', ['европ', 'europe', 'french', 'француз', 'francez']],
  ['cuisine', 'japanese', ['япон', 'japan', 'japonez', 'sushi', 'суши', 'ramen', 'рамен']],
  ['cuisine', 'chinese', ['китай', 'chinese', 'chinez']],
  ['cuisine', 'mexican', ['мексик', 'mexic', 'taco', 'тако', 'burrito', 'буррито']],
  ['cuisine', 'seafood', ['морепрод', 'seafood', 'fructe de mare', 'рыб', 'fish', 'peste', 'pește']],
  ['cuisine', 'vegetarian', ['вегетар', 'vegetar', 'веган', 'vegan', 'постн']],
  ['cuisine', 'grill', ['гриль', 'grill', 'шашлык', 'bbq', 'барбекю', 'стейк', 'steak', 'мяс', 'meat', 'carne']],
  ['cuisine', 'fast_food', ['бургер', 'burger', 'фастфуд', 'fast food', 'fastfood', 'шаурм', 'shaorm']],
  ['cuisine', 'cafe_sweets', ['десерт', 'dessert', 'desert', 'сладк', 'sweet', 'dulc', 'торт', 'cake', 'кофе', 'coffee', 'cafea']],
  ['restaurant_type', 'cafe', ['кафе', 'cafe', 'cafenea', 'кофейн']],
  ['restaurant_type', 'bar', ['бар ', 'bar ']],
  ['restaurant_type', 'pub', ['паб', 'pub', 'пив', 'beer', 'bere']],
  ['restaurant_type', 'pizzeria', ['пиццери', 'pizzer']],
  ['restaurant_type', 'bakery', ['пекарн', 'bakery', 'brutar', 'patiser']],
  ['restaurant_type', 'wine_bar', ['вин', 'wine', 'vin']],
  ['restaurant_type', 'fine_dining', ['изыскан', 'ресторан высок', 'fine dining', 'gourmet', 'гурман', 'мишлен', 'michelin']],
  ['restaurant_type', 'fast_food', ['перекус', 'snack', 'на бегу']],
  ['occasion', 'date_night', ['свидан', 'романт', 'date', 'romantic', 'intalnire', 'întâlnire', 'романтич', 'вдвоем', 'вдвоём', 'девушк', 'парнем']],
  ['occasion', 'family', ['семь', 'семей', 'family', 'familie', 'с детьми', 'with kids', 'copii', 'родител']],
  ['occasion', 'business', ['делов', 'business', 'afaceri', 'переговор', 'встреча с партнер', 'коллег']],
  ['occasion', 'group', ['компани', 'друз', 'friends', 'prieteni', 'group', 'grup', 'большой стол']],
  ['occasion', 'brunch', ['бранч', 'brunch', 'завтрак', 'breakfast', 'mic dejun']],
  ['occasion', 'celebration', ['день рожд', 'birthday', 'праздн', 'celebrat', 'aniversar', 'юбилей', 'отмет', 'банкет']],
  ['occasion', 'quick_lunch', ['обед', 'lunch', 'pranz', 'prânz', 'быстро', 'quick']],
  ['occasion', 'solo', ['один', 'одна', 'solo', 'singur']],
  ['practical', 'open_now', ['сейчас', 'открыт', 'open now', 'deschis', 'прямо сейчас']],
  ['practical', 'free_tables', ['свободн', 'free table', 'mese libere', 'без брони', 'забронир']],
  ['practical', 'nearby', ['рядом', 'близко', 'nearby', 'near me', 'aproape', 'поблизост']],
  ['practical', 'outdoor', ['террас', 'terrace', 'terasa', 'terasă', 'на улице', 'outdoor']],
  ['practical', 'parking', ['парков', 'parking', 'parcare']],
  ['practical', 'wifi', ['wifi', 'wi-fi', 'вайфай', 'интернет']],
  ['practical', 'kid_friendly', ['детск', 'kids', 'copii', 'детей']],
];

const CHEAP = ['недорог', 'дешев', 'дёшев', 'бюджет', 'cheap', 'budget', 'ieftin', 'эконом'];
const PREMIUM = ['дорог', 'премиум', 'премиальн', 'premium', 'luxury', 'люкс', 'scump', 'шикарн'];
const AMOUNT = /(\d{2,4})\s*(?:-|–|до|to|pana la|până la)?\s*(\d{2,4})?\s*(?:mdl|лей|лея|lei|l\b|руб)?/u;
const UP_TO = /(?:до|не дороже|under|up to|pana la|până la|max)\s*(\d{2,4})/u;
const EURO = /(\d{1,3})\s*(?:€|eur|евро|euro)/u;

/** Lower case, no diacritics, single spaces, padded with a space on both sides. */
export function normalizeText(s: string): string {
  const t = s.toLowerCase().normalize('NFD').replace(/\p{Mn}/gu, '');
  return ` ${t.split(/\s+/).filter(Boolean).join(' ')} `;
}

/** Stems ending in a space ("bar ") must end a word, so "barbecue" does not match. */
function containsAny(text: string, stems: string[]): boolean {
  return stems.some((stem) => {
    let needle = normalizeText(stem).trimStart();
    if (!stem.endsWith(' ')) needle = needle.trimEnd();
    return text.includes(needle);
  });
}

const addUnique = (list: string[], id: string) => (list.includes(id) ? list : [...list, id]);

/** Free text → preferences, with keyword rules. */
export function parseText(query: string): Prefs {
  const text = normalizeText(query);
  const p: Prefs = { cuisine: [], restaurant_type: [], occasion: [], practical: [] };
  for (const [field, id, stems] of RULES) if (containsAny(text, stems)) p[field] = addUnique(p[field], id);
  if (containsAny(text, ['pizza', 'пицц'])) p.restaurant_type = addUnique(p.restaurant_type, 'pizzeria');

  const euro = EURO.exec(text);
  const upTo = UP_TO.exec(text);
  if (euro) p.budget = normalizeBudget({ min: BUDGET_MIN, max: Number(euro[1]) * 20 });
  else if (upTo) p.budget = normalizeBudget({ min: BUDGET_MIN, max: Number(upTo[1]) });
  else if (containsAny(text, CHEAP)) p.budget = { min: BUDGET_MIN, max: 200 };
  else if (containsAny(text, PREMIUM) && !containsAny(text, ['недорог', 'не дорог'])) p.budget = { min: 700, max: BUDGET_MAX };
  else if (containsAny(text, ['mdl', 'лей', 'лея', 'lei'])) {
    const m = AMOUNT.exec(text);
    if (m) {
      const lo = Number(m[1]);
      const hi = m[2] ? Number(m[2]) : lo;
      p.budget = m[2] ? normalizeBudget({ min: Math.min(lo, hi), max: Math.max(lo, hi) }) : normalizeBudget({ min: BUDGET_MIN, max: hi });
    }
  }
  return p;
}

/** New understanding over the current filters: a field the request mentions replaces the old one. */
export function mergePrefs(current: Prefs, next: Prefs): Prefs {
  const out: Prefs = { ...current };
  if (next.cuisine.length) out.cuisine = next.cuisine;
  if (next.restaurant_type.length) out.restaurant_type = next.restaurant_type;
  if (next.budget) out.budget = next.budget;
  if (next.occasion.length) out.occasion = next.occasion;
  for (const f of next.practical) out.practical = addUnique(out.practical, f);
  return cleanPrefs(out);
}
