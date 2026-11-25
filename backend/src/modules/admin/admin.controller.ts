import { Controller, Get, HttpCode, Post } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env.schema.js';
import { Roles } from '../../core/auth/auth.decorators.js';
import { DomainError, unavailable } from '../../core/errors/domain-error.js';
import { CrmService } from '../crm/crm.service.js';
import { formatDbTime } from '../../core/time/time.js';
import { OrdersRepository } from '../orders/orders.repository.js';
import { AdminReportsRepository } from './admin-reports.repository.js';

const EMPTY = { ru: '', en: '', ro: '' };
const nameOf = (u?: { displayName: string; firstName: string; lastName: string } | null) => u?.displayName || `${u?.firstName ?? ''} ${u?.lastName ?? ''}`.trim();

/** Admin console reports (role admin). */
@Roles('admin')
@Controller('api/v1/admin')
export class AdminController {
  constructor(
    private readonly reports: AdminReportsRepository,
    private readonly orders: OrdersRepository,
    private readonly config: ConfigService<Env, true>,
    private readonly crm: CrmService,
  ) {}

  @Get('overview')
  async overview() {
    return { overview: await this.reports.overview() };
  }

  @Get('people')
  async people() {
    const people = (await this.reports.people()).map((u) => ({
      id: u.id,
      email: u.email,
      ...(u.phone ? { phone: u.phone } : {}),
      first_name: u.firstName,
      last_name: u.lastName,
      display_name: u.displayName,
      role: u.role,
      locale: u.locale,
      created_at: formatDbTime(u.createdAt),
      crm_object: 'People',
    }));
    return { people, crm_object: 'People' };
  }

  @Get('companies')
  async companies() {
    const companies = (await this.reports.companies()).map(({ app, owner }) => ({
      application_id: app.id,
      ...(app.venueId ? { venue_id: app.venueId } : {}),
      name: app.name,
      status: app.status,
      owner_email: owner?.email ?? '',
      owner_name: nameOf(owner),
      phone: app.phone,
      email: app.email,
      city_id: app.cityId,
      average_check: app.averageCheck,
      cuisine: app.cuisine,
      updated_at: formatDbTime(app.updatedAt),
      crm_object: 'Companies',
    }));
    return { companies, crm_object: 'Companies' };
  }

  @Get('reservations')
  async reservations() {
    const reservations = (await this.reports.reservations()).map(({ r, venueName, tableNumber, guest }) => ({
      id: r.id,
      venue_id: r.venueId,
      venue_name: venueName ?? EMPTY,
      table_id: r.tableId,
      table_number: tableNumber ?? 0,
      guest_id: r.userId,
      guest_name: nameOf(guest),
      guest_email: guest?.email ?? '',
      guests: r.guests,
      reserved_for: formatDbTime(r.reservedFor),
      status: r.status,
      source: r.source,
      ...(r.arrivalConfirmedAt ? { arrival_confirmed_at: formatDbTime(r.arrivalConfirmedAt) } : {}),
      created_at: formatDbTime(r.createdAt),
      crm_object: 'Reservations',
    }));
    return { reservations, crm_object: 'Reservations' };
  }

  @Get('orders')
  async ordersList() {
    const guests = new Map((await this.reports.guests()).map((g) => [g.id, g]));
    const rows = (await this.orders.load(undefined)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const orders = rows.map((o) => {
      const g = guests.get(o.userId);
      return {
        id: o.id,
        session_id: o.sessionId,
        user_id: o.userId,
        guest_name: nameOf(g),
        guest_email: g?.email ?? '',
        venue_id: o.venueId,
        venue_name: o.venueName ?? EMPTY,
        items: o.items.map((it) => ({
          menu_item_id: it.menuItemId,
          name: it.name,
          qty: it.qty,
          price: it.price,
          ...(it.requiresAge18 ? { requires_age_18: true } : {}),
          ...(it.containsAlcohol ? { contains_alcohol: true } : {}),
          ...(it.ageCheck ? { age_check: it.ageCheck } : {}),
        })),
        status: o.status,
        total: o.total,
        paid: o.status === 'PAID',
        created_at: formatDbTime(o.createdAt),
        updated_at: formatDbTime(o.updatedAt),
      };
    });
    return { orders };
  }

  /** Twenty CRM status for the admin console. */
  @Get('crm/status')
  crmStatus() {
    const raw = this.config.get('TWENTY_PUBLIC_URL', { infer: true }) ?? '';
    let crmUrl = '/crm';
    try {
      const u = new URL(raw);
      if (u.host && (u.protocol === 'http:' || u.protocol === 'https:')) crmUrl = u.toString().replace(/\/$/, '');
    } catch {
      // keep /crm
    }
    if (!this.crm.enabled) return { enabled: false, healthy: false, crm_url: crmUrl };
    const s = this.crm.status();
    return {
      enabled: s.enabled,
      healthy: s.healthy,
      running: s.running,
      last_success_at: s.last_success_at ?? null,
      last_error_at: s.last_error_at ?? null,
      last_error: s.last_error ?? '',
      webhook_configured: s.webhook_configured,
      last_webhook_at: s.last_webhook_at ?? null,
      crm_url: crmUrl,
      objects: ['People', 'Companies', 'Reservations'],
    };
  }

  @Post('integrations/twenty/reconcile')
  @HttpCode(200)
  async reconcile() {
    if (!this.crm.enabled) throw unavailable('crm_disabled');
    try {
      await this.crm.reconcile();
    } catch {
      throw new DomainError('crm_sync_failed', 502);
    }
    return { status: 'synchronized' };
  }
}
