import { Module } from '@nestjs/common';
import { MediaStorageModule } from '../../integrations/storage/media-storage.js';
import { CatalogModule } from '../catalog/catalog.module.js';
import { VenueRolesModule } from '../venue-roles/venue-roles.module.js';
import { AdminApplicationsController, ApplicationsController } from './applications.controller.js';
import { ApplicationsRepository } from './applications.repository.js';
import { ApplicationsService } from './applications.service.js';

/** Restaurant onboarding and moderation; publishing creates the venue. */
@Module({
  imports: [CatalogModule, MediaStorageModule, VenueRolesModule],
  controllers: [ApplicationsController, AdminApplicationsController],
  providers: [ApplicationsRepository, ApplicationsService],
})
export class ApplicationsModule {}
