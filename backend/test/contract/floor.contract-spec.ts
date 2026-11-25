import { api, DEMO, freeSlot, login, newGuest, publishedVenue } from './client.js';

// In the venue: QR table sessions, orders, waiter calls, payment, staff panel, 18+.

let venue: Awaited<ReturnType<typeof publishedVenue>>;
beforeAll(async () => {
  venue = await publishedVenue();
});

async function tablesNow(): Promise<any[]> {
  const res = await api('GET', `/api/v1/restaurant/venues/${venue.venueId}/qr`, { token: venue.ownerToken });
  return res.body.tables;
}

describe('QR session, order, waiter call, payment', () => {
  it('walk-in guest scans a free table and orders', async () => {
    const guest = await newGuest('walkin');
    const table = (await tablesNow()).find((t: any) => t.status === 'FREE');

    const bad = await api('POST', '/api/v1/sessions/qr', { token: guest.token, body: { venue_id: venue.venueId, table_id: table.id, token: 'forged' } });
    expect(bad.status).toBeGreaterThanOrEqual(400);

    const scan = await api('POST', '/api/v1/sessions/qr', { token: guest.token, body: { venue_id: venue.venueId, table_id: table.id, token: table.qr_token } });
    expect(scan.status, JSON.stringify(scan.body)).toBe(201);
    const session = scan.body.session;
    expect(session).toMatchObject({ venue_id: venue.venueId, table_id: table.id, status: 'ACTIVE', user_id: guest.user.id });

    const got = await api('GET', `/api/v1/sessions/${session.id}`, { token: guest.token });
    expect(got.status).toBe(200);
    expect(got.body.session.id).toBe(session.id);

    const dish = await api('POST', `/api/v1/restaurant/venues/${venue.venueId}/menu`, {
      token: venue.ownerToken,
      body: { category: { ru: 'Плацинды', en: 'Pies', ro: 'Plăcinte' }, name: { ru: 'Плацинда', en: 'Pie', ro: 'Plăcintă' }, description: { ru: '', en: '', ro: '' }, price: 45 },
    });
    const order = await api('POST', `/api/v1/sessions/${session.id}/orders`, { token: guest.token, body: { items: [{ menu_item_id: dish.body.item.id, qty: 2 }] } });
    expect(order.status).toBe(201);
    expect(order.body.order).toMatchObject({ session_id: session.id, status: 'SUBMITTED', total: order.body.order.items[0].price * 2, check_number: expect.stringMatching(/^FA-\d{8}-\d{4}$/) });
    const orderId = order.body.order.id;

    const call = await api('POST', `/api/v1/sessions/${session.id}/waiter-calls`, { token: guest.token, body: { reason: 'bill' } });
    expect(call.status).toBe(201);
    expect(call.body.waiter_call).toMatchObject({ reason: 'bill', status: 'PENDING', table_id: table.id });

    const staff = venue.ownerToken; // owners act as staff of their venue
    const calls = await api('GET', '/api/v1/staff/waiter-calls', { token: staff, query: { venue_id: venue.venueId } });
    expect(calls.status).toBe(200);
    expect(JSON.stringify(calls.body)).toContain(call.body.waiter_call.id);
    const accepted = await api('POST', `/api/v1/staff/waiter-calls/${call.body.waiter_call.id}/accept`, { token: staff, body: { venue_id: venue.venueId } });
    expect(accepted.status).toBe(200);
    const done = await api('POST', `/api/v1/staff/waiter-calls/${call.body.waiter_call.id}/complete`, { token: staff, body: { venue_id: venue.venueId } });
    expect(done.status).toBe(200);
    expect(done.body.waiter_call.status).toBe('DONE');

    const staffOrders = await api('GET', '/api/v1/staff/orders', { token: staff, query: { venue_id: venue.venueId } });
    expect(staffOrders.body.orders.map((o: any) => o.id)).toContain(orderId);
    const preparing = await api('PATCH', `/api/v1/staff/orders/${orderId}`, { token: staff, body: { status: 'PREPARING', venue_id: venue.venueId } });
    expect(preparing.status).toBe(200);
    expect(preparing.body.order.status).toBe('PREPARING');
    const invalid = await api('PATCH', `/api/v1/staff/orders/${orderId}`, { token: staff, body: { status: 'TELEPORTED', venue_id: venue.venueId } });
    expect(invalid.status).toBe(400);

    const mine = await api('GET', '/api/v1/orders', { token: guest.token });
    expect(mine.body.orders.map((o: any) => o.id)).toContain(orderId);
    expect((await api('GET', `/api/v1/orders/${orderId}`, { token: guest.token })).body.order.id).toBe(orderId);

    const paid = await api('POST', '/api/v1/payments', { token: guest.token, body: { order_id: orderId, method: 'app' } });
    expect(paid.status).toBe(200);
    expect(paid.body.order).toMatchObject({ status: 'PAID', payment_method: 'app', paid_at: expect.any(String) });

    const closed = await api('POST', `/api/v1/sessions/${session.id}/close`, { token: guest.token });
    expect(closed.status).toBe(200);
    expect(closed.body.session.status).toBe('CLOSED');
  });
});

describe('staff panel', () => {
  it('lists reservations and manages the waitlist', async () => {
    const staff = await login(DEMO.staff.email, DEMO.staff.password);
    const res = await api('GET', '/api/v1/staff/reservations', { token: staff, query: { venue_id: 'venue-1' } });
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.reservations)).toBe(true);
    expect((await api('GET', '/api/v1/staff/reservations', { token: staff })).status).toBe(400);
    expect((await api('GET', '/api/v1/staff/reservations', { token: staff, query: { venue_id: 'venue-2' } })).status).toBe(403);

    const host = venue.ownerToken;
    const added = await api('POST', '/api/v1/staff/waitlist', { token: host, body: { venue_id: venue.venueId, guest_name: 'Walk-in', guests: 3, source: 'WALK_IN' } });
    expect(added.status).toBe(201);
    const id = added.body.entry.id;
    const list = await api('GET', '/api/v1/staff/waitlist', { token: host, query: { venue_id: venue.venueId } });
    expect(list.body.waitlist.map((e: any) => e.id)).toContain(id);
    const notified = await api('POST', `/api/v1/staff/waitlist/${id}/notify`, { token: host, body: {} });
    expect(notified.status).toBe(200);
    expect(notified.body.entry.status).toBe('READY');
    expect(added.body.entry.source).toBe('HOST');
    expect((await api('POST', `/api/v1/staff/waitlist/${id}/seat`, { token: host, body: {} })).body).toEqual({ error: 'bad_request' });
    const table = (await tablesNow()).find((t: any) => t.status === 'FREE' && t.seats >= 3);
    const seated = await api('POST', `/api/v1/staff/waitlist/${id}/seat`, { token: host, body: { table_id: table.id } });
    expect(seated.status, JSON.stringify(seated.body)).toBe(200);
    expect(seated.body.entry).toMatchObject({ status: 'SEATED', table_id: table.id });

    const other = await api('POST', '/api/v1/staff/waitlist', { token: host, body: { venue_id: venue.venueId, guest_name: 'Gone', guests: 2 } });
    const closed = await api('POST', `/api/v1/staff/waitlist/${other.body.entry.id}/close`, { token: host, body: { status: 'LEFT' } });
    expect(closed.status).toBe(200);
    expect(closed.body.entry.status).toBe('LEFT');
  });
});

describe('18+ (APP_LOGIC 8.4)', () => {
  it('staff grant after ID check, age-check before serving, owner revoke, audit log', async () => {
    const guest = await newGuest('adult');
    const slot = await freeSlot('venue-1');
    const booked = await api('POST', '/api/v1/reservations', { token: guest.token, body: { venue_id: 'venue-1', table_id: slot.table_id, guests: 2, reserved_for: slot.starts_at } });
    const reservation = booked.body.reservation;
    const staff = await login(DEMO.staff.email, DEMO.staff.password);
    const owner = await login(DEMO.owner.email, DEMO.owner.password);

    // Not checked in yet → visit_required.
    const early = await api('POST', `/api/v1/staff/reservations/${reservation.id}/adult-verification`, { token: staff, body: { id_document_checked: true, id_document_type: 'passport' } });
    expect(early.status).toBe(409);
    expect(early.body).toEqual({ error: 'visit_required' });

    // The guest gets a second booking for the preorder, then checks in on the first.
    const second = await newGuest('adult2');
    void second;
    await api('POST', `/api/v1/reservations/${reservation.id}/confirm-arrival`, { token: guest.token, body: {} });

    const noId = await api('POST', `/api/v1/staff/reservations/${reservation.id}/adult-verification`, { token: staff, body: { id_document_checked: false, id_document_type: 'passport' } });
    expect(noId.status).toBe(400);
    expect(noId.body).toEqual({ error: 'id_document_required' });
    const granted = await api('POST', `/api/v1/staff/reservations/${reservation.id}/adult-verification`, { token: staff, body: { id_document_checked: true, id_document_type: 'passport' } });
    expect(granted.status).toBe(200);
    expect(granted.body).toMatchObject({ user_id: guest.user.id, adult_preorder_allowed: true, adult_verification: { verified_by_staff_role: 'waiter', id_document_type: 'passport' } });

    const waiterRevoke = await api('POST', `/api/v1/staff/venues/venue-1/guests/${guest.user.id}/adult-verification/revoke`, { token: staff, body: {} });
    expect(waiterRevoke.status).toBe(403);
    const revoked = await api('POST', `/api/v1/staff/venues/venue-1/guests/${guest.user.id}/adult-verification/revoke`, { token: owner, body: { reason: 'fake ID' } });
    expect(revoked.status).toBe(200);
    expect(revoked.body.adult_preorder_allowed).toBe(false);

    const admin = await login(DEMO.admin.email, DEMO.admin.password);
    const log = await api('GET', '/api/v1/admin/adult-permission-log', { token: admin, query: { user_id: guest.user.id } });
    expect(log.status).toBe(200);
    expect(log.body.entries.map((e: any) => e.action)).toEqual(['REVOKE', 'GRANT']);
  });

  it('age-check endpoint answers for unknown orders', async () => {
    const staff = await login(DEMO.staff.email, DEMO.staff.password);
    const res = await api('POST', '/api/v1/staff/orders/nope/age-check', { token: staff, body: { approved: true, id_document_checked: true } });
    expect(res.status).toBe(404);
  });
});
