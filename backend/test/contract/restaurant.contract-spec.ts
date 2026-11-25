import { api, DEMO, login, newGuest, newOwner, pngBlob, VENUE_PROFILE as profile } from './client.js';

// Restaurant onboarding and cabinet, admin moderation and reports.

describe('restaurant onboarding → admin publish → cabinet', () => {
  it('runs the whole lifecycle', async () => {
    const owner = await newOwner();
    const admin = await login(DEMO.admin.email, DEMO.admin.password);

    const created = await api('POST', '/api/v1/restaurant/applications', { token: owner.token });
    expect(created.status).toBe(201);
    const appId = created.body.application.id;
    expect(created.body.application).toMatchObject({ status: 'DRAFT', owner_user_id: owner.user.id });

    const early = await api('POST', `/api/v1/restaurant/applications/${appId}/submit`, { token: owner.token });
    expect(early.status).toBeGreaterThanOrEqual(400);

    const patched = await api('PATCH', `/api/v1/restaurant/applications/${appId}`, { token: owner.token, body: profile });
    expect(patched.status).toBe(200);
    expect(patched.body.application).toMatchObject({ name: profile.name, hours_text: profile.hours_text, phone: profile.phone });

    const form = new FormData();
    form.append('photo', pngBlob(), 'front.png');
    const photo = await api('POST', `/api/v1/restaurant/applications/${appId}/photos`, { token: owner.token, form });
    expect(photo.status, JSON.stringify(photo.body)).toBe(201);
    expect(photo.body.url).toEqual(expect.any(String));
    expect(photo.body.application.photo_urls).toContain(photo.body.url);

    const second = new FormData();
    second.append('photo', pngBlob(), 'hall.png');
    const photo2 = await api('POST', `/api/v1/restaurant/applications/${appId}/photos`, { token: owner.token, form: second });
    const removed = await api('DELETE', `/api/v1/restaurant/applications/${appId}/photos`, { token: owner.token, body: { url: photo2.body.url } });
    expect(removed.status).toBe(200);
    expect(removed.body.application.photo_urls).not.toContain(photo2.body.url);

    const submitted = await api('POST', `/api/v1/restaurant/applications/${appId}/submit`, { token: owner.token });
    expect(submitted.status, JSON.stringify(submitted.body)).toBe(200);
    expect(submitted.body.application.status).toBe('SUBMITTED');

    expect((await api('GET', '/api/v1/restaurant/applications', { token: owner.token })).body.applications.map((a: any) => a.id)).toContain(appId);
    expect((await api('GET', `/api/v1/restaurant/applications/${appId}`, { token: owner.token })).body.application.id).toBe(appId);
    const activity = await api('GET', `/api/v1/restaurant/applications/${appId}/activity`, { token: owner.token });
    expect(activity.status).toBe(200);
    expect(activity.body.activity.length).toBeGreaterThan(0);

    const queue = await api('GET', '/api/v1/admin/applications', { token: admin, query: { status: 'SUBMITTED' } });
    expect(queue.body.applications.map((a: any) => a.id)).toContain(appId);
    const bad = await api('POST', `/api/v1/admin/applications/${appId}/review`, { token: admin, body: { status: 'PUBLISHED' } });
    expect(bad.status).toBe(400);
    for (const status of ['UNDER_REVIEW', 'APPROVED']) {
      const reviewed = await api('POST', `/api/v1/admin/applications/${appId}/review`, { token: admin, body: { status } });
      expect(reviewed.status, status).toBe(200);
      expect(reviewed.body.application.status).toBe(status);
    }
    const published = await api('POST', `/api/v1/admin/applications/${appId}/publish`, { token: admin });
    expect(published.status).toBe(200);
    expect(published.body.application.status).toBe('PUBLISHED');
    const venueId = published.body.venue_id;
    expect(venueId).toEqual(expect.stringMatching(/^venue-/));
    expect((await api('GET', `/api/v1/venues/${venueId}`)).body.venue.hours_text).toBe(profile.hours_text);

    // Floor plan, QR.
    const tables = await api('PUT', `/api/v1/restaurant/venues/${venueId}/tables`, {
      token: owner.token,
      body: { tables: [{ number: 1, seats: 2, x: 0.2, y: 0.3, zone: 'hall' }, { number: 2, seats: 6, x: 0.6, y: 0.3, zone: 'terrace' }] },
    });
    expect(tables.status).toBe(200);
    expect(tables.body.tables).toHaveLength(2);
    const qr = await api('GET', `/api/v1/restaurant/venues/${venueId}/qr`, { token: owner.token });
    expect(qr.body.tables[0].qr_token).toEqual(expect.any(String));
    const rotated = await api('POST', `/api/v1/restaurant/venues/${venueId}/qr/regenerate`, { token: owner.token });
    expect(rotated.status).toBe(200);
    expect(rotated.body.tables[0].qr_token).not.toBe(qr.body.tables[0].qr_token);

    // Menu.
    const item = await api('POST', `/api/v1/restaurant/venues/${venueId}/menu`, {
      token: owner.token,
      body: { category: { ru: 'Напитки', en: 'Drinks', ro: 'Băuturi' }, name: { ru: 'Сидр', en: 'Cider', ro: 'Cidru' }, description: { ru: '', en: '', ro: '' }, price: 60, contains_alcohol: true },
    });
    expect([200, 201]).toContain(item.status);
    const menuItem = item.body.item;
    expect(menuItem).toMatchObject({ price: 60, contains_alcohol: true, requires_age_18: true, venue_id: venueId });
    const edited = await api('PATCH', `/api/v1/restaurant/venues/${venueId}/menu/${menuItem.id}`, {
      token: owner.token,
      body: { category: menuItem.category, name: menuItem.name, description: menuItem.description, price: 65, contains_alcohol: true },
    });
    expect(edited.status).toBe(200);
    expect(edited.body.item.price).toBe(65);
    const stopped = await api('POST', `/api/v1/restaurant/venues/${venueId}/menu/${menuItem.id}/stop`, { token: owner.token, body: { stopped: true } });
    expect(stopped.status).toBe(200);
    expect(stopped.body.item.stopped).toBe(true);
    const ownerMenu = await api('GET', `/api/v1/restaurant/venues/${venueId}/menu`, { token: owner.token });
    expect(ownerMenu.body.menu.map((m: any) => m.id)).toContain(menuItem.id);
    expect((await api('GET', `/api/v1/venues/${venueId}/menu`)).body.menu.map((m: any) => m.id)).not.toContain(menuItem.id);
    const deleted = await api('DELETE', `/api/v1/restaurant/venues/${venueId}/menu/${menuItem.id}`, { token: owner.token });
    expect(deleted.status).toBe(200);

    // Booking rules, analytics, reservations.
    const rules = await api('PATCH', `/api/v1/restaurant/venues/${venueId}/booking-rules`, { token: owner.token, body: { booking_interval_min: 15, allow_preorder: true, preorder_lead_min: 45 } });
    expect(rules.status).toBe(200);
    expect(rules.body.venue).toMatchObject({ booking_interval_min: 15, allow_preorder: true, preorder_lead_min: 45 });
    expect((await api('PATCH', `/api/v1/restaurant/venues/${venueId}/booking-rules`, { token: owner.token, body: { booking_interval_min: 1 } })).status).toBe(400);
    const analytics = await api('GET', `/api/v1/restaurant/venues/${venueId}/analytics`, { token: owner.token });
    expect(analytics.status).toBe(200);
    expect(analytics.body.analytics).toMatchObject({ venue_id: venueId, total_tables: 2 });
    expect((await api('GET', '/api/v1/restaurant/reservations', { token: owner.token })).status).toBe(200);

    // Someone else's venue.
    expect((await api('GET', '/api/v1/restaurant/venues/venue-1/analytics', { token: owner.token })).status).toBe(403);

    // Staff: an existing user becomes active at once; a new email is invited, registers and accepts.
    const existing = await newGuest('waiter');
    const direct = await api('POST', `/api/v1/restaurant/venues/${venueId}/staff/invite`, { token: owner.token, body: { email: existing.email } });
    expect(direct.status).toBe(201);
    expect(direct.body.staff).toMatchObject({ venue_id: venueId, email: existing.email, status: 'ACTIVE' });

    const futureEmail = `future-${Date.now()}@contract.test`;
    const invite = await api('POST', `/api/v1/restaurant/venues/${venueId}/staff/invite`, { token: owner.token, body: { email: futureEmail } });
    expect(invite.status).toBe(201);
    expect(invite.body.staff).toMatchObject({ email: futureEmail, status: 'INVITED' });
    const registered = await api('POST', '/api/v1/auth/register', { body: { email: futureEmail, password: 'secret123' } });
    const accepted = await api('POST', `/api/v1/staff/invites/${invite.body.staff.id}/accept`, { token: registered.body.token });
    expect(accepted.status, JSON.stringify(accepted.body)).toBe(200);
    expect(accepted.body.staff.status).toBe('ACTIVE');
    const team = await api('GET', `/api/v1/restaurant/venues/${venueId}/staff`, { token: owner.token });
    expect(team.body.staff.map((m: any) => m.id)).toEqual(expect.arrayContaining([direct.body.staff.id, invite.body.staff.id]));

    // Profile change after publication → admin approves.
    const change = await api('POST', `/api/v1/restaurant/applications/${appId}/change-requests`, { token: owner.token, body: { hours_text: 'Пн–Вс 11:00–23:00' } });
    expect(change.status).toBe(201);
    expect(change.body.change_request).toMatchObject({ application_id: appId, status: 'PENDING' });
    expect((await api('GET', '/api/v1/restaurant/change-requests', { token: owner.token })).body.change_requests.length).toBeGreaterThan(0);
    const pending = await api('GET', '/api/v1/admin/change-requests', { token: admin });
    expect(pending.body.change_requests.map((c: any) => c.id)).toContain(change.body.change_request.id);
    const approved = await api('POST', `/api/v1/admin/change-requests/${change.body.change_request.id}/review`, { token: admin, body: { status: 'APPROVED' } });
    expect(approved.status).toBe(200);
    expect(approved.body.change_request.status).toBe('APPROVED');
    expect((await api('GET', `/api/v1/venues/${venueId}`)).body.venue.hours_text).toBe('Пн–Вс 11:00–23:00');
  });
});

describe('admin reports', () => {
  it('overview, people, companies, reservations, orders, CRM', async () => {
    const admin = await login(DEMO.admin.email, DEMO.admin.password);
    const overview = await api('GET', '/api/v1/admin/overview', { token: admin });
    expect(overview.status).toBe(200);
    expect(overview.body.overview).toEqual(expect.any(Object));
    for (const [path, key] of [
      ['/api/v1/admin/people', 'people'],
      ['/api/v1/admin/companies', 'companies'],
      ['/api/v1/admin/reservations', 'reservations'],
      ['/api/v1/admin/orders', 'orders'],
    ] as const) {
      const res = await api('GET', path, { token: admin });
      expect(res.status, path).toBe(200);
      expect(Array.isArray(res.body[key]), path).toBe(true);
    }
    const crm = await api('GET', '/api/v1/admin/crm/status', { token: admin });
    expect(crm.status).toBe(200);
    expect(crm.body.enabled).toBe(false);
    const reconcile = await api('POST', '/api/v1/admin/integrations/twenty/reconcile', { token: admin });
    expect(reconcile.status).toBe(503);
  });
});
