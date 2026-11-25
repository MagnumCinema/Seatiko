import { Controller, Get, HttpCode } from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import { sql } from 'drizzle-orm';
import { Public } from '../../core/auth/auth.decorators.js';
import { unavailable } from '../../core/errors/domain-error.js';
import type { Database } from '../../database/database.module.js';

@Controller()
export class HealthController {
  constructor(@InjectDrizzle() private readonly db: Database) {}

  /** Same body as the Go API; 503 database_unavailable when PostgreSQL does not answer. */
  @Public()
  @Get('healthz')
  @HttpCode(200)
  async health(): Promise<{ service: string; status: string }> {
    try {
      await this.db.execute(sql`select 1`);
    } catch {
      throw unavailable('database_unavailable');
    }
    return { service: 'seatiko-api', status: 'ok' };
  }
}
