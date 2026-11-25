import { Injectable } from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import { and, between, desc, eq, isNull, lt, sql } from 'drizzle-orm';
import type { Database } from '../../database/database.module.js';
import { openPlaceImports, openPlaces } from '../../database/schema/index.js';
import type { MergedPlace } from './domain/merge.js';
import type { ImportArea } from './open-places.ports.js';

export type OpenPlaceRecord = typeof openPlaces.$inferSelect;
export type ImportRecord = typeof openPlaceImports.$inferSelect;

const inArea = (a: ImportArea) => and(between(openPlaces.lat, a.south, a.north), between(openPlaces.lng, a.west, a.east));

@Injectable()
export class OpenPlacesRepository {
  constructor(@InjectDrizzle() private readonly db: Database) {}

  async lastSuccessfulImport(): Promise<ImportRecord | undefined> {
    const [row] = await this.db.select().from(openPlaceImports).where(eq(openPlaceImports.status, 'done')).orderBy(desc(openPlaceImports.startedAt)).limit(1);
    return row;
  }

  /**
   * Records a new run unless one started in the last 30 minutes is still running
   * (another replica, or a run that crashed). Returns false when skipped.
   */
  async tryStartImport(id: string, cities: string[], at: string): Promise<boolean> {
    const res = await this.db.execute(sql`
      insert into ${openPlaceImports} (id, started_at, status, cities)
      select ${id}, ${at}, 'running', array[${sql.join(cities.map((c) => sql`${c}`), sql`, `)}]::text[]
      where not exists (
        select 1 from ${openPlaceImports}
        where status = 'running' and started_at > ${at}::timestamptz - interval '30 minutes')`);
    return (res.rowCount ?? 0) > 0;
  }

  async finishImport(id: string, values: Partial<Pick<ImportRecord, 'status' | 'osmCount' | 'overtureCount' | 'placeCount' | 'overtureRelease' | 'error' | 'finishedAt'>>): Promise<void> {
    await this.db.update(openPlaceImports).set(values).where(eq(openPlaceImports.id, id));
  }

  /** Writes the places of one area; with `prune`, removes the area's rows this run did not see. */
  async saveArea(area: ImportArea, places: MergedPlace[], links: Map<string, string>, seenAt: string, prune: boolean): Promise<void> {
    await this.db.transaction(async (tx) => {
      for (let i = 0; i < places.length; i += 500) {
        const rows = places.slice(i, i + 500).map((p) => ({
          id: p.id,
          name: p.name,
          lat: p.lat,
          lng: p.lng,
          address: p.address,
          category: p.category,
          cuisine: p.cuisine,
          openingHours: p.openingHours,
          phone: p.phone,
          website: p.website,
          osmId: p.osmId,
          overtureId: p.overtureId,
          sources: p.sources,
          confidence: p.confidence,
          venueId: links.get(p.id) ?? null,
          seenAt,
          updatedAt: seenAt,
        }));
        await tx
          .insert(openPlaces)
          .values(rows)
          .onConflictDoUpdate({
            target: openPlaces.id,
            set: Object.fromEntries(
              ['name', 'lat', 'lng', 'address', 'category', 'cuisine', 'opening_hours', 'phone', 'website', 'osm_id', 'overture_id', 'sources', 'confidence', 'venue_id', 'seen_at', 'updated_at'].map((c) => [
                c.replace(/_(\w)/g, (_, x: string) => x.toUpperCase()),
                sql.raw(`excluded.${c}`),
              ]),
            ),
          });
      }
      if (prune) await tx.delete(openPlaces).where(and(inArea(area), lt(openPlaces.seenAt, seenAt)));
    });
  }

  /** Not-yet-partner places inside the bounds, best described first. */
  listInBounds(b: ImportArea, limit: number): Promise<OpenPlaceRecord[]> {
    return this.db
      .select()
      .from(openPlaces)
      .where(and(inArea(b), isNull(openPlaces.venueId)))
      .orderBy(desc(sql`cardinality(${openPlaces.sources})`), desc(openPlaces.confidence), openPlaces.id)
      .limit(limit);
  }

  async countAll(): Promise<number> {
    const [row] = await this.db.select({ n: sql<number>`count(*)::int` }).from(openPlaces);
    return row?.n ?? 0;
  }
}
