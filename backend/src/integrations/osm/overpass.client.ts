import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env.schema.js';
import type { SourcePlace } from '../../modules/open-places/domain/merge.js';
import { type ImportArea, OsmPlacesSource } from '../../modules/open-places/open-places.ports.js';
import { fromOsm, type OverpassElement, overpassQuery } from './osm-mapper.js';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Loads OSM food places through the Overpass API. Public servers are often busy,
 * so it tries each configured server with backoff. Data © OpenStreetMap
 * contributors (ODbL): the map shows the attribution.
 */
@Injectable()
export class OverpassClient extends OsmPlacesSource {
  private readonly logger = new Logger(OverpassClient.name);
  private readonly urls: string[];

  constructor(config: ConfigService<Env, true>) {
    super();
    this.urls = config.get('OVERPASS_URLS', { infer: true }).split(',').map((u) => u.trim()).filter(Boolean);
  }

  async load(area: ImportArea): Promise<SourcePlace[]> {
    const body = new URLSearchParams({ data: overpassQuery(area) });
    let lastError: unknown;
    for (let attempt = 0; attempt < 3; attempt++) {
      for (const url of this.urls) {
        try {
          const res = await fetch(url, {
            method: 'POST',
            body,
            headers: { 'User-Agent': 'seatiko-api/1.0 (open places import)', Accept: 'application/json' },
            signal: AbortSignal.timeout(240_000),
          });
          const text = await res.text();
          if (!res.ok || !text.startsWith('{')) throw new Error(`${url}: HTTP ${res.status} ${text.slice(0, 80)}`);
          const elements = (JSON.parse(text) as { elements: OverpassElement[] }).elements;
          const places = elements.map(fromOsm).filter((p): p is SourcePlace => p !== undefined);
          this.logger.log(`OSM: ${places.length} places from ${new URL(url).host}`);
          return places;
        } catch (error) {
          lastError = error;
          this.logger.warn(`Overpass ${new URL(url).host} failed: ${String(error).slice(0, 160)}`);
        }
      }
      await sleep(15_000 * 2 ** attempt);
    }
    throw new Error(`all Overpass servers failed: ${String(lastError)}`);
  }
}
