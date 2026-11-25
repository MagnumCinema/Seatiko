import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { ArgumentsHost } from '@nestjs/common';
import { conflict } from '../errors/domain-error.js';
import { HttpErrorFilter } from './http-error.filter.js';

function run(exception: unknown) {
  const res = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() };
  const host = { switchToHttp: () => ({ getResponse: () => res }) } as unknown as ArgumentsHost;
  new HttpErrorFilter().catch(exception, host);
  return { status: res.status.mock.calls[0][0], body: res.json.mock.calls[0][0] };
}

describe('HttpErrorFilter', () => {
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
});
