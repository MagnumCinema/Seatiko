import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { createObserveModule } from '@nestjs/observe';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { ConfigModule } from './config/config.module.js';
import { AuthCoreModule } from './core/auth/auth-core.module.js';
import { HttpErrorFilter } from './core/http/http-error.filter.js';
import { TimeModule } from './core/time/time.module.js';
import { DatabaseModule } from './database/database.module.js';
import { AccountsModule } from './modules/accounts/accounts.module.js';
import { ApplicationsModule } from './modules/applications/applications.module.js';
import { CatalogModule } from './modules/catalog/catalog.module.js';
import { DocsModule } from './modules/docs/docs.module.js';
import { MapModule } from './modules/map/map.module.js';
import { NotificationsModule } from './modules/notifications/notifications.module.js';
import { OrdersModule } from './modules/orders/orders.module.js';
import { ReservationsModule } from './modules/reservations/reservations.module.js';
import { FloorModule } from './modules/floor/floor.module.js';
import { VenueAdminModule } from './modules/venue-admin/venue-admin.module.js';
import { WaitlistModule } from './modules/waitlist/waitlist.module.js';
import { VenueAccessModule } from './modules/venue-access/venue-access.service.js';
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
    // Per-route limits (@Throttle) as in the Go API; the default is effectively unlimited.
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 100_000 }]),
    TimeModule,
    DatabaseModule,
    AuthCoreModule,
    HealthModule,
    DocsModule,
    NotificationsModule,
    VenueAccessModule,
    OrdersModule,
    AccountsModule,
    CatalogModule,
    MapModule,
    ReservationsModule,
    WaitlistModule,
    FloorModule,
    ApplicationsModule,
    VenueAdminModule,
  ],
  providers: [
    { provide: APP_FILTER, useClass: HttpErrorFilter },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
