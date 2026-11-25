import { Global, Module } from '@nestjs/common';
import { CrmController } from './crm.controller.js';
import { CrmRepository } from './crm.repository.js';
import { CrmService } from './crm.service.js';

/** Twenty CRM synchronization (admin team only; owners use the site cabinet). */
@Global()
@Module({ controllers: [CrmController], providers: [CrmRepository, CrmService], exports: [CrmService] })
export class CrmModule {}
