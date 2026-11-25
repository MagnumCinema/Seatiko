import { Module } from '@nestjs/common';
import { AdultModule } from '../adult/adult.module.js';
import { CatalogModule } from '../catalog/catalog.module.js';
import { ReservationsModule } from '../reservations/reservations.module.js';
import { FloorController } from './floor.controller.js';
import { FloorRepository } from './floor.repository.js';
import { FloorService } from './floor.service.js';
import { StaffFloorController } from './staff-floor.controller.js';

/** In the venue: QR table sessions, orders, waiter calls, payment and the staff panel. */
@Module({
  imports: [CatalogModule, ReservationsModule, AdultModule],
  controllers: [FloorController, StaffFloorController],
  providers: [FloorRepository, FloorService],
})
export class FloorModule {}
