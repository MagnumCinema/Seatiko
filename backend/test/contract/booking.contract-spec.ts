import { api, chisinauDate, freeSlot, login, newGuest } from './client.js';

// Guest booking flow: reservations, preorder, table watch, waitlist, event requests.

async function book(venueId = 'venue-1') {
  const guest = await newGuest('book');
  const slot = await freeSlot(venueId);
  const res = await api('POST', '/api/v1/reservations', {
    token: guest.token,
    body: { venue_id: venueId, table_id: slot.table_id, guests: 2, reserved_for: slot.starts_at, notes: 'у окна' },
  });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return { guest, slot, reservation: res.body.reservation };
}

describe('reservations', () => {
  it('creates, lists, updates and cancels a booking', async () => {
    const { guest, slot, reservation } = await book();
    expect(reservation).toMatchObject({ venue_id: 'venue-1', table_id: slot.table_id, guests: 2, status: 'CONFIRMED', notes: 'у окна', user_id: guest.user.id });
    expect(new Date(reservation.reserved_for).getTime()).toBe(new Date(slot.starts_at).getTime());

    const list = await api('GET', '/api/v1/reservations', { token: guest.token });
    expect(list.status).toBe(200);
    expect(list.body.reservations.map((r: any) => r.id)).toContain(reservation.id);
    expect(list.body.reservations[0].venue_name.ru).toBe('La Plăcinte');

    const updated = await api('PATCH', `/api/v1/reservations/${reservation.id}`, { token: guest.token, body: { guests: 3, notes: 'день рождения' } });
    expect(updated.status).toBe(200);
    expect(updated.body.reservation).toMatchObject({ guests: 3, notes: 'день рождения' });

    const cancelled = await api('POST', `/api/v1/reservations/${reservation.id}/cancel`, { token: guest.token });
    expect(cancelled.status).toBe(200);
    expect(cancelled.body.reservation.status).toBe('CANCELLED');
    expect((await api('POST', `/api/v1/reservations/${reservation.id}/cancel`, { token: guest.token })).status).toBe(409);
  });

  it('refuses a second active booking and a busy table', async () => {
    const { guest, slot } = await book();
    const again = await api('POST', '/api/v1/reservations', {
      token: guest.token,
      body: { venue_id: 'venue-1', table_id: slot.table_id, guests: 2, reserved_for: slot.starts_at },
    });
    expect(again.status).toBe(409);
    expect(again.body.error).toBe('active_reservation_exists');

    const other = await newGuest('busy');
    const clash = await api('POST', '/api/v1/reservations', {
      token: other.token,
      body: { venue_id: 'venue-1', table_id: slot.table_id, guests: 2, reserved_for: slot.starts_at },
    });
    expect(clash.status).toBe(409);
    expect(clash.body.error).toBe('table_not_free');
  });

  it('confirm-arrival ("I am coming") with a late arrival', async () => {
    const { guest, reservation } = await book();
    const late = new Date(new Date(reservation.reserved_for).getTime() + 10 * 60_000).toISOString();
    const res = await api('POST', `/api/v1/reservations/${reservation.id}/confirm-arrival`, { token: guest.token, body: { expected_arrival: late } });
    expect(res.status).toBe(200);
    expect(res.body.reservation.status).toBe('CHECKED_IN');
    expect(res.body.reservation.arrival_confirmed_at).toEqual(expect.any(String));
  });

  it('history: delete one and clear all finished bookings', async () => {
    const { guest, reservation } = await book();
    await api('POST', `/api/v1/reservations/${reservation.id}/cancel`, { token: guest.token });
    const del = await api('DELETE', `/api/v1/reservations/${reservation.id}`, { token: guest.token });
    expect(del.status).toBe(200);
    expect(del.body).toEqual({ status: 'deleted' });
    const cleared = await api('DELETE', '/api/v1/reservations/history', { token: guest.token });
    expect(cleared.status).toBe(200);
    expect(cleared.body).toEqual({ cleared: expect.any(Number) });
  });

  it('other guests cannot touch my booking', async () => {
    const { reservation } = await book();
    const stranger = await newGuest('stranger');
    expect((await api('POST', `/api/v1/reservations/${reservation.id}/cancel`, { token: stranger.token })).status).toBe(403);
  });
});

describe('preorder', () => {
  it('menu for preorder blocks 18+ items until staff verify the guest', async () => {
    const { token } = await newGuest('pmenu');
    const res = await api('GET', '/api/v1/me/venues/venue-1/preorder-menu', { token });
    expect(res.status).toBe(200);
    const wine = res.body.menu.find((m: any) => m.id === 'm-v1-13');
    expect(wine).toMatchObject({ orderable: false, blocked_reason: 'age_verification_required' });
  });

  it('save, read, replace and cancel a preorder', async () => {
    const { guest, reservation } = await book();
    const saved = await api('PUT', `/api/v1/reservations/${reservation.id}/preorder`, {
      token: guest.token,
      body: { items: [{ menu_item_id: 'm1', qty: 2 }, { menu_item_id: 'm2', qty: 1 }] },
    });
    expect(saved.status).toBe(200);
    expect(saved.body.order).toMatchObject({ preorder: true, reservation_id: reservation.id, status: 'SUBMITTED', kitchen_at: expect.any(String) });
    expect(saved.body.order.items).toHaveLength(2);
    expect(saved.body.order.total).toBe(saved.body.order.items.reduce((s: number, i: any) => s + i.price * i.qty, 0));

    const wine = await api('PUT', `/api/v1/reservations/${reservation.id}/preorder`, { token: guest.token, body: { items: [{ menu_item_id: 'm-v1-13', qty: 1 }] } });
    expect(wine.status).toBe(403);
    expect(wine.body).toEqual({ error: 'age_verification_required' });
    const empty = await api('PUT', `/api/v1/reservations/${reservation.id}/preorder`, { token: guest.token, body: { items: [] } });
    expect(empty.status).toBe(400);

    const got = await api('GET', `/api/v1/reservations/${reservation.id}/preorder`, { token: guest.token });
    expect(got.status).toBe(200);
    expect(got.body.order.id).toBe(saved.body.order.id);

    const cancelled = await api('DELETE', `/api/v1/reservations/${reservation.id}/preorder`, { token: guest.token });
    expect(cancelled.status).toBe(200);
    expect(cancelled.body.order.status).toBe('CANCELLED');
    expect((await api('GET', `/api/v1/reservations/${reservation.id}/preorder`, { token: guest.token })).status).toBe(404);
  });
});

describe('table watch, waitlist and event requests', () => {
  it('POST /tables/{id}/watch', async () => {
    const { token } = await newGuest('watch');
    const res = await api('POST', '/api/v1/tables/t3/watch', { token, body: { venue_id: 'venue-1' } });
    expect(res.status).toBe(201);
    expect(res.body.watch).toMatchObject({ table_id: 't3' });
  });

  it('joins, lists and leaves the waitlist', async () => {
    const { token } = await newGuest('wait');
    const joined = await api('POST', '/api/v1/waitlist', { token, body: { venue_id: 'venue-1', guest_name: 'Ion', phone: '+37369000000', guests: 2 } });
    expect(joined.status).toBe(201);
    expect(joined.body.entry).toMatchObject({ venue_id: 'venue-1', guests: 2, status: 'WAITING' });
    const mine = await api('GET', '/api/v1/waitlist', { token });
    expect(mine.status).toBe(200);
    expect(mine.body.waitlist.map((e: any) => e.id)).toContain(joined.body.entry.id);
    const left = await api('DELETE', `/api/v1/waitlist/${joined.body.entry.id}`, { token });
    expect(left.status).toBe(200);
    expect(left.body.entry.status).toBe('LEFT');
  });

  it('creates and lists event requests (banquets)', async () => {
    const { token } = await newGuest('event');
    const created = await api('POST', '/api/v1/event-inquiries', {
      token,
      body: {
        venue_id: 'venue-1', event_type: 'birthday', guest_count: 20, preferred_date: `${chisinauDate(10)}T18:00:00Z`,
        contact_method: 'phone', contact_phone: '+37369000000', contact_name: 'Ion',
      },
    });
    expect(created.status).toBe(201);
    expect(created.body.inquiry).toMatchObject({ venue_id: 'venue-1', guest_count: 20, status: 'PENDING' });
    const list = await api('GET', '/api/v1/event-inquiries', { token });
    expect(list.status).toBe(200);
    expect(list.body.inquiries.map((i: any) => i.id)).toContain(created.body.inquiry.id);
  });
});

describe('demo guest', () => {
  it('has seeded bookings', async () => {
    const token = await login('guest@seatiko.local', 'guest123');
    const res = await api('GET', '/api/v1/reservations', { token });
    expect(res.body.reservations.length).toBeGreaterThan(0);
  });
});
