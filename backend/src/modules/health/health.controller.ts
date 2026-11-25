import { Controller, Get, HttpCode } from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import { sql } from 'drizzle-orm';
import { Public } from '../../core/auth/auth.decorators.js';
import { unavailable } from '../../core/errors/domain-error.js';
import type { Database } from '../../database/database.module.js';
import { CrmService } from '../crm/crm.service.js';

@Controller()
export class HealthController {
  constructor(
    @InjectDrizzle() private readonly db: Database,
    private readonly crm: CrmService,
  ) {}

  /** Same body as the Go API; 503 database_unavailable when PostgreSQL does not answer. */
  @Public()
  @Get('healthz')
  @HttpCode(200)
  async health(): Promise<{ service: string; status: string; crm?: { enabled: boolean; healthy: boolean } }> {
    try {
      await this.db.execute(sql`select 1`);
    } catch {
      throw unavailable('database_unavailable');
    }
    const crm = this.crm.status();
    // As the Go API: the CRM block appears when the integration is configured.
    return { service: 'seatiko-api', status: 'ok', ...(this.crm.enabled ? { crm: { enabled: crm.enabled, healthy: crm.healthy } } : {}) };
  }
}
