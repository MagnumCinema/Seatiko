import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env.schema.js';
import { badRequest, forbidden, notFound } from '../../core/errors/domain-error.js';
import { randomQr, signQr } from '../../core/qr/qr-token.js';
import { Clock, formatDbTime } from '../../core/time/time.js';
import type { LocalizedString } from '../../database/schema/columns.js';
import { presentMenuItem, presentTable, presentVenue, sortMenu } from '../catalog/catalog.presenter.js';
import { CatalogService } from '../catalog/catalog.service.js';
import { presentOrder } from '../orders/order.presenter.js';
import { OrdersRepository } from '../orders/orders.repository.js';
import { normalizeZone } from '../waitlist/waitlist.service.js';
import { VenueAccessService } from '../venue-access/venue-access.service.js';
import { ageRestricted, clampX, clampY, validBookingRules } from './domain/venue-rules.js';
import { type TableRow, VenueAdminRepository } from './venue-admin.repository.js';

export type TableInput = { number: number; seats: number; x: number; y: number; zone?: string };
export type MenuInput = {
  id?: string;
  category: LocalizedString;
  name: LocalizedString;
  description: LocalizedString;
  ingredients?: LocalizedString;
  allergens?: string[];
  price: number;
  weight_g?: number;
  volume_ml?: number;
  image_url?: string;
  contains_alcohol?: boolean;
  requires_age_18?: boolean;
  tags?: string[];
  stopped?: boolean;
};
export type RulesInput = Partial<{
  booking_interval_min: number;
  hold_minutes: number;
  allow_preorder: boolean;
  preorder_lead_min: number;
  session_start_before_min: number;
  release_before_min: number;
  max_late_arrival_min: number;
  visit_duration_min: number;
  max_visit_duration_min: number;
}>;

/** Owner table view: includes the QR token printed on the table. */
const ownerTable = (t: TableRow) => ({ ...presentTable(t), qr_token: t.qrToken });

/** The owner's cabinet for a published venue: floor plan, menu, QR codes, booking rules, analytics. */
@Injectable()
export class VenueAdminService {
  private readonly qrSecret: string;

  constructor(
    private readonly repo: VenueAdminRepository,
    private readonly access: VenueAccessService,
    private readonly catalog: CatalogService,
    private readonly orders: OrdersRepository,
    private readonly clock: Clock,
    config: ConfigService<Env, true>,
  ) {
    this.qrSecret = config.get('QR_SECRET', { infer: true });
  }

  /** Owner of this venue (or of the application it came from), else 403; returns the venue id. */
  private async owned(ownerId: string, venueOrAppId: string): Promise<string> {
    if (!(await this.access.ownerCanManage(ownerId, venueOrAppId))) throw forbidden();
    const venueId = await this.repo.resolveVenueId(venueOrAppId);
    if (!(await this.repo.venue(venueId))) throw notFound('not_found');
    return venueId;
  }

  /** Replaces the floor plan by table number: existing tables keep id and QR, new ones get a token, seated / reserved stay. */
  async replaceTables(ownerId: string, id: string, layout: TableInput[]) {
    const venueId = await this.owned(ownerId, id);
    if (!layout.length || layout.some((t) => t.number < 1 || t.seats < 1 || t.seats > 20)) throw badRequest('bad_request');
    await this.repo.transaction(async (tx) => {
      const existing = new Map((await this.repo.tablesOf(venueId, tx)).map((t) => [t.number, t]));
      await this.repo.upsertTables(
        tx,
        layout.map((t) => {
          const cur = existing.get(t.number);
          return {
            id: cur?.id ?? randomUUID(),
            venueId,
            number: t.number,
            seats: t.seats,
            status: cur?.status ?? 'FREE',
            x: clampX(t.x),
            y: clampY(t.y),
            zone: normalizeZone(t.zone),
            qrToken: cur?.qrToken ?? randomQr(),
          };
        }),
      );
      await this.repo.dropTablesExcept(tx, venueId, layout.map((t) => t.number));
    });
    const wanted = new Set(layout.map((t) => t.number));
    return (await this.repo.tablesOf(venueId)).filter((t) => wanted.has(t.number)).map(ownerTable);
  }

  /** Tables with their QR tokens; a table without one gets the signed token. */
  async qr(ownerId: string, id: string) {
    const venueId = await this.owned(ownerId, id);
    await this.repo.transaction(async (tx) => {
      for (const t of await this.repo.tablesOf(venueId, tx)) if (!t.qrToken) await this.repo.setQr(tx, t.id, signQr(this.qrSecret, venueId, t.id));
    });
    return (await this.repo.tablesOf(venueId)).map(ownerTable);
  }

  /** New random tokens for every table: printed codes stop working. */
  async regenerateQr(ownerId: string, id: string) {
    const venueId = await this.owned(ownerId, id);
    await this.repo.transaction(async (tx) => {
      for (const t of await this.repo.tablesOf(venueId, tx)) await this.repo.setQr(tx, t.id, randomQr());
    });
    return (await this.repo.tablesOf(venueId)).map(ownerTable);
  }

  async menu(ownerId: string, id: string) {
    const venueId = await this.owned(ownerId, id);
    return sortMenu(await this.repo.menuOf(venueId)).map(presentMenuItem);
  }

  /** Create (no id) or replace a dish; unspecified extras keep their values; alcohol is always 18+. */
  async saveMenuItem(ownerId: string, id: string, input: MenuInput) {
    const venueId = await this.owned(ownerId, id);
    const n = input.name;
    if (!(n.ru.trim() || n.en.trim() || n.ro.trim()) || input.price < 0) throw badRequest('bad_request');
    const itemId = input.id?.trim() || randomUUID();
    const cur = input.id ? await this.repo.menuItem(itemId) : undefined;
    if (cur && cur.venueId !== venueId) throw forbidden();
    const containsAlcohol = input.contains_alcohol ?? false;
    const saved = await this.repo.saveMenuItem({
      id: itemId,
      venueId,
      category: input.category,
      name: input.name,
      description: input.description,
      ingredients: input.ingredients ?? cur?.ingredients ?? null,
      allergens: input.allergens ?? cur?.allergens ?? [],
      price: input.price,
      weightG: input.weight_g !== undefined ? Math.max(0, input.weight_g) : (cur?.weightG ?? 0),
      volumeMl: input.volume_ml !== undefined ? Math.max(0, input.volume_ml) : (cur?.volumeMl ?? 0),
      imageUrl: input.image_url !== undefined ? input.image_url.trim() : (cur?.imageUrl ?? ''),
      containsAlcohol,
      requiresAge18: ageRestricted({ containsAlcohol, requiresAge18: input.requires_age_18 ?? false }),
      tags: input.tags ?? cur?.tags ?? [],
      position: cur?.position ?? 0,
      stopped: input.stopped ?? false,
    });
    return presentMenuItem(saved);
  }

  private async ownItem(venueId: string, itemId: string) {
    const item = await this.repo.menuItem(itemId);
    if (!item || item.venueId !== venueId) throw notFound('not_found');
    return item;
  }

  async deleteMenuItem(ownerId: string, id: string, itemId: string) {
    const venueId = await this.owned(ownerId, id);
    await this.ownItem(venueId, itemId);
    await this.repo.deleteMenuItem(itemId);
    return { ok: true };
  }

  /** Stop list: a stopped dish disappears from the guest menu. */
  async setStopped(ownerId: string, id: string, itemId: string, stopped: boolean) {
    const venueId = await this.owned(ownerId, id);
    await this.ownItem(venueId, itemId);
    return presentMenuItem(await this.repo.setStopped(itemId, stopped));
  }

  async updateRules(ownerId: string, id: string, input: RulesInput) {
    const venueId = await this.owned(ownerId, id);
    const v = (await this.repo.venue(venueId))!;
    const next = {
      bookingIntervalMin: input.booking_interval_min ?? v.bookingIntervalMin,
      holdMinutes: input.hold_minutes ?? v.holdMinutes,
      preorderLeadMin: input.preorder_lead_min ?? v.preorderLeadMin,
      sessionStartBeforeMin: input.session_start_before_min ?? v.sessionStartBeforeMin,
      releaseBeforeMin: input.release_before_min ?? v.releaseBeforeMin,
      maxLateArrivalMin: input.max_late_arrival_min ?? v.maxLateArrivalMin,
      visitDurationMin: input.visit_duration_min ?? v.visitDurationMin,
      maxVisitDurationMin: input.max_visit_duration_min ?? v.maxVisitDurationMin,
    };
    if (!validBookingRules(next)) throw badRequest('bad_request');
    await this.repo.updateVenue(venueId, { ...next, allowPreorder: input.allow_preorder ?? v.allowPreorder });
    return presentVenue((await this.catalog.publishedVenue(venueId))!);
  }

  /** Owner (or admin) dashboard numbers. */
  async analytics(userId: string, id: string) {
    const actor = await this.access.staffActor(userId, id);
    if (!(await this.access.ownerCanManage(userId, id)) && actor?.role !== 'admin') throw forbidden();
    const venueId = await this.repo.resolveVenueId(id);
    if (!(await this.repo.venue(venueId))) throw notFound('not_found');
    const a = await this.repo.analytics(venueId);
    return {
      venue_id: venueId,
      reservations_by_status: a.reservationsByStatus,
      free_tables: a.freeTables,
      waiter_calls_pending: a.waiterCallsPending,
      orders_by_status: a.ordersByStatus,
      total_tables: a.totalTables,
    };
  }

  /** Bookings at the owner's venues (every venue for an admin), with preorders. */
  async reservations(userId: string, role: string) {
    const rows = await this.repo.ownerReservations(role === 'admin' ? undefined : userId);
    const preorders = await this.orders.activePreorders(rows.map((x) => x.r.id));
    const now = this.clock.now();
    return rows.map(({ r, venueName, tableNumber, guest }) => {
      const po = preorders.find((o) => o.reservationId === r.id);
      return {
        id: r.id,
        venue_id: r.venueId,
        venue_name: venueName ?? { ru: '', en: '', ro: '' },
        table_id: r.tableId,
        table_number: tableNumber ?? 0,
        guest_name: guest?.displayName.trim() || `${guest?.firstName ?? ''} ${guest?.lastName ?? ''}`.trim(),
        guest_email: guest?.email ?? '',
        guests: r.guests,
        reserved_for: formatDbTime(r.reservedFor),
        status: r.status,
        ...(r.arrivalConfirmedAt ? { arrival_confirmed_at: formatDbTime(r.arrivalConfirmedAt) } : {}),
        created_at: formatDbTime(r.createdAt),
        ...(po ? { preorder: presentOrder(po, now) } : {}),
      };
    });
  }
}
