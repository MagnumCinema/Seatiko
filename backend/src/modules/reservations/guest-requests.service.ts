import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { badRequest, notFound } from '../../core/errors/domain-error.js';
import { Clock, formatDbTime } from '../../core/time/time.js';
import { CatalogService } from '../catalog/catalog.service.js';
import { ReservationsRepository } from './reservations.repository.js';

/** Shown to the guest until venues give their own contact. */
const DEFAULT_ADMIN_PHONE = '+373 (231) 2-44-11';
const ADMIN_TELEGRAM = '@seatiko_admin';
const WATCH_MS = 2 * 3600_000;
const EMPTY = { ru: '', en: '', ro: '' };

export type InquiryInput = {
  venue_id: string;
  event_type: string;
  guest_count: number;
  preferred_date: Date;
  contact_method: string;
  contact_phone: string;
  contact_name: string;
  notes?: string;
};

type InquiryRow = Awaited<ReturnType<ReservationsRepository['insertInquiry']>>;

function presentInquiry(q: InquiryRow, venueName: { ru: string; en: string; ro: string } | null) {
  return {
    id: q.id,
    user_id: q.userId,
    venue_id: q.venueId,
    venue_name: venueName ?? EMPTY,
    event_type: q.eventType,
    guest_count: q.guestCount,
    preferred_date: formatDbTime(q.preferredDate),
    contact_method: q.contactMethod,
    contact_phone: q.contactPhone,
    contact_name: q.contactName,
    notes: q.notes,
    status: q.status,
    ...(q.adminPhone ? { admin_phone: q.adminPhone } : {}),
    ...(q.adminTelegram ? { admin_telegram: q.adminTelegram } : {}),
    created_at: formatDbTime(q.createdAt),
    updated_at: formatDbTime(q.updatedAt),
  };
}

/** Banquet / event requests and "tell me when this table frees up" watches. */
@Injectable()
export class GuestRequestsService {
  constructor(
    private readonly repo: ReservationsRepository,
    private readonly catalog: CatalogService,
    private readonly clock: Clock,
  ) {}

  async createInquiry(userId: string, input: InquiryInput) {
    const venue = await this.catalog.publishedVenue(input.venue_id);
    if (!venue) throw notFound('venue_not_found');
    if (input.guest_count < 1) throw badRequest('invalid_params');
    const now = this.clock.now().toISOString();
    const row = await this.repo.insertInquiry({
      id: randomUUID(),
      userId,
      venueId: venue.id,
      eventType: input.event_type,
      guestCount: input.guest_count,
      preferredDate: input.preferred_date.toISOString(),
      contactMethod: input.contact_method,
      contactPhone: input.contact_phone,
      contactName: input.contact_name,
      notes: input.notes ?? '',
      status: 'PENDING',
      adminPhone: venue.phone || DEFAULT_ADMIN_PHONE,
      adminTelegram: ADMIN_TELEGRAM,
      createdAt: now,
      updatedAt: now,
    });
    return presentInquiry(row, venue.name);
  }

  async inquiries(userId: string) {
    return (await this.repo.inquiriesOf(userId)).map(({ q, venueName }) => presentInquiry(q, venueName));
  }

  async watchTable(userId: string, venueId: string, tableId: string) {
    const venue = await this.catalog.publishedVenue(venueId);
    const table = await this.repo.table(tableId);
    if (!venue || !table || table.venueId !== venueId) throw notFound('not_found');
    const now = this.clock.now();
    const w = await this.repo.insertWatch({
      id: randomUUID(),
      userId,
      venueId,
      tableId,
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + WATCH_MS).toISOString(),
    });
    return { id: w.id, user_id: w.userId, venue_id: w.venueId, table_id: w.tableId, created_at: formatDbTime(w.createdAt), expires_at: formatDbTime(w.expiresAt) };
  }
}
