import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Put, Req } from '@nestjs/common';
import type { Request } from 'express';
import { z } from 'zod';
import { type AuthUser, CurrentUser, Roles } from '../../core/auth/auth.decorators.js';
import { AccountsService } from '../accounts/accounts.service.js';
import { VenueAdminService } from './venue-admin.service.js';

const text = z.object({ ru: z.string().default(''), en: z.string().default(''), ro: z.string().default('') });
const emptyText = { ru: '', en: '', ro: '' };
const tablesBody = z.object({
  tables: z.array(z.object({ number: z.number().int(), seats: z.number().int(), x: z.number().default(0), y: z.number().default(0), zone: z.string().optional() })),
});
const menuBody = z.object({
  id: z.string().optional(),
  category: text.default(emptyText),
  name: text.default(emptyText),
  description: text.default(emptyText),
  ingredients: text.optional(),
  allergens: z.array(z.string()).optional(),
  price: z.number().int().default(0),
  weight_g: z.number().int().optional(),
  volume_ml: z.number().int().optional(),
  image_url: z.string().optional(),
  contains_alcohol: z.boolean().optional(),
  requires_age_18: z.boolean().optional(),
  tags: z.array(z.string()).optional(),
  stopped: z.boolean().optional(),
});
const rulesBody = z.object({
  booking_interval_min: z.number().int().optional(),
  hold_minutes: z.number().int().optional(),
  allow_preorder: z.boolean().optional(),
  preorder_lead_min: z.number().int().optional(),
  session_start_before_min: z.number().int().optional(),
  release_before_min: z.number().int().optional(),
  max_late_arrival_min: z.number().int().optional(),
  visit_duration_min: z.number().int().optional(),
  max_visit_duration_min: z.number().int().optional(),
});
const stopBody = z.object({ stopped: z.boolean().optional() });

/** The owner's venue cabinet (roles restaurant, admin). */
@Roles('restaurant', 'admin')
@Controller('api/v1/restaurant')
export class VenueAdminController {
  constructor(
    private readonly venues: VenueAdminService,
    private readonly accounts: AccountsService,
  ) {}

  @Get('reservations')
  async reservations(@CurrentUser() user: AuthUser) {
    const me = await this.accounts.user(user.id);
    return { reservations: await this.venues.reservations(user.id, me.role) };
  }

  @Put('venues/:venueId/tables')
  async tables(@CurrentUser() user: AuthUser, @Param('venueId') id: string, @Body({ schema: tablesBody }) body: z.infer<typeof tablesBody>) {
    return { tables: await this.venues.replaceTables(user.id, id, body.tables) };
  }

  @Get('venues/:venueId/qr')
  async qr(@CurrentUser() user: AuthUser, @Param('venueId') id: string) {
    return { tables: await this.venues.qr(user.id, id) };
  }

  @Post('venues/:venueId/qr/regenerate')
  @HttpCode(200)
  async regenerate(@CurrentUser() user: AuthUser, @Param('venueId') id: string) {
    return { tables: await this.venues.regenerateQr(user.id, id) };
  }

  @Get('venues/:venueId/menu')
  async menu(@CurrentUser() user: AuthUser, @Param('venueId') id: string) {
    return { menu: await this.venues.menu(user.id, id) };
  }

  @Post('venues/:venueId/menu')
  @HttpCode(200)
  async create(@CurrentUser() user: AuthUser, @Param('venueId') id: string, @Body({ schema: menuBody }) body: z.infer<typeof menuBody>) {
    return { item: await this.venues.saveMenuItem(user.id, id, body) };
  }

  @Patch('venues/:venueId/menu/:itemId')
  async update(
    @CurrentUser() user: AuthUser,
    @Param('venueId') id: string,
    @Param('itemId') itemId: string,
    @Body({ schema: menuBody }) body: z.infer<typeof menuBody>,
  ) {
    return { item: await this.venues.saveMenuItem(user.id, id, { ...body, id: itemId }) };
  }

  @Delete('venues/:venueId/menu/:itemId')
  remove(@CurrentUser() user: AuthUser, @Param('venueId') id: string, @Param('itemId') itemId: string) {
    return this.venues.deleteMenuItem(user.id, id, itemId);
  }

  /** Body optional: {stopped: false} brings a dish back; default stops it. */
  @Post('venues/:venueId/menu/:itemId/stop')
  @HttpCode(200)
  async stop(@CurrentUser() user: AuthUser, @Param('venueId') id: string, @Param('itemId') itemId: string, @Req() req: Request) {
    const body = stopBody.safeParse(req.body ?? {});
    return { item: await this.venues.setStopped(user.id, id, itemId, body.success ? (body.data.stopped ?? true) : true) };
  }

  @Patch('venues/:venueId/booking-rules')
  async rules(@CurrentUser() user: AuthUser, @Param('venueId') id: string, @Body({ schema: rulesBody }) body: z.infer<typeof rulesBody>) {
    return { venue: await this.venues.updateRules(user.id, id, body) };
  }

  @Get('venues/:venueId/analytics')
  async analytics(@CurrentUser() user: AuthUser, @Param('venueId') id: string) {
    return { analytics: await this.venues.analytics(user.id, id) };
  }
}
