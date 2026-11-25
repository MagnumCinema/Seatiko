import { sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '../schema/index.js';
import { EMPTY_TEXT, values, type GoState } from './go-state.js';

type Db = NodePgDatabase<typeof schema>;

export type ImportOptions = {
  /** Move every timestamp (and shift dates) by this many milliseconds: keeps demo data "today". */
  shiftMs?: number;
  /** Delete all Seatiko rows first (fresh seed / repeatable import). */
  replace?: boolean;
};

export type ImportReport = Record<string, number>;

const DEFAULT_VISIT_MIN = 90;
const DEFAULT_MAX_VISIT_MIN = 180;

/** Defaults of the Go store (booking_rules.go): visit length and its cap. */
function visitMinutes(venue: any): number {
  const max = venue?.max_visit_duration_min > 0 ? venue.max_visit_duration_min : DEFAULT_MAX_VISIT_MIN;
  const d = venue?.visit_duration_min > 0 ? venue.visit_duration_min : DEFAULT_VISIT_MIN;
  return Math.min(d, max);
}

/**
 * Imports a Go API snapshot into PostgreSQL in one transaction, keeping every id.
 * Used for the demo seed (frozen fresh Go state) and for the production cutover.
 */
export async function importGoState(db: Db, state: GoState, opts: ImportOptions = {}): Promise<ImportReport> {
  const shift = opts.shiftMs ?? 0;
  const dayShift = Math.round(shift / 86_400_000);
  const t = (v: unknown): string | null => {
    if (typeof v !== 'string' || !v || v.startsWith('0001-01-01')) return null;
    if (!shift) return v;
    return new Date(new Date(v).getTime() + shift).toISOString();
  };
  const tReq = (v: unknown): string => t(v) ?? new Date().toISOString();
  const shiftDay = (d: string): string => {
    if (!dayShift || !/^\d{4}-\d\d-\d\d$/.test(d)) return d;
    const date = new Date(`${d}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() + dayShift);
    return date.toISOString().slice(0, 10);
  };
  const text = (v: any) => (v && typeof v === 'object' ? { ru: v.ru ?? '', en: v.en ?? '', ro: v.ro ?? '' } : EMPTY_TEXT);

  const venuesById = state.venues ?? {};
  const report: ImportReport = {};

  await db.transaction(async (tx) => {
    const run = tx as unknown as Db;
    if (opts.replace) {
      // Not TRUNCATE … CASCADE on venues: it would also empty open_places (real map data).
      await run.execute(sql`UPDATE open_places SET venue_id = NULL`);
      await run.execute(sql`TRUNCATE notifications, adult_permission_log, order_items, orders, waiter_calls, sessions,
        reservation_tables, reservations, table_watches, waitlist_entries, event_inquiries, work_shifts, staff_members,
        profile_change_requests, application_activities, applications, menu_items, tables, collections, user_identities, users, app_meta`);
      await run.execute(sql`DELETE FROM venues`);
      await run.execute(sql`DELETE FROM cities`);
    }
    const ins = (name: string, table: any, rows: any[]) => {
      report[name] = rows.length;
      return rows.length ? (async () => {
        for (let i = 0; i < rows.length; i += 500) await run.insert(table).values(rows.slice(i, i + 500));
      })() : Promise.resolve();
    };

    await ins('cities', schema.cities, values(state.cities).map((c: any) => ({
      id: c.id, slug: c.slug, name: text(c.name), available: !!c.available, country: c.country ?? 'MD', center: c.center, bounds: c.bounds,
    })));
    await ins('users', schema.users, values(state.users).map((u: any) => ({
      id: u.id, email: u.email, passwordHash: u.password_hash ?? '', phone: u.phone ?? '', firstName: u.first_name ?? '', lastName: u.last_name ?? '',
      displayName: u.display_name ?? '', locale: u.locale || 'ru', role: u.role || 'guest', dietPreferences: u.diet_preferences ?? [],
      favoriteVenues: u.favorite_venues ?? [], avatarUrl: u.avatar_url ?? '', avatarKey: u.avatar_key ?? '',
      adultPreorderAllowed: !!u.adult_preorder_allowed, adultVerification: u.adult_verification ?? null,
      deletedAt: t(u.deleted_at), createdAt: tReq(u.created_at), updatedAt: tReq(u.updated_at ?? u.created_at),
    })));
    await ins('venues', schema.venues, values(state.venues).map((v: any) => ({
      id: v.id, cityId: v.city_id, name: text(v.name), description: text(v.description), cuisine: v.cuisine ?? [], rating: v.rating ?? 0,
      reviewCount: v.review_count ?? 0, priceLevel: v.price_level ?? 0, address: text(v.address), lat: v.lat ?? 0, lng: v.lng ?? 0,
      averageCheck: v.average_check ?? 0, openNow: v.open_now ?? true, imageUrl: v.image_url ?? '', photoUrls: v.photo_urls ?? [],
      phone: v.phone ?? '', website: v.website ?? '', googlePlaceId: v.google_place_id ?? '', reviews: v.reviews ?? [],
      alcoholLicense: !!v.alcohol_license_valid, sessionStartBeforeMin: v.session_start_before_min ?? 0, releaseBeforeMin: v.release_before_min ?? 0,
      bookingIntervalMin: v.booking_interval_min ?? 0, holdMinutes: v.hold_minutes ?? 0, maxLateArrivalMin: v.max_late_arrival_min ?? 0,
      visitDurationMin: v.visit_duration_min ?? 0, maxVisitDurationMin: v.max_visit_duration_min ?? 0, allowPreorder: !!v.allow_preorder,
      preorderLeadMin: v.preorder_lead_min ?? 0, hoursText: v.hours_text ?? '',
    })));
    await ins('tables', schema.tables, values(state.tables).map((x: any) => ({
      id: x.id, venueId: x.venue_id, number: x.number, seats: x.seats, status: x.status || 'FREE', x: x.x ?? 0, y: x.y ?? 0, zone: x.zone || 'hall',
      occupiedSince: t(x.occupied_since), reservedFor: t(x.reserved_for), reservationId: x.reservation_id ?? null, qrToken: x.qr_token ?? '',
    })));
    await ins('menu_items', schema.menuItems, values(state.menu_items).map((m: any) => ({
      id: m.id, venueId: m.venue_id, category: text(m.category), name: text(m.name), description: text(m.description),
      ingredients: m.ingredients ? text(m.ingredients) : null, allergens: m.allergens ?? [], price: m.price ?? 0, weightG: m.weight_g ?? 0,
      volumeMl: m.volume_ml ?? 0, imageUrl: m.image_url ?? '', containsAlcohol: !!m.contains_alcohol,
      requiresAge18: !!m.requires_age_18 || !!m.contains_alcohol, tags: m.tags ?? [], position: m.position ?? 0, stopped: !!m.stopped,
    })));
    await ins('collections', schema.collections, values(state.collections).map((c: any, i: number) => ({
      id: c.id, slug: c.slug, title: text(c.title), venueIds: c.venue_ids ?? [], position: i,
    })));

    const reservations = values(state.reservations);
    await ins('reservations', schema.reservations, reservations.map((r: any) => ({
      id: r.id, userId: r.user_id, venueId: r.venue_id, tableId: r.table_id, guests: r.guests, reservedFor: tReq(r.reserved_for),
      durationMin: r.duration_min ?? 0, status: r.status, source: r.source || 'WEB', notes: r.notes ?? '',
      arrivalConfirmedAt: t(r.arrival_confirmed_at), expectedArrival: t(r.expected_arrival), createdAt: tReq(r.created_at), updatedAt: tReq(r.updated_at ?? r.created_at),
    })));
    // Blocked window per table, as reservationWindow() in the Go store.
    await ins('reservation_tables', schema.reservationTables, reservations.flatMap((r: any) => {
      const start = new Date(tReq(r.reserved_for));
      const arrival = t(r.expected_arrival) ? new Date(t(r.expected_arrival)!) : start;
      const from = arrival > start ? arrival : start;
      const minutes = r.duration_min > 0 ? r.duration_min : visitMinutes(venuesById[r.venue_id]);
      const end = new Date(from.getTime() + minutes * 60_000);
      const active = r.status === 'CONFIRMED' || r.status === 'CHECKED_IN';
      const ids: string[] = r.table_ids?.length ? r.table_ids : [r.table_id];
      return [...new Set(ids)].map((tableId, position) => ({
        reservationId: r.id, tableId, position, active, blocks: `[${start.toISOString()},${end.toISOString()})`,
      }));
    }));

    await ins('table_watches', schema.tableWatches, values(state.watches).map((w: any) => ({
      id: w.id, userId: w.user_id, venueId: w.venue_id, tableId: w.table_id, createdAt: tReq(w.created_at), expiresAt: tReq(w.expires_at),
    })));
    await ins('sessions', schema.sessions, values(state.sessions).map((s: any) => ({
      id: s.id, userId: s.user_id, venueId: s.venue_id, tableId: s.table_id, reservationId: s.reservation_id ?? null, status: s.status,
      startedAt: tReq(s.started_at), closedAt: t(s.closed_at),
    })));
    const orders = values(state.orders);
    await ins('orders', schema.orders, orders.map((o: any) => ({
      id: o.id, sessionId: o.session_id ?? '', userId: o.user_id, venueId: o.venue_id, preorder: !!o.preorder, reservationId: o.reservation_id ?? '',
      kitchenAt: t(o.kitchen_at), adultItemsRemovedAt: t(o.adult_items_removed_at), status: o.status, total: o.total ?? 0,
      checkNumber: o.check_number ?? '', paymentMethod: o.payment_method ?? '', paidAt: t(o.paid_at), createdAt: tReq(o.created_at), updatedAt: tReq(o.updated_at ?? o.created_at),
    })));
    await ins('order_items', schema.orderItems, orders.flatMap((o: any) => (o.items ?? []).map((it: any, position: number) => ({
      orderId: o.id, position, menuItemId: it.menu_item_id, name: text(it.name), qty: it.qty, price: it.price,
      requiresAge18: !!it.requires_age_18, containsAlcohol: !!it.contains_alcohol, ageCheck: it.age_check ?? '',
    }))));
    await ins('waiter_calls', schema.waiterCalls, values(state.waiter_calls).map((w: any) => ({
      id: w.id, sessionId: w.session_id, venueId: w.venue_id, tableId: w.table_id, reason: w.reason, status: w.status, createdAt: tReq(w.created_at),
    })));
    await ins('applications', schema.applications, values(state.applications).map((a: any) => ({
      id: a.id, ownerUserId: a.owner_user_id, status: a.status, name: text(a.name), description: text(a.description), address: text(a.address),
      cuisine: a.cuisine ?? [], phone: a.phone ?? '', email: a.email ?? '', website: a.website ?? '', cityId: a.city_id ?? '', lat: a.lat ?? 0, lng: a.lng ?? 0,
      priceLevel: a.price_level ?? 0, averageCheck: a.average_check ?? 0, photoUrls: a.photo_urls ?? [], hoursText: a.hours_text ?? '',
      rejectReason: a.reject_reason ?? '', venueId: a.venue_id ?? null, bookingIntervalMin: a.booking_interval_min ?? 0, holdMinutes: a.hold_minutes ?? 0,
      allowPreorder: !!a.allow_preorder, sessionStartBeforeMin: a.session_start_before_min ?? 0, releaseBeforeMin: a.release_before_min ?? 0,
      maxLateArrivalMin: a.max_late_arrival_min ?? 0, visitDurationMin: a.visit_duration_min ?? 0, maxVisitDurationMin: a.max_visit_duration_min ?? 0,
      createdAt: tReq(a.created_at), updatedAt: tReq(a.updated_at ?? a.created_at), submittedAt: t(a.submitted_at),
    })));
    await ins('application_activities', schema.applicationActivities, Object.values(state.activities ?? {}).flat().map((e: any) => ({
      id: e.id, applicationId: e.application_id, actorUserId: e.actor_user_id ?? '', actorRole: e.actor_role || 'system', action: e.action,
      changedFields: e.changed_fields ?? [], note: e.note ?? '', createdAt: tReq(e.created_at),
    })));
    await ins('profile_change_requests', schema.profileChangeRequests, values(state.profile_changes).map((p: any) => ({
      id: p.id, applicationId: p.application_id, ownerUserId: p.owner_user_id, status: p.status, patch: p.patch ?? {}, note: p.note ?? '', createdAt: tReq(p.created_at),
    })));
    await ins('staff_members', schema.staffMembers, values(state.staff_members).map((m: any) => ({
      id: m.id, venueId: m.venue_id, userId: m.user_id ?? '', name: m.name ?? '', email: m.email, role: m.role || 'waiter', status: m.status,
      onShift: !!m.on_shift, createdAt: tReq(m.created_at),
    })));
    await ins('work_shifts', schema.workShifts, values(state.work_shifts).map((w: any) => ({
      id: w.id, venueId: w.venue_id, staffId: w.staff_id, staffName: w.staff_name ?? '', role: w.role, date: shiftDay(w.date),
      startTime: w.start_time, endTime: w.end_time, status: w.status, note: w.note ?? '', reason: w.reason ?? '',
      createdAt: tReq(w.created_at), updatedAt: tReq(w.updated_at ?? w.created_at),
    })));
    await ins('waitlist_entries', schema.waitlistEntries, values(state.waitlist).map((w: any) => ({
      id: w.id, venueId: w.venue_id, userId: w.user_id ?? '', guestName: w.guest_name ?? '', phone: w.phone ?? '', guests: w.guests,
      zone: w.zone || 'hall', note: w.note ?? '', status: w.status, source: w.source || 'APP', tableId: w.table_id ?? '', quotedWait: w.quoted_wait ?? 0,
      createdAt: tReq(w.created_at), notifiedAt: t(w.notified_at), seatedAt: t(w.seated_at), closedAt: t(w.closed_at),
    })));
    await ins('event_inquiries', schema.eventInquiries, values(state.event_inquiries).map((e: any) => ({
      id: e.id, userId: e.user_id, venueId: e.venue_id, eventType: e.event_type, guestCount: e.guest_count, preferredDate: tReq(e.preferred_date),
      contactMethod: e.contact_method, contactPhone: e.contact_phone ?? '', contactName: e.contact_name ?? '', notes: e.notes ?? '',
      status: e.status || 'PENDING', adminPhone: e.admin_phone ?? '', adminTelegram: e.admin_telegram ?? '', createdAt: tReq(e.created_at), updatedAt: tReq(e.updated_at ?? e.created_at),
    })));
    await ins('adult_permission_log', schema.adultPermissionLog, (state.adult_permission_log ?? []).map((e: any) => ({
      id: e.id, userId: e.user_id, action: e.action, staffId: e.staff_id, staffRole: e.staff_role, staffDisplayName: e.staff_display_name,
      venueId: e.venue_id, reservationId: e.reservation_id ?? '', idDocumentChecked: !!e.id_document_checked, idDocumentType: e.id_document_type ?? '',
      reason: e.reason ?? '', createdAt: tReq(e.created_at),
    })));
    await ins('notifications', schema.notifications, (state.notifications ?? []).map((n: any) => ({
      id: n.id, userId: n.user_id, kind: n.kind, venueId: n.venue_id ?? '', reservationId: n.reservation_id ?? '', orderId: n.order_id ?? '',
      at: t(n.at), createdAt: tReq(n.created_at), readAt: t(n.read_at),
    })));
    // Demo versions only for a demo snapshot (a real-data import has none).
    await ins('app_meta', schema.appMeta, state.demo_menu_version === undefined ? [] : [
      { key: 'demo_menu_version', value: String(state.demo_menu_version ?? 0) },
      { key: 'demo_seed_version', value: String(state.demo_seed_version ?? 0) },
    ]);
  });
  return report;
}
