import { describe, expect, it } from 'vitest';
import { workplaces, type WorkplaceApplication, type WorkplaceStaff } from './workplace.js';

const app = (id: string, ownerUserId: string, over: Partial<WorkplaceApplication> = {}): WorkplaceApplication => ({
  id,
  ownerUserId,
  venueId: null,
  status: 'APPROVED',
  createdAt: '2026-11-18 10:00:00+00',
  ...over,
});
const member = (userId: string, venueId: string, over: Partial<WorkplaceStaff> = {}): WorkplaceStaff => ({
  userId,
  venueId,
  role: 'waiter',
  status: 'ACTIVE',
  createdAt: '2026-11-25 10:00:00+00',
  ...over,
});

describe('workplaces', () => {
  it('puts staff of a not yet published restaurant at its application', () => {
    const map = workplaces([app('app-1', 'owner')], [member('waiter-1', 'app-1'), member('cook-1', 'app-1', { role: 'cook' })]);
    expect(map.get('owner')).toEqual({ applicationId: 'app-1', jobTitle: 'Владелец' });
    expect(map.get('waiter-1')).toEqual({ applicationId: 'app-1', jobTitle: 'Официант' });
    expect(map.get('cook-1')).toEqual({ applicationId: 'app-1', jobTitle: 'Повар' });
  });

  it('finds the restaurant of staff by its published venue too', () => {
    const map = workplaces([app('app-1', 'owner', { venueId: 'venue-1', status: 'PUBLISHED' })], [member('waiter-1', 'venue-1')]);
    expect(map.get('waiter-1')?.applicationId).toBe('app-1');
  });

  it('ignores invited and revoked access, unknown venues and members without an account', () => {
    const map = workplaces(
      [app('app-1', 'owner')],
      [member('invited', 'app-1', { status: 'INVITED' }), member('revoked', 'app-1', { status: 'REVOKED' }), member('elsewhere', 'venue-x'), member('', 'app-1')],
    );
    expect([...map.keys()]).toEqual(['owner']);
  });

  it('an owner stays an owner even when also added as staff; staff keep their first workplace', () => {
    const map = workplaces(
      [app('app-1', 'owner'), app('app-2', 'owner-2')],
      [member('owner', 'app-2'), member('w', 'app-2', { createdAt: '2026-11-26 10:00:00+00' }), member('w', 'app-1', { createdAt: '2026-11-24 10:00:00+00' })],
    );
    expect(map.get('owner')).toEqual({ applicationId: 'app-1', jobTitle: 'Владелец' });
    expect(map.get('w')?.applicationId).toBe('app-1');
  });

  it('an owner with several restaurants is shown at the published one, then the earliest', () => {
    const map = workplaces(
      [app('a', 'o', { createdAt: '2026-11-01 00:00:00+00' }), app('b', 'o', { status: 'PUBLISHED', createdAt: '2026-11-10 00:00:00+00' })],
      [],
    );
    expect(map.get('o')?.applicationId).toBe('b');
  });
});
