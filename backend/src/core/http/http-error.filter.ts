import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import * as Sentry from '@sentry/nestjs';
import type { Response } from 'express';
import { DomainError } from '../errors/domain-error.js';

/** Error code for Nest's own HTTP exceptions (unknown route, wrong method, body too large…). */
const STATUS_CODES: Partial<Record<number, string>> = {
  [HttpStatus.BAD_REQUEST]: 'invalid_body',
  [HttpStatus.UNAUTHORIZED]: 'auth_required',
  [HttpStatus.FORBIDDEN]: 'forbidden',
  [HttpStatus.NOT_FOUND]: 'not_found',
  [HttpStatus.PAYLOAD_TOO_LARGE]: 'payload_too_large',
  [HttpStatus.TOO_MANY_REQUESTS]: 'rate_limited',
};

/**
 * Every error leaves the API as {"error": "<code>"} with the HTTP status of the Go API.
 * Unexpected errors are logged, reported to Sentry (when SENTRY_DSN is set) and answered with
 * 500 internal_error, without details. Domain errors and Nest's HTTP exceptions are expected
 * outcomes (4xx, 503 states) and are not reported.
 */
@Catch()
export class HttpErrorFilter implements ExceptionFilter {
  private readonly logger = new Logger('HttpError');

  catch(exception: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();
    if (exception instanceof DomainError) {
      res.status(exception.status).json({ error: exception.code, ...exception.extra });
      return;
    }
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      const code =
        typeof body === 'object' && body !== null && typeof (body as { error?: unknown }).error === 'string' && /^[a-z0-9_]+$/.test((body as { error: string }).error)
          ? (body as { error: string }).error
          : (STATUS_CODES[status] ?? 'error');
      res.status(status).json({ error: code });
      return;
    }
    this.logger.error(exception instanceof Error ? (exception.stack ?? exception.message) : String(exception));
    Sentry.captureException(exception, { mechanism: { handled: false, type: 'auto.function.nestjs.exception_captured' } });
    res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ error: 'internal_error' });
  }
}
