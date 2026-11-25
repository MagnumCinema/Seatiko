import { Module } from '@nestjs/common';
import { CatalogModule } from '../catalog/catalog.module.js';
import { GuestRequestsService } from './guest-requests.service.js';
import { PreordersService } from './preorders.service.js';
import { ReservationsController } from './reservations.controller.js';
import { ReservationsRepository } from './reservations.repository.js';
import { ReservationsService } from './reservations.service.js';

/** Guest bookings: reservations, preorders, event requests and table watches. */
@Module({
  imports: [CatalogModule],
  controllers: [ReservationsController],
  providers: [ReservationsRepository, ReservationsService, PreordersService, GuestRequestsService],
  exports: [ReservationsService],
})
export class ReservationsModule {}
