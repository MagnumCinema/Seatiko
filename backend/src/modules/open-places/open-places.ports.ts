import type { SourcePlace } from './domain/merge.js';

/** Area to load (one city's bounds), degrees. */
export type ImportArea = { south: number; west: number; north: number; east: number };

/** OpenStreetMap food places (implemented in integrations/osm). */
export abstract class OsmPlacesSource {
  abstract load(area: ImportArea): Promise<SourcePlace[]>;
}

/** Overture Maps food places (implemented in integrations/overture). */
export abstract class OverturePlacesSource {
  /** Places and the Overture release they came from. */
  abstract load(area: ImportArea): Promise<{ places: SourcePlace[]; release: string }>;
}
