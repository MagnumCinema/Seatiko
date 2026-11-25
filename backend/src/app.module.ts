import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { createObserveModule } from '@nestjs/observe';
import { ScheduleModule } from '@nestjs/schedule';
import { ConfigModule } from './config/config.module.js';
import { AuthCoreModule } from './core/auth/auth-core.module.js';
import { HttpErrorFilter } from './core/http/http-error.filter.js';
import { TimeModule } from './core/time/time.module.js';
import { DatabaseModule } from './database/database.module.js';
import { CatalogModule } from './modules/catalog/catalog.module.js';
import { DocsModule } from './modules/docs/docs.module.js';
import { MapModule } from './modules/map/map.module.js';
import { HealthModule } from './modules/health/health.module.js';

export const { ObserveModule, ObserveInstrument } = createObserveModule();

/** Root module: wires infrastructure and domain modules, holds no logic itself. */
@Module({
  imports: [
    // NestJS Observe telemetry: sends nothing until OBSERVE_APP_KEY is set.
    ObserveModule.forRoot({
      appKey: process.env.OBSERVE_APP_KEY ?? 'YOUR_APP_KEY',
      appSecret: process.env.OBSERVE_APP_SECRET ?? 'YOUR_APP_SECRET',
      serviceId: 'seatiko-api',
    }),
    ConfigModule,
    ScheduleModule.forRoot(),
    TimeModule,
    DatabaseModule,
    AuthCoreModule,
    HealthModule,
    DocsModule,
    CatalogModule,
    MapModule,
  ],
  providers: [
    { provide: APP_FILTER, useClass: HttpErrorFilter },
  ],
})
export class AppModule {}
