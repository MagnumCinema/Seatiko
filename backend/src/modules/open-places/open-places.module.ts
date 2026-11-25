import { Module } from '@nestjs/common';
import { OverpassClient } from '../../integrations/osm/overpass.client.js';
import { OvertureClient } from '../../integrations/overture/overture.client.js';
import { CatalogModule } from '../catalog/catalog.module.js';
import { OsmPlacesSource, OverturePlacesSource } from './open-places.ports.js';
import { OpenPlacesRepository } from './open-places.repository.js';
import { OpenPlacesScheduler } from './open-places.scheduler.js';
import { OpenPlacesService } from './open-places.service.js';

/** Cafes and restaurants from open data (OSM + Overture), refreshed in the background. */
@Module({
  imports: [CatalogModule],
  providers: [
    OpenPlacesRepository,
    OpenPlacesService,
    OpenPlacesScheduler,
    { provide: OsmPlacesSource, useClass: OverpassClient },
    { provide: OverturePlacesSource, useClass: OvertureClient },
  ],
  exports: [OpenPlacesService],
})
export class OpenPlacesModule {}
