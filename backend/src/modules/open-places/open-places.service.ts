import { randomUUID } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env.schema.js';
import { Clock, dbDate } from '../../core/time/time.js';
import { CITIES } from '../../database/reference/cities.js';
import { CatalogService } from '../catalog/catalog.service.js';
import { linkVenues, mergePlaces, type SourcePlace } from './domain/merge.js';
import { type ImportArea, OsmPlacesSource, OverturePlacesSource } from './open-places.ports.js';
import { type OpenPlaceRecord, OpenPlacesRepository } from './open-places.repository.js';

export type ImportResult = { status: 'done' | 'failed' | 'skipped'; places: number; osm: number; overture: number; release?: string; error?: string };

/**
 * Keeps the open-data places of the configured cities up to date: loads OSM and
 * Overture, merges them, links partner venues and stores the result. Nothing is
 * fetched per map request.
 */
@Injectable()
export class OpenPlacesService {
  private readonly logger = new Logger(OpenPlacesService.name);

  constructor(
    private readonly repo: OpenPlacesRepository,
    private readonly osm: OsmPlacesSource,
    private readonly overture: OverturePlacesSource,
    private readonly catalog: CatalogService,
    private readonly config: ConfigService<Env, true>,
    private readonly clock: Clock,
  ) {}

  /** City slugs to import (OPEN_PLACES_CITIES), only known cities. */
  cities(): string[] {
    const known = new Set(CITIES.map((c) => c.slug));
    return this.config
      .get('OPEN_PLACES_CITIES', { infer: true })
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter((s) => known.has(s));
  }

  /** True when there was no successful import of these cities in the refresh period. */
  async isStale(): Promise<boolean> {
    const last = await this.repo.lastSuccessfulImport();
    if (!last?.finishedAt) return true;
    const ageDays = (this.clock.now().getTime() - dbDate(last.finishedAt).getTime()) / (24 * 3600_000);
    const covered = new Set(last.cities);
    return ageDays >= this.config.get('OPEN_PLACES_REFRESH_DAYS', { infer: true }) || this.cities().some((c) => !covered.has(c));
  }

  async runImport(): Promise<ImportResult> {
    const slugs = this.cities();
    const id = randomUUID();
    const startedAt = this.clock.now().toISOString();
    if (!slugs.length || !(await this.repo.tryStartImport(id, slugs, startedAt))) {
      return { status: 'skipped', places: 0, osm: 0, overture: 0 };
    }
    let osmTotal = 0;
    let overtureTotal = 0;
    let placeTotal = 0;
    let release = '';
    const errors: string[] = [];
    try {
      const venues = await this.catalog.venueRecords();
      for (const slug of slugs) {
        const area: ImportArea = CITIES.find((c) => c.slug === slug)!.bounds;
        const [osm, overture] = await Promise.allSettled([this.osm.load(area), this.overture.load(area)]);
        const osmPlaces: SourcePlace[] = osm.status === 'fulfilled' ? osm.value : [];
        const ovtPlaces: SourcePlace[] = overture.status === 'fulfilled' ? overture.value.places : [];
        if (osm.status === 'rejected') errors.push(`${slug} osm: ${String(osm.reason)}`);
        if (overture.status === 'rejected') errors.push(`${slug} overture: ${String(overture.reason)}`);
        else release = overture.value.release;
        if (osm.status === 'rejected' && overture.status === 'rejected') continue;

        const merged = mergePlaces(osmPlaces, ovtPlaces);
        const links = linkVenues(merged, venues);
        // Prune places gone from the datasets only when both answered, so a busy server never empties the map.
        await this.repo.saveArea(area, merged, links, startedAt, osm.status === 'fulfilled' && overture.status === 'fulfilled');
        osmTotal += osmPlaces.length;
        overtureTotal += ovtPlaces.length;
        placeTotal += merged.length;
        this.logger.log(`${slug}: ${merged.length} places (OSM ${osmPlaces.length}, Overture ${ovtPlaces.length}, ${links.size} partner venues)`);
      }
      const failed = placeTotal === 0 && errors.length > 0;
      await this.repo.finishImport(id, {
        status: failed ? 'failed' : 'done',
        osmCount: osmTotal,
        overtureCount: overtureTotal,
        placeCount: placeTotal,
        overtureRelease: release,
        error: errors.join('\n').slice(0, 2000),
        finishedAt: this.clock.now().toISOString(),
      });
      for (const e of errors) this.logger.warn(e);
      return { status: failed ? 'failed' : 'done', places: placeTotal, osm: osmTotal, overture: overtureTotal, release, error: errors.join('; ') || undefined };
    } catch (error) {
      await this.repo.finishImport(id, { status: 'failed', error: String(error).slice(0, 2000), finishedAt: this.clock.now().toISOString() });
      throw error;
    }
  }

  /** Not-yet-partner places in the bounds, for the map. */
  listInBounds(bounds: ImportArea, limit = 2000): Promise<OpenPlaceRecord[]> {
    return this.repo.listInBounds(bounds, limit);
  }

  /** When the data was last refreshed (ISO), for the map's source line. */
  async lastUpdated(): Promise<string | undefined> {
    const last = await this.repo.lastSuccessfulImport();
    return last?.finishedAt ? dbDate(last.finishedAt).toISOString() : undefined;
  }
}
