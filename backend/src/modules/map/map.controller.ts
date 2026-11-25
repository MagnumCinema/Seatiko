import { Controller, Get, Header, Param, Query } from '@nestjs/common';
import { Public } from '../../core/auth/auth.decorators.js';
import { badRequest, notFound } from '../../core/errors/domain-error.js';
import { type MapPlacesQuery, MapService } from './map.service.js';

const PHOTO_NAME = /^places\/[A-Za-z0-9_-]+\/photos\/[A-Za-z0-9_-]+$/;

@Public()
@Controller('api/v1')
export class MapController {
  constructor(private readonly map: MapService) {}

  @Get('map/config')
  @Header('Cache-Control', 'no-store')
  config() {
    return this.map.config();
  }

  @Get('map/places')
  @Header('Cache-Control', 'no-store')
  places(@Query() query: MapPlacesQuery) {
    return this.map.places(query);
  }

  @Get('venues/:id/places')
  venuePlaces(@Param('id') id: string) {
    return this.map.venuePlaces(id);
  }

  /** Google photo proxy of the Go API; live Google Places is off, so valid names get 404. */
  @Get('places/photo')
  photo(@Query('name') name?: string) {
    if (!name || !PHOTO_NAME.test(name)) throw badRequest('invalid_photo_name');
    throw notFound('photo_unavailable');
  }
}
