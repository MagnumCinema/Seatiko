import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { z } from 'zod';
import { type AuthUser, CurrentUser, Roles } from '../../core/auth/auth.decorators.js';
import { badRequest, forbidden } from '../../core/errors/domain-error.js';
import { AdultService } from '../adult/adult.service.js';
import { ReservationsService } from '../reservations/reservations.service.js';
import { VenueAccessService } from '../venue-access/venue-access.service.js';
import { FloorService } from './floor.service.js';

const statusBody = z.object({ status: z.string().min(1), venue_id: z.string().optional() });
const ageCheckBody = z.object({ id_document_checked: z.boolean().optional(), approved: z.boolean().optional() });
const grantBody = z.object({ id_document_checked: z.boolean().optional(), id_document_type: z.string().optional() });
const revokeBody = z.object({ reason: z.string().optional() });

/** The venue panel of waiters, hosts and owners (roles staff, restaurant, admin). */
@Roles('staff', 'restaurant', 'admin')
@Controller('api/v1/staff')
export class StaffFloorController {
  constructor(
    private readonly floor: FloorService,
    private readonly reservations: ReservationsService,
    private readonly adult: AdultService,
    private readonly access: VenueAccessService,
  ) {}

  @Get('waiter-calls')
  async calls(@CurrentUser() user: AuthUser, @Query('venue_id') venueId?: string) {
    await this.access.requireStaff(user.id, venueId);
    return { waiter_calls: await this.floor.calls(venueId!) };
  }

  @Post('waiter-calls/:id/accept')
  @HttpCode(200)
  async accept(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    await this.access.requireStaff(user.id, (await this.floor.call(id)).venueId);
    return { waiter_call: await this.floor.acceptCall(id) };
  }

  @Post('waiter-calls/:id/complete')
  @HttpCode(200)
  async complete(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    await this.access.requireStaff(user.id, (await this.floor.call(id)).venueId);
    return { waiter_call: await this.floor.completeCall(id) };
  }

  @Get('orders')
  async orders(@CurrentUser() user: AuthUser, @Query('venue_id') venueId?: string) {
    await this.access.requireStaff(user.id, venueId);
    return { orders: await this.floor.venueOrders(venueId!) };
  }

  @Patch('orders/:id')
  async setStatus(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Query('venue_id') queryVenue: string | undefined,
    @Body({ schema: statusBody }) body: z.infer<typeof statusBody>,
  ) {
    const order = await this.floor.orderRecord(id);
    const venueId = body.venue_id || queryVenue || order.venueId;
    await this.access.requireStaff(user.id, venueId);
    if (order.venueId !== venueId) throw forbidden();
    return { order: await this.floor.setOrderStatus(id, body.status) };
  }

  /** In-person ID check before serving the 18+ lines of a preorder. */
  @Post('orders/:id/age-check')
  @HttpCode(200)
  async ageCheck(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body({ schema: ageCheckBody }) body: z.infer<typeof ageCheckBody>) {
    return { order: await this.adult.ageCheck(user.id, id, body.id_document_checked ?? false, body.approved ?? false) };
  }

  @Get('reservations')
  async venueReservations(@CurrentUser() user: AuthUser, @Query('venue_id') venueId?: string) {
    await this.access.requireStaff(user.id, venueId);
    return { reservations: await this.reservations.forVenue(venueId!) };
  }

  /** Staff confirm the checked-in guest is 18+ after seeing an ID. */
  @Post('reservations/:id/adult-verification')
  @HttpCode(200)
  grant(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body({ schema: grantBody }) body: z.infer<typeof grantBody>) {
    return this.adult.grant(user.id, id, body.id_document_checked ?? false, body.id_document_type ?? '');
  }

  /** The owner or an admin withdraws 18+ preorders. Body optional. */
  @Post('venues/:venueId/guests/:userId/adult-verification/revoke')
  @HttpCode(200)
  revoke(@CurrentUser() user: AuthUser, @Param('venueId') venueId: string, @Param('userId') guestId: string, @Req() req: Request) {
    const hasBody = Number(req.headers['content-length'] ?? 0) > 0;
    const body = revokeBody.safeParse(hasBody ? req.body : {});
    if (!body.success) throw badRequest('invalid_body');
    return this.adult.revoke(user.id, venueId, guestId, body.data.reason ?? '');
  }
}
