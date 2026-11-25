import { Module } from '@nestjs/common';
import { GoogleMapsConfig } from '../../integrations/google/google-maps.config.js';
import { CatalogModule } from '../catalog/catalog.module.js';
import { OpenPlacesModule } from '../open-places/open-places.module.js';
import { MapController } from './map.controller.js';
import { MapService } from './map.service.js';

@Module({
  imports: [CatalogModule, OpenPlacesModule],
  controllers: [MapController],
  providers: [MapService, GoogleMapsConfig],
})
export class MapModule {}
