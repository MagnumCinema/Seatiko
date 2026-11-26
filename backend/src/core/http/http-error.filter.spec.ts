import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { ArgumentsHost } from '@nestjs/common';
import * as Sentry from '@sentry/nestjs';
import { conflict, unavailable } from '../errors/domain-error.js';
import { HttpErrorFilter } from './http-error.filter.js';

vi.mock('@sentry/nestjs', () => ({ captureException: vi.fn() }));

function run(exception: unknown) {
  const res = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() };
  const host = { switchToHttp: () => ({ getResponse: () => res }) } as unknown as ArgumentsHost;
  new HttpErrorFilter().catch(exception, host);
  return { status: res.status.mock.calls[0][0], body: res.json.mock.calls[0][0] };
}

describe('HttpErrorFilter', () => {
  beforeEach(() => vi.mocked(Sentry.captureException).mockClear());

  it('domain errors keep their code, status and extra fields', () => {
    expect(run(conflict('active_reservation_exists', { message: 'one booking at a time' }))).toEqual({
      status: 409,
      body: { error: 'active_reservation_exists', message: 'one booking at a time' },
    });
  });

  it('Nest HTTP errors become codes', () => {
    expect(run(new NotFoundException('Cannot GET /x'))).toEqual({ status: 404, body: { error: 'not_found' } });
    expect(run(new BadRequestException({ error: 'invalid_guests' }))).toEqual({ status: 400, body: { error: 'invalid_guests' } });
  });

  it('hides unexpected errors', () => {
    expect(run(new Error('db password is hunter2'))).toEqual({ status: 500, body: { error: 'internal_error' } });
  });

  it('reports only unexpected errors to Sentry', () => {
    run(conflict('active_reservation_exists'));
    run(unavailable('crm_unavailable'));
    run(new NotFoundException());
    run(new BadRequestException({ error: 'invalid_guests' }));
    expect(Sentry.captureException).not.toHaveBeenCalled();

    const boom = new Error('boom');
    run(boom);
    expect(Sentry.captureException).toHaveBeenCalledTimes(1);
    expect(vi.mocked(Sentry.captureException).mock.calls[0][0]).toBe(boom);
  });
});
