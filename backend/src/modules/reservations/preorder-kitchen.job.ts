import { Injectable, Logger } from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import { Interval } from '@nestjs/schedule';
import { sql } from 'drizzle-orm';
import { Clock, dbDate } from '../../core/time/time.js';
import type { Database } from '../../database/database.module.js';
import { orders, reservations } from '../../database/schema/index.js';
import { NotificationsService } from '../notifications/notifications.service.js';

/**
 * Starts preorders on time (runPreorderKitchen in Go): at kitchen_at a submitted
 * preorder of a live booking moves to PREPARING, and the kitchen and the guest are
 * told. One UPDATE … RETURNING claims the rows, so several instances never double-start.
 */
@Injectable()
export class PreorderKitchenJob {
  private readonly logger = new Logger(PreorderKitchenJob.name);

  constructor(
    @InjectDrizzle() private readonly db: Database,
    private readonly notifications: NotificationsService,
    private readonly clock: Clock,
  ) {}

  @Interval('preorder-kitchen', 30_000)
  async tick(): Promise<number> {
    const now = this.clock.now().toISOString();
    const started = await this.db.execute<{ id: string; venue_id: string; user_id: string; reservation_id: string; reserved_for: string }>(sql`
      update ${orders} o set status = 'PREPARING', updated_at = ${now}
      from ${reservations} r
      where o.preorder and o.status = 'SUBMITTED' and o.kitchen_at <= ${now}
        and r.id = o.reservation_id and r.status in ('CONFIRMED', 'CHECKED_IN')
      returning o.id, o.venue_id, o.user_id, o.reservation_id, r.reserved_for::text`);
    for (const o of started.rows) {
      const staff = await this.notifications.venueStaffRecipients(o.venue_id);
      await this.notifications.send('PREORDER_PREPARING', [...staff, o.user_id], {
        venueId: o.venue_id,
        reservationId: o.reservation_id,
        orderId: o.id,
        at: dbDate(o.reserved_for),
      });
    }
    if (started.rows.length) this.logger.log(`preorders sent to the kitchen: ${started.rows.length}`);
    return started.rows.length;
  }
}
