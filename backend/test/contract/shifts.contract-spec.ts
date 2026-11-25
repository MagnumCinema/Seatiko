import { api, chisinauDate, newGuest, newOwner, publishedVenue } from './client.js';

// Staff schedule (shifts) and team management in the restaurant cabinet.

let venue: Awaited<ReturnType<typeof publishedVenue>>;
let waiterA: Awaited<ReturnType<typeof newGuest>>;
let waiterB: Awaited<ReturnType<typeof newGuest>>;
let memberA: any;
let memberB: any;

beforeAll(async () => {
  venue = await publishedVenue();
  waiterA = await newGuest('shift-a');
  waiterB = await newGuest('shift-b');
  memberA = (await api('POST', `/api/v1/restaurant/venues/${venue.venueId}/staff/invite`, { token: venue.ownerToken, body: { email: waiterA.email } })).body.staff;
  memberB = (await api('POST', `/api/v1/restaurant/venues/${venue.venueId}/staff/invite`, { token: venue.ownerToken, body: { email: waiterB.email } })).body.staff;
});

describe('team', () => {
  it('toggles "on shift" for a staff member', async () => {
    const on = await api('POST', `/api/v1/restaurant/venues/${venue.venueId}/staff/${memberA.id}/shift`, { token: venue.ownerToken, body: { on_shift: true } });
    expect(on.status).toBe(200);
    expect(on.body.staff).toMatchObject({ id: memberA.id, on_shift: true });
    const off = await api('POST', `/api/v1/restaurant/venues/${venue.venueId}/staff/${memberA.id}/shift`, { token: venue.ownerToken, body: { on_shift: false } });
    expect(off.body.staff.on_shift).toBe(false);
  });
});

describe('shifts', () => {
  it('creates, lists, rejects overlaps, batches and copies a week', async () => {
    const day = chisinauDate(2);
    const created = await api('POST', `/api/v1/restaurant/venues/${venue.venueId}/shifts`, {
      token: venue.ownerToken,
      body: { staff_id: memberA.id, date: day, start_time: '10:00', end_time: '18:00', note: 'утро' },
    });
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    expect(created.body.shift).toMatchObject({ venue_id: venue.venueId, staff_id: memberA.id, date: day, start_time: '10:00', end_time: '18:00', status: 'PENDING', role: 'waiter' });

    const overlap = await api('POST', `/api/v1/restaurant/venues/${venue.venueId}/shifts`, {
      token: venue.ownerToken,
      body: { staff_id: memberA.id, date: day, start_time: '12:00', end_time: '20:00' },
    });
    expect(overlap.status).toBe(409);
    const bad = await api('POST', `/api/v1/restaurant/venues/${venue.venueId}/shifts`, {
      token: venue.ownerToken,
      // Go only checks presence; Nest also validates YYYY-MM-DD / HH:MM (see PLAN, fixed gaps).
      body: { staff_id: memberA.id, date: '', start_time: '10:00', end_time: '18:00' },
    });
    expect(bad.status).toBe(400);

    const batch = await api('POST', `/api/v1/restaurant/venues/${venue.venueId}/shifts/batch`, {
      token: venue.ownerToken,
      body: { staff_ids: [memberA.id, memberB.id], dates: [chisinauDate(3), chisinauDate(4)], start_time: '09:00', end_time: '15:00' },
    });
    expect(batch.status, JSON.stringify(batch.body)).toBe(201);
    expect(batch.body.shifts).toHaveLength(4);

    const list = await api('GET', `/api/v1/restaurant/venues/${venue.venueId}/shifts`, { token: venue.ownerToken });
    expect(list.status).toBe(200);
    expect(list.body.shifts.length).toBeGreaterThanOrEqual(5);
    const waiters = await api('GET', `/api/v1/restaurant/venues/${venue.venueId}/shifts`, { token: venue.ownerToken, query: { role: 'waiter' } });
    expect(waiters.body.shifts.every((s: any) => s.role === 'waiter')).toBe(true);

    const copied = await api('POST', `/api/v1/restaurant/venues/${venue.venueId}/shifts/copy-week`, {
      token: venue.ownerToken,
      body: { source_start_date: chisinauDate(2), target_start_date: chisinauDate(9) },
    });
    expect(copied.status, JSON.stringify(copied.body)).toBe(201);
    expect(copied.body).toMatchObject({ created_count: expect.any(Number), skipped_count: expect.any(Number) });
    expect(copied.body.created_count).toBe(copied.body.shifts.length);
  });

  it('swaps a shift, the new waiter confirms it, owner deletes it', async () => {
    const created = await api('POST', `/api/v1/restaurant/venues/${venue.venueId}/shifts`, {
      token: venue.ownerToken,
      body: { staff_id: memberA.id, date: chisinauDate(20), start_time: '18:00', end_time: '23:00' },
    });
    const shift = created.body.shift;
    const swapped = await api('POST', `/api/v1/restaurant/venues/${venue.venueId}/shifts/${shift.id}/swap`, { token: venue.ownerToken, body: { new_staff_id: memberB.id } });
    expect(swapped.status, JSON.stringify(swapped.body)).toBe(200);
    expect(swapped.body.shift.staff_id).toBe(memberB.id);

    const mine = await api('GET', '/api/v1/staff/shifts', { token: waiterB.token });
    expect(mine.status, JSON.stringify(mine.body)).toBe(200);
    expect(mine.body.shifts.map((s: any) => s.id)).toContain(shift.id);
    const invalid = await api('POST', `/api/v1/staff/shifts/${shift.id}/respond`, { token: waiterB.token, body: { status: 'MAYBE' } });
    expect(invalid.status).toBe(400);
    const confirmed = await api('POST', `/api/v1/staff/shifts/${shift.id}/respond`, { token: waiterB.token, body: { status: 'CONFIRMED' } });
    expect(confirmed.status, JSON.stringify(confirmed.body)).toBe(200);
    expect(confirmed.body.shift.status).toBe('CONFIRMED');
    const notMine = await api('POST', `/api/v1/staff/shifts/${shift.id}/respond`, { token: waiterA.token, body: { status: 'DECLINED' } });
    expect(notMine.status).toBe(403);

    const deleted = await api('DELETE', `/api/v1/restaurant/venues/${venue.venueId}/shifts/${shift.id}`, { token: venue.ownerToken });
    expect(deleted.status).toBe(200);
    expect(deleted.body).toEqual({ ok: true });
  });

  it('removes a staff member', async () => {
    const extra = await newGuest('shift-c');
    const member = (await api('POST', `/api/v1/restaurant/venues/${venue.venueId}/staff/invite`, { token: venue.ownerToken, body: { email: extra.email } })).body.staff;
    const removed = await api('DELETE', `/api/v1/restaurant/venues/${venue.venueId}/staff/${member.id}`, { token: venue.ownerToken });
    expect(removed.status).toBe(200);
    expect(removed.body).toEqual({ ok: true });
    const team = await api('GET', `/api/v1/restaurant/venues/${venue.venueId}/staff`, { token: venue.ownerToken });
    expect(team.body.staff.map((m: any) => m.id)).not.toContain(member.id);
  });
});

describe('application deletion', () => {
  it('owner deletes a draft application; strangers cannot', async () => {
    const owner = await newOwner();
    const app = (await api('POST', '/api/v1/restaurant/applications', { token: owner.token })).body.application;
    const stranger = await newOwner();
    expect((await api('DELETE', `/api/v1/restaurant/applications/${app.id}`, { token: stranger.token })).status).toBe(403);
    const deleted = await api('DELETE', `/api/v1/restaurant/applications/${app.id}`, { token: owner.token });
    expect(deleted.status).toBe(200);
    expect(deleted.body).toEqual({ ok: true });
    expect((await api('GET', `/api/v1/restaurant/applications/${app.id}`, { token: owner.token })).status).toBe(404);
  });
});
