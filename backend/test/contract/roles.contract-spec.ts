import { api, newGuest, newOwner, publishedVenue } from './client.js';

// Venue type and team roles (presets, custom roles, assignment) in the restaurant cabinet.

let venue: Awaited<ReturnType<typeof publishedVenue>>;

beforeAll(async () => {
  venue = await publishedVenue();
});

const path = (suffix = '') => `/api/v1/restaurant/venues/${venue.venueId}/roles${suffix}`;

describe('venue roles', () => {
  it('seeds waiter and cook for a venue without a type and suggests nothing', async () => {
    const res = await api('GET', path(), { token: venue.ownerToken });
    expect(res.status).toBe(200);
    expect(res.body.venue_type).toBe('');
    expect(res.body.roles.map((r: any) => r.key)).toEqual(['waiter', 'cook']);
    expect(res.body.roles[0]).toMatchObject({ name: '', in_schedule: true, is_system: true });
    expect(res.body.suggested).toEqual([]);
  });

  it('creates, renames and deletes a custom role, reassigning its members', async () => {
    const created = await api('POST', path(), { token: venue.ownerToken, body: { name: 'Кальянщик', color: '#ef4444', in_schedule: false } });
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    const role = created.body.role;
    expect(role).toMatchObject({ name: 'Кальянщик', color: '#ef4444', in_schedule: false, is_system: false });

    expect((await api('POST', path(), { token: venue.ownerToken, body: { name: 'кальянщик' } })).status).toBe(409);
    expect((await api('POST', path(), { token: venue.ownerToken, body: { name: 'X', color: 'red' } })).status).toBe(400);

    const renamed = await api('PATCH', path(`/${role.id}`), { token: venue.ownerToken, body: { name: 'Кальянный мастер', in_schedule: true } });
    expect(renamed.body.role).toMatchObject({ name: 'Кальянный мастер', in_schedule: true });

    const guest = await newGuest('role');
    const member = (await api('POST', `/api/v1/restaurant/venues/${venue.venueId}/staff/invite`, { token: venue.ownerToken, body: { email: guest.email, role: role.key } })).body.staff;
    expect(member.role).toBe(role.key);

    const inUse = await api('DELETE', path(`/${role.id}`), { token: venue.ownerToken });
    expect(inUse.status).toBe(409);
    expect(inUse.body).toMatchObject({ error: 'role_in_use', members: 1 });

    const deleted = await api('DELETE', path(`/${role.id}`), { token: venue.ownerToken, query: { reassign_to: 'cook' } });
    expect(deleted.body).toEqual({ ok: true, reassigned: 1 });
    const team = await api('GET', `/api/v1/restaurant/venues/${venue.venueId}/staff`, { token: venue.ownerToken });
    expect(team.body.staff.find((m: any) => m.id === member.id).role).toBe('cook');
  });

  it('protects preset roles and assigns roles to members', async () => {
    const { body } = await api('GET', path(), { token: venue.ownerToken });
    const waiter = body.roles.find((r: any) => r.key === 'waiter');
    const blocked = await api('DELETE', path(`/${waiter.id}`), { token: venue.ownerToken });
    expect(blocked.status).toBe(409);
    expect(blocked.body.error).toBe('system_role');

    const guest = await newGuest('assign');
    const member = (await api('POST', `/api/v1/restaurant/venues/${venue.venueId}/staff/invite`, { token: venue.ownerToken, body: { email: guest.email } })).body.staff;
    expect(member.role).toBe('waiter');
    const assigned = await api('PATCH', `/api/v1/restaurant/venues/${venue.venueId}/staff/${member.id}`, { token: venue.ownerToken, body: { role: 'cook' } });
    expect(assigned.body.staff.role).toBe('cook');
    const unknown = await api('PATCH', `/api/v1/restaurant/venues/${venue.venueId}/staff/${member.id}`, { token: venue.ownerToken, body: { role: 'pilot' } });
    expect(unknown.status).toBe(400);
  });

  it('seeds the preset of a draft type and offers missing roles after a type change', async () => {
    const owner = await newOwner();
    const app = (await api('POST', '/api/v1/restaurant/applications', { token: owner.token })).body.application;
    const typed = await api('PATCH', `/api/v1/restaurant/applications/${app.id}`, { token: owner.token, body: { venue_type: 'cafe' } });
    expect(typed.body.application.venue_type).toBe('cafe');
    const rolesPath = `/api/v1/restaurant/venues/${app.id}/roles`;
    expect((await api('GET', rolesPath, { token: owner.token })).body.roles.map((r: any) => r.key)).toEqual(['barista', 'pastry_chef', 'cashier', 'shift_lead']);

    await api('PATCH', `/api/v1/restaurant/applications/${app.id}`, { token: owner.token, body: { venue_type: 'wine_bar' } });
    const after = (await api('GET', rolesPath, { token: owner.token })).body;
    expect(after.suggested).toEqual(['sommelier', 'bartender', 'waiter', 'manager']);
    const added = await api('POST', `${rolesPath}/preset`, { token: owner.token, body: { keys: ['sommelier'] } });
    expect(added.body.roles.map((r: any) => r.key)).toContain('sommelier');
    expect((await api('PATCH', `/api/v1/restaurant/applications/${app.id}`, { token: owner.token, body: { venue_type: 'casino' } })).status).toBe(400);
  });

  it('keeps roles to the venue owner', async () => {
    const other = await newOwner();
    expect((await api('GET', path(), { token: other.token })).status).toBe(403);
    const guest = await newGuest('nosy');
    expect((await api('POST', path(), { token: guest.token, body: { name: 'X' } })).status).toBe(403);
  });
});
