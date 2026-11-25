import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { Observable, Subject, filter } from 'rxjs';
import { Clock, formatDbTime } from '../../core/time/time.js';
import { type Db, MAX_NOTIFICATIONS_PER_USER, type NotificationRow, NotificationsRepository } from './notifications.repository.js';

/** Notification kinds (APP_LOGIC §13); clients localise by kind. */
export type NotificationKind =
  | 'PREORDER_CREATED'
  | 'PREORDER_UPDATED'
  | 'PREORDER_CANCELLED'
  | 'PREORDER_PREPARING'
  | 'PREORDER_ADULT_REMOVED'
  | 'PREORDER_AGE_REFUSED'
  | 'ADULT_GRANTED'
  | 'ADULT_REVOKED';

export type NotificationRef = { venueId?: string; reservationId?: string; orderId?: string; at?: Date | string | null };

const EMPTY = { ru: '', en: '', ro: '' };

/** The JSON of one notification, as models.Notification in Go. */
export function presentNotification(n: NotificationRow) {
  return {
    id: n.id,
    user_id: n.userId,
    kind: n.kind,
    ...(n.venueId ? { venue_id: n.venueId } : {}),
    // Go's omitempty keeps an empty struct: venue_name is always present.
    venue_name: n.venueName ?? EMPTY,
    ...(n.reservationId ? { reservation_id: n.reservationId } : {}),
    ...(n.orderId ? { order_id: n.orderId } : {}),
    ...(n.at ? { at: formatDbTime(n.at) } : {}),
    created_at: formatDbTime(n.createdAt),
    ...(n.readAt ? { read_at: formatDbTime(n.readAt) } : {}),
  };
}

export type NotificationJson = ReturnType<typeof presentNotification>;

/**
 * In-app notifications: stored per recipient, listed by GET /me/notifications and
 * pushed live to open SSE streams of this instance.
 */
@Injectable()
export class NotificationsService {
  private readonly live = new Subject<NotificationJson>();

  constructor(
    private readonly repo: NotificationsRepository,
    private readonly clock: Clock,
  ) {}

  /**
   * Stores one notification per distinct recipient. Inside a transaction pass `tx`,
   * then call the returned `publish` after commit so streams never show rolled-back rows.
   */
  async notify(kind: NotificationKind, recipients: string[], ref: NotificationRef, tx?: Db): Promise<() => void> {
    const now = this.clock.now().toISOString();
    const at = ref.at ? (typeof ref.at === 'string' ? ref.at : ref.at.toISOString()) : null;
    const rows = [...new Set(recipients.filter(Boolean))].map((userId) => ({
      id: randomUUID(),
      userId,
      kind,
      venueId: ref.venueId ?? '',
      reservationId: ref.reservationId ?? '',
      orderId: ref.orderId ?? '',
      at,
      createdAt: now,
      readAt: null,
    }));
    await this.repo.insert(rows, tx);
    const venueName = rows.length ? await this.repo.venueName(ref.venueId ?? '') : null;
    return () => {
      for (const row of rows) this.live.next(presentNotification({ ...row, venueName }));
    };
  }

  /** notify() outside a transaction: stored and pushed at once. */
  async send(kind: NotificationKind, recipients: string[], ref: NotificationRef): Promise<void> {
    (await this.notify(kind, recipients, ref))();
  }

  venueStaffRecipients(venueId: string, tx?: Db): Promise<string[]> {
    return this.repo.venueStaffRecipients(venueId, tx);
  }

  async list(userId: string, unreadOnly: boolean, limit: number) {
    const n = limit > 0 && limit <= MAX_NOTIFICATIONS_PER_USER ? limit : 50;
    const [items, unread] = await Promise.all([this.repo.list(userId, unreadOnly, n), this.repo.unreadCount(userId)]);
    return { notifications: items.map(presentNotification), unread };
  }

  unreadCount(userId: string): Promise<number> {
    return this.repo.unreadCount(userId);
  }

  async markRead(userId: string, ids: string[]) {
    const marked = await this.repo.markRead(userId, ids, this.clock.now().toISOString());
    return { marked, unread: await this.repo.unreadCount(userId) };
  }

  /** New notifications of one user, as they are created on this instance. */
  stream(userId: string): Observable<NotificationJson> {
    return this.live.pipe(filter((n) => n.user_id === userId));
  }
}
