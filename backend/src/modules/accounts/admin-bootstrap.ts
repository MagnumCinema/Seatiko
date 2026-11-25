import { randomUUID } from 'node:crypto';
import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import bcrypt from 'bcryptjs';
import type { Env } from '../../config/env.schema.js';
import { Clock } from '../../core/time/time.js';
import { AccountsRepository } from './accounts.repository.js';

/**
 * Creates the first administrator from SEATIKO_ADMIN_EMAIL / SEATIKO_ADMIN_PASSWORD
 * when no account has that email. The site runs on real data: there are no demo accounts.
 */
@Injectable()
export class AdminBootstrap implements OnApplicationBootstrap {
  private readonly logger = new Logger(AdminBootstrap.name);

  constructor(
    private readonly repo: AccountsRepository,
    private readonly config: ConfigService<Env, true>,
    private readonly clock: Clock,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const email = this.config.get('SEATIKO_ADMIN_EMAIL', { infer: true })?.trim();
    const password = this.config.get('SEATIKO_ADMIN_PASSWORD', { infer: true });
    if (!email || !password || (await this.repo.byEmail(email))) return;
    const now = this.clock.now().toISOString();
    await this.repo.insert({
      id: randomUUID(),
      email,
      passwordHash: await bcrypt.hash(password, 10),
      displayName: 'Admin',
      role: 'admin',
      createdAt: now,
      updatedAt: now,
    });
    this.logger.log(`administrator ${email} created`);
  }
}
