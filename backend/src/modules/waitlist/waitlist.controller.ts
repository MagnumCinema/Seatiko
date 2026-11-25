import { Body, Controller, Delete, Get, HttpCode, Param, Post, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { z } from 'zod';
import { type AuthUser, CurrentUser, Roles } from '../../core/auth/auth.decorators.js';
import { WaitlistService } from './waitlist.service.js';

const entryBody = z.object({
  venue_id: z.string().optional(),
  guest_name: z.string().optional(),
  phone: z.string().optional(),
  guests: z.number().int().optional(),
  zone: z.string().optional(),
  note: z.string().optional(),
  source: z.string().optional(),
});
const tableBody = z.object({ table_id: z.string().optional() });
const closeBody = z.object({ status: z.string().optional() });

/** Optional JSON body; a bad one is ignored as in Go (`_ = c.ShouldBindJSON`). */
function loose<T extends z.ZodType>(schema: T, req: Request): z.infer<T> | Record<string, never> {
  const parsed = schema.safeParse(req.body ?? {});
  return parsed.success ? parsed.data : {};
}

@Controller('api/v1')
export class WaitlistController {
  constructor(private readonly waitlist: WaitlistService) {}

  @Post('waitlist')
  async join(@CurrentUser() user: AuthUser, @Body({ schema: entryBody }) body: z.infer<typeof entryBody>) {
    return { entry: await this.waitlist.join(user.id, body) };
  }

  @Get('waitlist')
  async mine(@CurrentUser() user: AuthUser) {
    return { waitlist: await this.waitlist.mine(user.id) };
  }

  @Delete('waitlist/:id')
  async leave(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return { entry: await this.waitlist.leave(user.id, id) };
  }

  @Roles('staff', 'restaurant', 'admin')
  @Get('staff/waitlist')
  async venue(@CurrentUser() user: AuthUser, @Query('venue_id') venueId?: string) {
    return { waitlist: await this.waitlist.forVenue(await this.waitlist.gate(user.id, venueId)) };
  }

  /** A walk-in registered at the host stand. */
  @Roles('staff', 'restaurant', 'admin')
  @Post('staff/waitlist')
  async add(@CurrentUser() user: AuthUser, @Body({ schema: entryBody }) body: z.infer<typeof entryBody>) {
    await this.waitlist.gate(user.id, body.venue_id);
    return { entry: await this.waitlist.join('', { ...body, source: 'HOST' }) };
  }

  @Roles('staff', 'restaurant', 'admin')
  @Post('staff/waitlist/:id/notify')
  @HttpCode(200)
  async notify(@CurrentUser() user: AuthUser, @Param('id') id: string, @Req() req: Request) {
    const body = loose(tableBody, req);
    await this.waitlist.gateEntry(user.id, id);
    return { entry: await this.waitlist.notify(id, body.table_id) };
  }

  @Roles('staff', 'restaurant', 'admin')
  @Post('staff/waitlist/:id/seat')
  @HttpCode(200)
  async seat(@CurrentUser() user: AuthUser, @Param('id') id: string, @Req() req: Request) {
    const body = loose(tableBody, req);
    await this.waitlist.gateEntry(user.id, id);
    return { entry: await this.waitlist.seat(id, body.table_id) };
  }

  @Roles('staff', 'restaurant', 'admin')
  @Post('staff/waitlist/:id/close')
  @HttpCode(200)
  async close(@CurrentUser() user: AuthUser, @Param('id') id: string, @Req() req: Request) {
    const body = loose(closeBody, req);
    await this.waitlist.gateEntry(user.id, id);
    return { entry: await this.waitlist.close(id, body.status || 'LEFT') };
  }
}
