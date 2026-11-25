import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Put, Req } from '@nestjs/common';
import type { Request } from 'express';
import { z } from 'zod';
import { type AuthUser, CurrentUser } from '../../core/auth/auth.decorators.js';
import { badRequest } from '../../core/errors/domain-error.js';
import { GuestRequestsService } from './guest-requests.service.js';
import { PreordersService } from './preorders.service.js';
import { ReservationsService } from './reservations.service.js';

/** RFC 3339 time, as Go's time.Time in JSON. */
const time = z.iso.datetime({ offset: true }).transform((s) => new Date(s));

const createBody = z.object({
  venue_id: z.string().min(1),
  table_id: z.string().optional(),
  table_ids: z.array(z.string()).optional(),
  guests: z.number().int().min(1),
  reserved_for: time,
  duration_min: z.number().int().optional(),
  notes: z.string().optional(),
  source: z.string().optional(),
});
const updateBody = z.object({
  table_id: z.string().optional(),
  table_ids: z.array(z.string()).optional(),
  guests: z.number().int().optional(),
  reserved_for: time.optional(),
  notes: z.string().optional(),
});
const arrivalBody = z.object({ expected_arrival: time.optional() });
const preorderBody = z.object({ items: z.array(z.object({ menu_item_id: z.string(), qty: z.number().int() })).nullish() });
const inquiryBody = z.object({
  venue_id: z.string().min(1),
  event_type: z.string().min(1),
  guest_count: z.number().int().min(1),
  preferred_date: time,
  contact_method: z.string().min(1),
  contact_phone: z.string().min(1),
  contact_name: z.string().min(1),
  notes: z.string().optional(),
});
const watchBody = z.object({ venue_id: z.string().min(1) });

const tablesOf = (b: { table_id?: string; table_ids?: string[] }) => (b.table_ids?.length ? b.table_ids : b.table_id ? [b.table_id] : []);

@Controller('api/v1')
export class ReservationsController {
  constructor(
    private readonly reservations: ReservationsService,
    private readonly preorders: PreordersService,
    private readonly requests: GuestRequestsService,
  ) {}

  @Post('reservations')
  async create(@CurrentUser() user: AuthUser, @Body({ schema: createBody }) body: z.infer<typeof createBody>) {
    const tableIds = tablesOf(body);
    if (!tableIds.length) throw badRequest('missing_table');
    const reservation = await this.reservations.create(user.id, {
      venueId: body.venue_id,
      tableIds,
      guests: body.guests,
      reservedFor: body.reserved_for,
      durationMin: body.duration_min ?? 0,
      notes: body.notes ?? '',
      source: body.source,
    });
    return { reservation };
  }

  @Get('reservations')
  async list(@CurrentUser() user: AuthUser) {
    return { reservations: await this.reservations.list(user.id) };
  }

  /** Declared before :id so "history" is not taken for an id. */
  @Delete('reservations/history')
  clearHistory(@CurrentUser() user: AuthUser) {
    return this.reservations.clearHistory(user.id);
  }

  @Patch('reservations/:id')
  async update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body({ schema: updateBody }) body: z.infer<typeof updateBody>) {
    const reservation = await this.reservations.update(user.id, id, {
      tableIds: tablesOf(body),
      guests: body.guests ?? 0,
      reservedFor: body.reserved_for,
      notes: body.notes ?? '',
    });
    return { reservation };
  }

  @Delete('reservations/:id')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.reservations.remove(user.id, id);
  }

  /** Body optional; a bad body is ignored as in Go. */
  @Post('reservations/:id/confirm-arrival')
  @HttpCode(200)
  async confirmArrival(@CurrentUser() user: AuthUser, @Param('id') id: string, @Req() req: Request) {
    const body = arrivalBody.safeParse(req.body ?? {});
    return { reservation: await this.reservations.confirmArrival(user.id, id, body.success ? body.data.expected_arrival : undefined) };
  }

  @Post('reservations/:id/cancel')
  @HttpCode(200)
  async cancel(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return { reservation: await this.reservations.cancel(user.id, id) };
  }

  @Get('reservations/:id/preorder')
  async getPreorder(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return { order: await this.preorders.get(user.id, id) };
  }

  @Put('reservations/:id/preorder')
  async savePreorder(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body({ schema: preorderBody }) body: z.infer<typeof preorderBody>) {
    return { order: await this.preorders.save(user.id, id, body.items ?? []) };
  }

  @Delete('reservations/:id/preorder')
  async cancelPreorder(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return { order: await this.preorders.cancel(user.id, id) };
  }

  @Get('me/venues/:id/preorder-menu')
  async preorderMenu(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return { menu: await this.preorders.menu(user.id, id) };
  }

  @Post('event-inquiries')
  async createInquiry(@CurrentUser() user: AuthUser, @Body({ schema: inquiryBody }) body: z.infer<typeof inquiryBody>) {
    return { inquiry: await this.requests.createInquiry(user.id, body) };
  }

  @Get('event-inquiries')
  async inquiries(@CurrentUser() user: AuthUser) {
    return { inquiries: await this.requests.inquiries(user.id) };
  }

  @Post('tables/:id/watch')
  async watch(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body({ schema: watchBody }) body: z.infer<typeof watchBody>) {
    return { watch: await this.requests.watchTable(user.id, body.venue_id, id) };
  }
}
