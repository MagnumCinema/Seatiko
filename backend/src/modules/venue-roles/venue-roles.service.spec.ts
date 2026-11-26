import { DomainError } from '../../core/errors/domain-error.js';
import type { Clock } from '../../core/time/time.js';
import type { VenueAccessService } from '../venue-access/venue-access.service.js';
import type { RoleRow, VenueRolesRepository } from './venue-roles.repository.js';
import { VenueRolesService } from './venue-roles.service.js';

/** In-memory roles and team of one venue. */
function setup(opts: { type?: string; staff?: string[]; owner?: boolean } = {}) {
  const roles: RoleRow[] = [];
  const staff = [...(opts.staff ?? [])];
  const repo = {
    roles: async (venueId: string) => roles.filter((r) => r.venueId === venueId).sort((a, b) => a.position - b.position),
    rolesOf: async () => roles,
    role: async (id: string) => roles.find((r) => r.id === id),
    insertRoles: async (rows: RoleRow[]) => {
      for (const r of rows) if (!roles.some((x) => x.venueId === r.venueId && x.key === r.key)) roles.push({ ...r });
    },
    updateRole: async (id: string, patch: Partial<RoleRow>) => Object.assign(roles.find((r) => r.id === id)!, patch),
    deleteRole: async (role: RoleRow, reassignTo?: string) => {
      if (reassignTo) staff.forEach((k, i) => (k === role.key ? (staff[i] = reassignTo) : undefined));
      roles.splice(roles.indexOf(role), 1);
    },
    membersWithRole: async (_v: string, key: string) => staff.filter((k) => k === key).length,
    usedKeys: async () => [...new Set(staff)],
    venueType: async () => opts.type ?? '',
  } as unknown as VenueRolesRepository;
  const access = {
    requireOwner: async () => {
      if (opts.owner === false) throw new DomainError('forbidden', 403);
      return 'venue-1';
    },
  } as unknown as VenueAccessService;
  const clock = { now: () => new Date('2026-11-25T10:00:00Z') } as Clock;
  return { service: new VenueRolesService(repo, access, clock), roles, staff };
}

const code = async (p: Promise<unknown>) => p.then(() => 'ok', (e: DomainError) => e.code);

describe('VenueRolesService', () => {
  it('seeds a cafe with its preset and keeps the waiter role old staff use', async () => {
    const { service } = setup({ type: 'cafe', staff: ['waiter', 'waiter'] });
    const list = await service.list('owner', 'venue-1');
    expect(list.roles.map((r) => r.key)).toEqual(['barista', 'pastry_chef', 'cashier', 'shift_lead', 'waiter']);
    expect(list.roles.every((r) => r.is_system && r.name === '')).toBe(true);
    expect(list.suggested).toEqual([]);
  });

  it('suggests preset roles missing after a type change and adds them on request', async () => {
    const ctx = setup({ type: 'restaurant' });
    await ctx.service.ensure('venue-1');
    ctx.roles.splice(2); // venue keeps waiter + cook only
    expect((await ctx.service.list('owner', 'venue-1')).suggested).toEqual(['host', 'manager']);
    const after = await ctx.service.addPreset('owner', 'venue-1', ['host']);
    expect(after.map((r) => r.key)).toEqual(['waiter', 'cook', 'host']);
  });

  it('creates custom roles with validation and unique names', async () => {
    const { service } = setup({ type: 'bar' });
    const role = await service.create('owner', 'venue-1', { name: ' Кальянщик ', color: '#AABBCC', in_schedule: false });
    expect(role).toMatchObject({ name: 'Кальянщик', color: '#aabbcc', in_schedule: false, is_system: false });
    expect(role.key).toMatch(/^custom-/);
    expect(await code(service.create('owner', 'venue-1', { name: 'кальянщик' }))).toBe('role_exists');
    expect(await code(service.create('owner', 'venue-1', { name: '  ' }))).toBe('invalid_name');
    expect(await code(service.create('owner', 'venue-1', { name: 'Sushi', color: 'blue' }))).toBe('invalid_color');
  });

  it('renames a preset role and restores its translated name with an empty one', async () => {
    const { service, roles } = setup({ type: 'restaurant' });
    await service.ensure('venue-1');
    const waiter = roles.find((r) => r.key === 'waiter')!;
    expect((await service.update('owner', 'venue-1', waiter.id, { name: 'Официант зала' })).name).toBe('Официант зала');
    expect((await service.update('owner', 'venue-1', waiter.id, { name: '' })).name).toBe('');
  });

  it('never deletes system roles and moves members off a custom role first', async () => {
    const { service, roles, staff } = setup({ type: 'restaurant', staff: ['waiter'] });
    await service.ensure('venue-1');
    const waiter = roles.find((r) => r.key === 'waiter')!;
    expect(await code(service.remove('owner', 'venue-1', waiter.id))).toBe('system_role');
    const custom = await service.create('owner', 'venue-1', { name: 'Сушист' });
    staff.push(custom.key);
    expect(await code(service.remove('owner', 'venue-1', custom.id))).toBe('role_in_use');
    expect(await code(service.remove('owner', 'venue-1', custom.id, 'nope'))).toBe('bad_reassign');
    expect(await service.remove('owner', 'venue-1', custom.id, 'cook')).toEqual({ ok: true, reassigned: 1 });
    expect(staff).toEqual(['waiter', 'cook']);
    expect(roles.some((r) => r.key === custom.key)).toBe(false);
  });

  it('only lets the venue owner manage roles', async () => {
    const { service } = setup({ owner: false });
    expect(await code(service.list('guest', 'venue-1'))).toBe('forbidden');
    expect(await code(service.create('guest', 'venue-1', { name: 'X' }))).toBe('forbidden');
  });

  it('resolves invite roles: empty picks the first planner role, unknown fails', async () => {
    const { service } = setup({ type: 'cafe' });
    expect(await service.resolveKey('venue-1', '')).toBe('barista');
    expect(await service.resolveKey('venue-1', 'Cashier')).toBe('cashier');
    expect(await code(service.resolveKey('venue-1', 'pilot'))).toBe('unknown_role');
  });
});
