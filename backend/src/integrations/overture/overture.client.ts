import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env.schema.js';
import type { SourcePlace } from '../../modules/open-places/domain/merge.js';
import { type ImportArea, OverturePlacesSource } from '../../modules/open-places/open-places.ports.js';
import { fromOverture, OVERTURE_CATEGORIES, type OvertureRow } from './overture-mapper.js';

const STAC_CATALOG = 'https://stac.overturemaps.org/catalog.json';
const num = (v: number) => {
  if (!Number.isFinite(v)) throw new Error('bad bounds');
  return String(v);
};

/**
 * Loads Overture Maps places (open data, CDLA Permissive 2.0) for an area straight
 * from the public GeoParquet release on S3. DuckDB reads only the row groups whose
 * bbox overlaps the area, so a city takes seconds and a country about half a minute.
 */
@Injectable()
export class OvertureClient extends OverturePlacesSource {
  private readonly logger = new Logger(OvertureClient.name);

  constructor(private readonly config: ConfigService<Env, true>) {
    super();
  }

  /** Release to read: OVERTURE_RELEASE, else the latest one in the STAC catalog. */
  private async release(): Promise<string> {
    const pinned = this.config.get('OVERTURE_RELEASE', { infer: true });
    if (pinned) return pinned;
    const res = await fetch(STAC_CATALOG, { signal: AbortSignal.timeout(30_000) });
    if (!res.ok) throw new Error(`Overture catalog: HTTP ${res.status}`);
    const latest = ((await res.json()) as { latest?: string }).latest;
    if (!latest || !/^\d{4}-\d{2}-\d{2}\.\d+$/.test(latest)) throw new Error('Overture catalog has no latest release');
    return latest;
  }

  async load(area: ImportArea): Promise<{ places: SourcePlace[]; release: string }> {
    const release = await this.release();
    const minConfidence = this.config.get('OVERTURE_MIN_CONFIDENCE', { infer: true });
    const categories = Object.keys(OVERTURE_CATEGORIES).map((c) => `'${c}'`).join(',');
    const { DuckDBInstance } = await import('@duckdb/node-api');
    const db = await DuckDBInstance.create(':memory:');
    const conn = await db.connect();
    try {
      await conn.run("INSTALL httpfs; LOAD httpfs; SET s3_region='us-west-2';");
      const reader = await conn.runAndReadAll(`
        SELECT id,
               names.primary AS name,
               map_extract_value(names.common, 'ru') AS name_ru,
               map_extract_value(names.common, 'ro') AS name_ro,
               map_extract_value(names.common, 'en') AS name_en,
               bbox.ymin AS lat, bbox.xmin AS lng,
               basic_category AS category, taxonomy.hierarchy AS hierarchy, confidence,
               phones[1] AS phone, websites[1] AS website,
               addresses[1].freeform AS street, addresses[1].locality AS locality
        FROM read_parquet('s3://overturemaps-us-west-2/release/${release}/theme=places/type=place/*', hive_partitioning = 0)
        WHERE bbox.xmin BETWEEN ${num(area.west)} AND ${num(area.east)}
          AND bbox.ymin BETWEEN ${num(area.south)} AND ${num(area.north)}
          AND basic_category IN (${categories})
          AND confidence >= ${num(minConfidence)}
          AND coalesce(operating_status, 'open') = 'open'`);
      const rows = reader.getRowObjectsJson() as unknown as OvertureRow[];
      const places = rows.map(fromOverture).filter((p): p is SourcePlace => p !== undefined);
      this.logger.log(`Overture ${release}: ${places.length} places`);
      return { places, release };
    } finally {
      conn.closeSync();
      db.closeSync();
    }
  }
}
