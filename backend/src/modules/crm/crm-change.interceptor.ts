import { type CallHandler, type ExecutionContext, Injectable, type NestInterceptor } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { Request } from 'express';
import { type Observable, tap } from 'rxjs';
import { SEATIKO_CHANGED } from './crm.service.js';

/** Requests that change nothing the CRM mirrors. */
const IGNORED = [/^\/api\/v1\/discover\//, /^\/api\/v1\/me\/notifications\//, /^\/api\/v1\/integrations\//, /^\/api\/v1\/auth\/login$/, /^\/internal\//];

/**
 * After a successful POST / PUT / PATCH / DELETE, tells the CRM sync that Seatiko
 * changed (the sync batches these and runs within seconds). Keeps modules unaware of the CRM.
 */
@Injectable()
export class CrmChangeInterceptor implements NestInterceptor {
  constructor(private readonly events: EventEmitter2) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = ctx.switchToHttp().getRequest<Request>();
    const mutating = req.method !== 'GET' && req.method !== 'HEAD' && req.method !== 'OPTIONS';
    if (!mutating || IGNORED.some((re) => re.test(req.path))) return next.handle();
    return next.handle().pipe(tap(() => this.events.emit(SEATIKO_CHANGED)));
  }
}
