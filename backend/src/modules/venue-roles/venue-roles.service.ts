import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { badRequest, conflict, notFound } from '../../core/errors/domain-error.js';
import { Clock, formatDbTime } from '../../core/time/time.js';
import { VenueAccessService } from '../venue-access/venue-access.service.js';
import {
  cleanPermissions,
  cleanRoleName,
  customRoleKey,
  deleteBlocker,
  initialRoles,
  isPresetKey,
  MAX_ROLES,
  missingPresetRoles,
  presetSeed,
  ROLE_COLORS,
  type RoleSeed,
  validColor,
} from './domain/role-presets.js';
import { type Db, type RoleRow, VenueRolesRepository } from './venue-roles.repository.js';

export type RoleInput = { name?: string; color?: string; in_schedule?: boolean; position?: number; permissions?: string[] };

export const presentRole = (r: RoleRow) => ({
  id: r.id,
  venue_id: r.venueId,
  key: r.key,
  name: r.name,
  color: r.color,
  in_schedule: r.inSchedule,
  position: r.position,
  is_system: r.isSystem,
  permissions: r.permissions,
  created_at: formatDbTime(r.createdAt),
});

/** How a role shows on a shift or a team member: custom name (or '' for the preset label) and colour. */
export type RoleLabel = { name: string; color: string };

/** Per-venue team roles: preset seeding, custom roles, assignment checks. */
@Injectable()
export class VenueRolesService {
  constructor(
    private readonly repo: VenueRolesRepository,
    private readonly access: VenueAccessService,
    private readonly clock: Clock,
  ) {}

  private rows(venueId: string, seeds: RoleSeed[], startPosition: number, isSystem = (s: RoleSeed) => isPresetKey(s.key)) {
    const now = this.clock.now().toISOString();
    return seeds.map((s, i) => ({
      id: randomUUID(),
      venueId,
      key: s.key,
      // Legacy free-text keys keep their text as the name; preset ones are translated by the client.
      name: isPresetKey(s.key) ? '' : s.key,
      color: s.color,
      inSchedule: s.inSchedule,
      position: startPosition + i,
      isSystem: isSystem(s),
      permissions: s.permissions,
      createdAt: now,
    }));
  }

  /**
   * The venue's roles; a venue without any gets the preset of its type plus the
   * roles its team already uses (old waiter / cook members).
   */
  async ensure(venueId: string, db?: Db): Promise<RoleRow[]> {
    const existing = await this.repo.roles(venueId, db);
    if (existing.length) return existing;
    const seeds = initialRoles(await this.repo.venueType(venueId, db), await this.repo.usedKeys(venueId, db));
    await this.repo.insertRoles(this.rows(venueId, seeds, 0), db);
    return this.repo.roles(venueId, db);
  }

  /** Seeds the preset of a just chosen type when the venue has no roles yet. */
  async seedIfEmpty(venueId: string, db?: Db): Promise<void> {
    await this.ensure(venueId, db);
  }

  async list(ownerId: string, id: string) {
    const venueId = await this.access.requireOwner(ownerId, id);
    const roles = await this.ensure(venueId);
    const venueType = await this.repo.venueType(venueId);
    return {
      venue_type: venueType,
      roles: roles.map(presentRole),
      // Preset roles of the current type the venue does not have (offered after a type change).
      suggested: missingPresetRoles(venueType, roles.map((r) => r.key)).map((s) => s.key),
    };
  }

  async create(ownerId: string, id: string, input: RoleInput) {
    const venueId = await this.access.requireOwner(ownerId, id);
    const roles = await this.ensure(venueId);
    if (roles.length >= MAX_ROLES) throw conflict('too_many_roles');
    const name = cleanRoleName(input.name ?? '');
    if (!name) throw badRequest('invalid_name');
    if (roles.some((r) => r.name.toLowerCase() === name.toLowerCase())) throw conflict('role_exists');
    const color = (input.color ?? '').trim() || ROLE_COLORS[roles.length % ROLE_COLORS.length];
    if (!validColor(color)) throw badRequest('invalid_color');
    const roleId = randomUUID();
    await this.repo.insertRoles([
      {
        id: roleId,
        venueId,
        key: customRoleKey(roleId),
        name,
        color: color.toLowerCase(),
        inSchedule: input.in_schedule ?? true,
        position: Math.max(-1, ...roles.map((r) => r.position)) + 1,
        isSystem: false,
        permissions: cleanPermissions(input.permissions ?? []),
        createdAt: this.clock.now().toISOString(),
      },
    ]);
    return presentRole((await this.repo.role(roleId))!);
  }

  private async venueRole(ownerId: string, id: string, roleId: string): Promise<RoleRow> {
    const venueId = await this.access.requireOwner(ownerId, id);
    const role = await this.repo.role(roleId);
    if (!role || role.venueId !== venueId) throw notFound('not_found');
    return role;
  }

  /** Rename (empty name on a preset role restores its translated name), recolour, planner flag, order. */
  async update(ownerId: string, id: string, roleId: string, input: RoleInput) {
    const role = await this.venueRole(ownerId, id, roleId);
    const patch: Partial<RoleRow> = {};
    if (input.name !== undefined) {
      const name = cleanRoleName(input.name);
      if (!name && !(role.isSystem && isPresetKey(role.key) && !input.name.trim())) throw badRequest('invalid_name');
      if (name) {
        const others = (await this.repo.roles(role.venueId)).filter((r) => r.id !== role.id);
        if (others.some((r) => r.name.toLowerCase() === name.toLowerCase())) throw conflict('role_exists');
      }
      patch.name = name ?? '';
    }
    if (input.color !== undefined) {
      if (!validColor(input.color)) throw badRequest('invalid_color');
      patch.color = input.color.trim().toLowerCase();
    }
    if (input.in_schedule !== undefined) patch.inSchedule = input.in_schedule;
    if (input.position !== undefined) patch.position = input.position;
    if (input.permissions !== undefined) patch.permissions = cleanPermissions(input.permissions);
    if (!Object.keys(patch).length) return presentRole(role);
    return presentRole(await this.repo.updateRole(role.id, patch));
  }

  /** Custom roles only; members holding it move to `reassignTo` (409 role_in_use without one). */
  async remove(ownerId: string, id: string, roleId: string, reassignTo?: string) {
    const role = await this.venueRole(ownerId, id, roleId);
    const target = reassignTo?.trim() || undefined;
    if (target && !(await this.repo.roles(role.venueId)).some((r) => r.key === target)) throw badRequest('bad_reassign');
    const members = await this.repo.membersWithRole(role.venueId, role.key);
    const blocker = deleteBlocker(role, members, target);
    if (blocker === 'bad_reassign') throw badRequest(blocker);
    if (blocker) throw conflict(blocker, { members });
    await this.repo.deleteRole(role, target, this.clock.now().toISOString().slice(0, 10));
    return { ok: true, reassigned: target ? members : 0 };
  }

  /** Adds the preset roles of the venue type it is missing (all, or the listed keys). */
  async addPreset(ownerId: string, id: string, keys?: string[]) {
    const venueId = await this.access.requireOwner(ownerId, id);
    const roles = await this.ensure(venueId);
    const wanted = keys?.length ? new Set(keys) : undefined;
    const missing = missingPresetRoles(await this.repo.venueType(venueId), roles.map((r) => r.key)).filter((s) => !wanted || wanted.has(s.key));
    if (roles.length + missing.length > MAX_ROLES) throw conflict('too_many_roles');
    await this.repo.insertRoles(this.rows(venueId, missing, Math.max(-1, ...roles.map((r) => r.position)) + 1));
    return (await this.repo.roles(venueId)).map(presentRole);
  }

  /** A role key the venue has (for invites and assignment); '' picks the first planner role. */
  async resolveKey(venueId: string, key: string): Promise<string> {
    const roles = await this.ensure(venueId);
    const k = key.trim();
    if (!k) return (roles.find((r) => r.inSchedule) ?? roles[0])?.key ?? 'waiter';
    const role = roles.find((r) => r.key === k) ?? roles.find((r) => r.key.toLowerCase() === k.toLowerCase());
    if (!role) throw badRequest('unknown_role');
    return role.key;
  }

  /** Display labels of roles by venue and key, for shifts and team lists (no seeding). */
  async labels(venueIds: string[]): Promise<Map<string, RoleLabel>> {
    const map = new Map<string, RoleLabel>();
    for (const r of await this.repo.rolesOf([...new Set(venueIds)])) map.set(`${r.venueId}\u0000${r.key}`, { name: r.name, color: r.color });
    return map;
  }

  /** Colour of a key without a venue row (preset default or neutral). */
  static fallbackColor(key: string): string {
    return presetSeed(key)?.color ?? '#64748b';
  }
}
