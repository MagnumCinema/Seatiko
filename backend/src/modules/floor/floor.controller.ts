import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import { z } from 'zod';
import { type AuthUser, CurrentUser } from '../../core/auth/auth.decorators.js';
import { badRequest } from '../../core/errors/domain-error.js';
import { FloorService } from './floor.service.js';

const scanBody = z.object({ venue_id: z.string().min(1), table_id: z.string().min(1), token: z.string().optional() });
const orderBody = z.object({ items: z.array(z.object({ menu_item_id: z.string(), qty: z.number().int() })).min(1) });
const payBody = z.object({ order_id: z.string().optional(), method: z.string().optional() });
const callBody = z.object({ reason: z.string().min(1) });

/** The guest at the table: QR session, orders, waiter calls, payment. */
@Controller('api/v1')
export class FloorController {
  constructor(private readonly floor: FloorService) {}

  @Post('sessions/qr')
  async scan(@CurrentUser() user: AuthUser, @Body({ schema: scanBody }) body: z.infer<typeof scanBody>) {
    return { session: await this.floor.scanQr(user.id, body.venue_id, body.table_id, body.token ?? '') };
  }

  @Get('sessions/:id')
  async session(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return { session: await this.floor.session(user.id, id) };
  }

  @Post('sessions/:id/close')
  @HttpCode(200)
  async close(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return { session: await this.floor.closeSession(user.id, id) };
  }

  @Post('sessions/:id/orders')
  async order(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body({ schema: orderBody }) body: z.infer<typeof orderBody>) {
    return { order: await this.floor.createOrder(user.id, id, body.items) };
  }

  @Post('sessions/:id/waiter-calls')
  async callWaiter(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body({ schema: callBody }) body: z.infer<typeof callBody>) {
    return { waiter_call: await this.floor.callWaiter(user.id, id, body.reason) };
  }

  @Get('orders')
  async orders(@CurrentUser() user: AuthUser) {
    return { orders: await this.floor.myOrders(user.id) };
  }

  @Get('orders/:id')
  async getOrder(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return { order: await this.floor.order(user.id, id) };
  }

  @Post('payments')
  @HttpCode(200)
  pay(@CurrentUser() user: AuthUser, @Body({ schema: payBody }) body: z.infer<typeof payBody>) {
    if (!body.order_id?.trim()) throw badRequest('invalid_body');
    return this.floor.pay(user.id, body.order_id, body.method ?? '');
  }
}
