import { Module } from '@nestjs/common';
import { VenueRolesController } from './venue-roles.controller.js';
import { VenueRolesRepository } from './venue-roles.repository.js';
import { VenueRolesService } from './venue-roles.service.js';

/** Venue types' preset roles and the owner's custom team roles. */
@Module({
  controllers: [VenueRolesController],
  providers: [VenueRolesRepository, VenueRolesService],
  exports: [VenueRolesService],
})
export class VenueRolesModule {}
