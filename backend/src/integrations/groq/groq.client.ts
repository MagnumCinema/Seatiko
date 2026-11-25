import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env.schema.js';
import { cleanPrefs, CUISINE_IDS, OCCASION_IDS, PRACTICAL_IDS, type Prefs, TYPE_IDS } from '../../modules/discover/domain/prefs.js';

const SYSTEM_PROMPT = (language: string) => `You turn a restaurant request from a guest in Bălți, Moldova into search filters.
The request can be in Russian, Romanian or English. Reply with one JSON object only:
{"cuisine":[...],"restaurant_type":[...],"budget":{"min":int,"max":int} or null,"occasion":[...],"practical":[...],"explanation":"..."}
Allowed ids (use only these, leave a list empty when the request says nothing about it):
cuisine: ${CUISINE_IDS.join(', ')}
restaurant_type: ${TYPE_IDS.join(', ')}
occasion: ${OCCASION_IDS.join(', ')}
practical: ${PRACTICAL_IDS.join(', ')}
budget is MDL per person between 50 and 1000 (≈20 MDL per EUR): cheap/budget ≈ 50-200; moderate, "not too expensive",
mid-range ≈ 200-450; expensive/premium ≈ 700-1000; a number like "up to 300" ≈ 50-300; null if price is not mentioned.
Hints: wine → restaurant_type wine_bar; beer → pub; pizza → cuisine italian and restaurant_type pizzeria; coffee or desserts →
cuisine cafe_sweets and restaurant_type cafe; with kids → occasion family and practical kid_friendly; romantic or a date →
occasion date_night; birthday or anniversary → celebration; "now" or "tonight" → practical open_now.
explanation: one short sentence in ${language} saying what you will look for. Do not invent restaurant names.`;

const LANGUAGES: Record<string, string> = { ru: 'Russian', en: 'English', ro: 'Romanian' };

export type AiReading = { prefs: Prefs; explanation: string };

/** The model's JSON (sometimes wrapped in text) → preferences. */
export function parseAiContent(content: string): AiReading {
  let c = content.trim();
  const i = c.indexOf('{');
  const j = c.lastIndexOf('}');
  if (i >= 0 && j > i) c = c.slice(i, j + 1);
  const out = JSON.parse(c) as Partial<Prefs> & { budget?: { min: number; max: number } | null; explanation?: string };
  return { prefs: cleanPrefs(out), explanation: [...(out.explanation ?? '').trim()].slice(0, 300).join('') };
}

/**
 * Groq (OpenAI-compatible chat completions) reads a free-text request into /discover
 * filters. Callers fall back to the keyword rules on any error.
 */
@Injectable()
export class GroqClient {
  private readonly key: string;
  private readonly model: string;

  constructor(config: ConfigService<Env, true>) {
    this.key = config.get('GROQ_API_KEY', { infer: true }) ?? '';
    this.model = config.get('GROQ_MODEL', { infer: true });
  }

  get enabled(): boolean {
    return Boolean(this.key);
  }

  async read(query: string, current: Prefs, locale: string): Promise<AiReading> {
    const body: Record<string, unknown> = {
      model: this.model,
      temperature: 0,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT(LANGUAGES[locale] ?? 'the language of the request') },
        { role: 'user', content: `Current filters: ${JSON.stringify(current)}\nRequest: ${query}` },
      ],
      response_format: { type: 'json_object' },
      max_completion_tokens: 700,
      ...(this.model.startsWith('openai/gpt-oss') ? { reasoning_effort: 'low' } : {}),
    };
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(8_000),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`groq: ${res.status} ${text.slice(0, 300)}`);
    const content = (JSON.parse(text) as { choices?: Array<{ message?: { content?: string } }> }).choices?.[0]?.message?.content;
    if (!content) throw new Error('groq: unexpected response');
    return parseAiContent(content);
  }
}
