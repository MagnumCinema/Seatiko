import {
  cleanPermissions,
  cleanRoleName,
  customRoleKey,
  deleteBlocker,
  initialRoles,
  isVenueType,
  missingPresetRoles,
  PRESET_ROLES,
  presetKeys,
  TYPE_PRESETS,
  validColor,
  VENUE_TYPES,
} from './role-presets.js';

describe('venue role presets', () => {
  it('has a preset for every venue type, made of known roles', () => {
    for (const type of VENUE_TYPES) {
      expect(TYPE_PRESETS[type].length).toBeGreaterThan(0);
      for (const key of TYPE_PRESETS[type]) expect(PRESET_ROLES[key]).toBeDefined();
    }
  });

  it('knows venue types', () => {
    expect(isVenueType('cafe')).toBe(true);
    expect(isVenueType('wine_bar')).toBe(true);
    expect(isVenueType('casino')).toBe(false);
    expect(isVenueType('')).toBe(false);
  });

  it('suggests baristas for a cafe and waiter/cook without a type', () => {
    expect(presetKeys('cafe')).toEqual(['barista', 'pastry_chef', 'cashier', 'shift_lead']);
    expect(presetKeys('')).toEqual(['waiter', 'cook']);
    expect(presetKeys('unknown')).toEqual(['waiter', 'cook']);
  });

  it('lists only the preset roles a venue is missing', () => {
    expect(missingPresetRoles('restaurant', ['waiter', 'custom-1']).map((r) => r.key)).toEqual(['cook', 'host', 'manager']);
    expect(missingPresetRoles('restaurant', ['waiter', 'cook', 'host', 'manager'])).toEqual([]);
  });

  it('seeds the preset and keeps roles the team already uses', () => {
    const seeds = initialRoles('cafe', ['waiter', 'barista', 'Кальянщик', 'waiter', '']);
    expect(seeds.map((s) => s.key)).toEqual(['barista', 'pastry_chef', 'cashier', 'shift_lead', 'waiter', 'Кальянщик']);
    expect(seeds.find((s) => s.key === 'waiter')!.color).toBe(PRESET_ROLES.waiter.color);
    expect(seeds.every((s) => s.inSchedule)).toBe(true);
    expect(seeds.find((s) => s.key === 'Кальянщик')!.permissions).toEqual([]);
  });

  it('does not share permission arrays between venues', () => {
    const [a] = initialRoles('restaurant', []);
    a.permissions.push('venue.analytics');
    expect(PRESET_ROLES.waiter.permissions).not.toContain('venue.analytics');
  });

  it('validates names, colours and permissions', () => {
    expect(cleanRoleName('  Кальянщик   ночь ')).toBe('Кальянщик ночь');
    expect(cleanRoleName('   ')).toBeUndefined();
    expect(cleanRoleName('x'.repeat(41))).toBeUndefined();
    expect(validColor('#A1b2C3')).toBe(true);
    expect(validColor('red')).toBe(false);
    expect(cleanPermissions(['floor.orders', 'floor.orders', 'root', ' venue.analytics'])).toEqual(['floor.orders', 'venue.analytics']);
  });

  it('blocks deleting system roles and roles in use without a replacement', () => {
    expect(deleteBlocker({ isSystem: true, key: 'waiter' }, 0)).toBe('system_role');
    expect(deleteBlocker({ isSystem: false, key: 'custom-a' }, 2)).toBe('role_in_use');
    expect(deleteBlocker({ isSystem: false, key: 'custom-a' }, 2, 'custom-a')).toBe('bad_reassign');
    expect(deleteBlocker({ isSystem: false, key: 'custom-a' }, 2, 'waiter')).toBeUndefined();
    expect(deleteBlocker({ isSystem: false, key: 'custom-a' }, 0)).toBeUndefined();
  });

  it('makes short custom keys', () => {
    expect(customRoleKey('0f8e2c1a-1111-2222-3333-444455556666')).toBe('custom-0f8e2c1a1111');
  });
});
