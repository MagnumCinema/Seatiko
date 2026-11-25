import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import type { Env } from '../../config/env.schema.js';
import { OpenPlacesService } from './open-places.service.js';

/**
 * Imports at start when the data is missing or old, then checks every night.
 * Runs in the background: the API serves requests while it works.
 */
@Injectable()
export class OpenPlacesScheduler implements OnApplicationBootstrap {
  private readonly logger = new Logger(OpenPlacesScheduler.name);
  private running = false;

  constructor(
    private readonly places: OpenPlacesService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  onApplicationBootstrap(): void {
    void this.refreshIfStale('start');
  }

  @Cron('0 30 4 * * *', { name: 'open-places-refresh', timeZone: 'Europe/Chisinau' })
  nightly(): Promise<void> {
    return this.refreshIfStale('schedule');
  }

  private async refreshIfStale(trigger: string): Promise<void> {
    if (!this.config.get('OPEN_PLACES_IMPORT', { infer: true }) || this.running) return;
    this.running = true;
    try {
      if (!(await this.places.isStale())) return;
      this.logger.log(`importing open places (${trigger}): ${this.places.cities().join(', ')}`);
      const result = await this.places.runImport();
      this.logger.log(`open places import ${result.status}: ${result.places} places`);
    } catch (error) {
      this.logger.error(`open places import failed: ${String(error)}`);
    } finally {
      this.running = false;
    }
  }
}
