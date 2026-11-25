import { HttpStatus } from '@nestjs/common';

/**
 * A business error with the stable code clients see as {"error": "<code>"}.
 * Services throw these; the HTTP filter turns them into responses, same codes as the Go API.
 */
export class DomainError extends Error {
  constructor(
    readonly code: string,
    readonly status: HttpStatus,
    /** Extra fields merged into the body, e.g. a human message. */
    readonly extra?: Record<string, unknown>,
  ) {
    super(code);
    this.name = 'DomainError';
  }
}

export const badRequest = (code = 'bad_request', extra?: Record<string, unknown>) => new DomainError(code, HttpStatus.BAD_REQUEST, extra);
export const unauthorized = (code = 'auth_required') => new DomainError(code, HttpStatus.UNAUTHORIZED);
export const forbidden = (code = 'forbidden') => new DomainError(code, HttpStatus.FORBIDDEN);
export const notFound = (code = 'not_found') => new DomainError(code, HttpStatus.NOT_FOUND);
export const conflict = (code = 'conflict', extra?: Record<string, unknown>) => new DomainError(code, HttpStatus.CONFLICT, extra);
export const unavailable = (code: string) => new DomainError(code, HttpStatus.SERVICE_UNAVAILABLE);
