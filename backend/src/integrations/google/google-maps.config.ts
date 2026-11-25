import { readFileSync } from 'node:fs';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env.schema.js';

export type GoogleMapsKeys = { browserKey: string; mapId: string };

/** KEY=VALUE lines (comments and blanks ignored), as godotenv.Read. */
function parseEnvFile(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const m = /^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (!m || line.trimStart().startsWith('#')) continue;
    out[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
  return out;
}

/**
 * Browser key and map id for the optional Google map on the site. GOOGLE_CONFIG_FILE
 * (mounted read-only) overrides the environment and is re-read on each call, so keys
 * change without a restart, as in the Go API.
 */
@Injectable()
export class GoogleMapsConfig {
  constructor(private readonly config: ConfigService<Env, true>) {}

  current(): GoogleMapsKeys {
    const keys = {
      browserKey: this.config.get('GOOGLE_MAPS_BROWSER_KEY', { infer: true }) ?? '',
      mapId: this.config.get('GOOGLE_MAPS_MAP_ID', { infer: true }) ?? '',
    };
    const path = this.config.get('GOOGLE_CONFIG_FILE', { infer: true });
    if (!path) return keys;
    try {
      const file = parseEnvFile(readFileSync(path, 'utf8'));
      if ('GOOGLE_MAPS_BROWSER_KEY' in file) keys.browserKey = file.GOOGLE_MAPS_BROWSER_KEY.trim();
      if ('GOOGLE_MAPS_MAP_ID' in file) keys.mapId = file.GOOGLE_MAPS_MAP_ID.trim();
    } catch {
      // Missing or unreadable file: keep the environment values.
    }
    return keys;
  }
}
