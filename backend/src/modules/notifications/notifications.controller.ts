import { Body, Controller, Get, HttpCode, Post, Query, Req, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { type AuthUser, CurrentUser } from '../../core/auth/auth.decorators.js';
import { badRequest } from '../../core/errors/domain-error.js';
import type { Env } from '../../config/env.schema.js';
import { NotificationsService } from './notifications.service.js';

/** Keeps proxies from closing an idle stream. */
const HEARTBEAT_MS = 25_000;
const markReadBody = z.object({ ids: z.array(z.string()).optional() }).optional();

@Controller('api/v1/me/notifications')
export class NotificationsController {
  private readonly maxStreamMs: number;

  constructor(
    private readonly notifications: NotificationsService,
    config: ConfigService<Env, true>,
  ) {
    this.maxStreamMs = config.get('SSE_MAX_STREAM_SECONDS', { infer: true }) * 1000;
  }

  /** ?unread=1&limit=50 */
  @Get()
  list(@CurrentUser() user: AuthUser, @Query('unread') unread?: string, @Query('limit') limit?: string) {
    return this.notifications.list(user.id, unread === '1', Number.parseInt(limit ?? '', 10) || 0);
  }

  /** With ids, or no body for all. */
  @Post('read')
  @HttpCode(200)
  markRead(@CurrentUser() user: AuthUser, @Req() req: Request, @Body() body: unknown) {
    const hasBody = Number(req.headers['content-length'] ?? 0) > 0;
    const parsed = markReadBody.safeParse(hasBody ? body : undefined);
    if (!parsed.success) throw badRequest('invalid_body');
    return this.notifications.markRead(user.id, parsed.data?.ids ?? []);
  }

  /**
   * Server-Sent Events: `ready` with the unread count, then one `notification` per new message.
   * Ends after SSE_MAX_STREAM_SECONDS when set (serverless); the client reconnects.
   */
  @Get('stream')
  async stream(@CurrentUser() user: AuthUser, @Req() req: Request, @Res() res: Response): Promise<void> {
    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // nginx: do not buffer the stream
    res.flushHeaders();

    const unread = await this.notifications.unreadCount(user.id);
    res.write(`event: ready\ndata: {"unread":${unread}}\n\n`);
    const sub = this.notifications.stream(user.id).subscribe((n) => {
      res.write(`id: ${n.id}\nevent: notification\ndata: ${JSON.stringify(n)}\n\n`);
    });
    const beat = setInterval(() => res.write(': ping\n\n'), HEARTBEAT_MS);
    let expire: NodeJS.Timeout | undefined;
    let closed = false;
    const close = () => {
      if (closed) return;
      closed = true;
      clearInterval(beat);
      clearTimeout(expire);
      sub.unsubscribe();
      res.end();
    };
    if (this.maxStreamMs > 0) expire = setTimeout(close, this.maxStreamMs);
    req.on('close', close);
  }
}
