import { Module } from '@nestjs/common';
import { CatalogModule } from '../catalog/catalog.module.js';
import { WaitlistController } from './waitlist.controller.js';
import { WaitlistRepository } from './waitlist.repository.js';
import { WaitlistService } from './waitlist.service.js';

/** Virtual queue: guests join remotely, hosts call, seat and close entries. */
@Module({
  imports: [CatalogModule],
  controllers: [WaitlistController],
  providers: [WaitlistRepository, WaitlistService],
})
export class WaitlistModule {}
