import { Controller, Get, HttpCode, Post, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { Public } from '../../core/auth/auth.decorators.js';
import { CrmService } from './crm.service.js';

/** Twenty integration endpoints the CRM itself calls (no Seatiko token; the webhook is signed). */
@Public()
@Controller('api/v1/integrations/twenty')
export class CrmController {
  constructor(private readonly crm: CrmService) {}

  @Get('status')
  status(@Res({ passthrough: true }) res: Response) {
    const s = this.crm.status();
    if (!this.crm.enabled) {
      res.status(503);
      return { enabled: false, healthy: false };
    }
    return {
      enabled: s.enabled,
      healthy: s.healthy,
      running: s.running,
      last_success_at: s.last_success_at ?? null,
      webhook_configured: s.webhook_configured,
      last_webhook_at: s.last_webhook_at ?? null,
    };
  }

  /** Signature over the raw body: X-Twenty-Webhook-Signature / -Timestamp. */
  @Post('webhook')
  @HttpCode(200)
  async webhook(@Req() req: Request & { rawBody?: Buffer }, @Res({ passthrough: true }) res: Response) {
    if (!this.crm.enabled) {
      res.status(503);
      return { error: 'crm_disabled' };
    }
    const raw = req.rawBody ?? Buffer.from(JSON.stringify(req.body ?? {}));
    if (raw.length > 2 << 20) {
      res.status(400);
      return { error: 'invalid_body' };
    }
    const result = await this.crm.webhook(raw, String(req.headers['x-twenty-webhook-signature'] ?? ''), String(req.headers['x-twenty-webhook-timestamp'] ?? '')).catch((error: unknown) => {
      throw error;
    });
    if (!result.ok) {
      res.status(401);
      return { error: 'invalid_webhook' };
    }
    return { accepted: true, applied: result.applied };
  }
}
