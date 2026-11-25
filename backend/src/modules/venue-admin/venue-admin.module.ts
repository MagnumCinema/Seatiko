import { Module } from '@nestjs/common';
import { CatalogModule } from '../catalog/catalog.module.js';
import { VenueAdminController } from './venue-admin.controller.js';
import { VenueAdminRepository } from './venue-admin.repository.js';
import { VenueAdminService } from './venue-admin.service.js';

/** Owner cabinet of a published venue: floor plan, menu, QR, booking rules, analytics, bookings. */
@Module({
  imports: [CatalogModule],
  controllers: [VenueAdminController],
  providers: [VenueAdminRepository, VenueAdminService],
})
export class VenueAdminModule {}
