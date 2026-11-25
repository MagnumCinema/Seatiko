import { Global, Module } from '@nestjs/common';
import { AccountStatusPort } from '../../core/auth/account-status.port.js';
import { MediaStorageModule } from '../../integrations/storage/media-storage.js';
import { AccountStatusAdapter } from './account-status.adapter.js';
import { AdminBootstrap } from './admin-bootstrap.js';
import { AccountsController } from './accounts.controller.js';
import { AccountsRepository } from './accounts.repository.js';
import { AccountsService } from './accounts.service.js';

/** Sign-up, sign-in, profile, avatar and GDPR deletion. Global so the auth guard sees account status. */
@Global()
@Module({
  imports: [MediaStorageModule],
  controllers: [AccountsController],
  providers: [AccountsRepository, AccountsService, AdminBootstrap, { provide: AccountStatusPort, useClass: AccountStatusAdapter }],
  exports: [AccountsService, AccountStatusPort],
})
export class AccountsModule {}
