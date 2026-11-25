import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { badRequest, conflict, forbidden, notFound } from '../../core/errors/domain-error.js';
import { Clock, formatDbTime } from '../../core/time/time.js';
import { VenueAccessService } from '../venue-access/venue-access.service.js';
import { addDays, dayDiff, SHIFT_RESPONSES, shiftMinutes, shiftsOverlap, STAFF_ROLES, validDate } from './domain/shift-rules.js';
import { type MemberRow, type ShiftRow, StaffTeamRepository } from './staff-team.repository.js';

export type ShiftInput = { staff_id?: string; date?: string; start_time?: string; end_time?: string; note?: string };
export type BatchInput = { staff_ids?: string[]; dates?: string[]; start_time?: string; end_time?: string; note?: string };

const presentMember = (m: MemberRow, displayName?: string | null) => {
  const name = m.name || (m.userId && displayName) || '';
  return {
    id: m.id,
    venue_id: m.venueId,
    ...(m.userId ? { user_id: m.userId } : {}),
    ...(name ? { name } : {}),
    email: m.email,
    role: m.role,
    status: m.status,
    on_shift: m.onShift,
    created_at: formatDbTime(m.createdAt),
  };
};

const presentShift = (s: ShiftRow) => ({
  id: s.id,
  venue_id: s.venueId,
  staff_id: s.staffId,
  staff_name: s.staffName,
  role: s.role,
  date: s.date,
  start_time: s.startTime,
  end_time: s.endTime,
  status: s.status,
  ...(s.note ? { note: s.note } : {}),
  ...(s.reason ? { reason: s.reason } : {}),
  created_at: formatDbTime(s.createdAt),
  updated_at: formatDbTime(s.updatedAt),
});

/** Venue team (invites, on-shift flag) and the work schedule. */
@Injectable()
export class StaffTeamService {
  constructor(
    private readonly repo: StaffTeamRepository,
    private readonly access: VenueAccessService,
    private readonly clock: Clock,
  ) {}

  private now() {
    return this.clock.now().toISOString();
  }

  /** An existing account joins at once (and becomes staff); a new email gets an invite to accept after sign-up. */
  async invite(ownerId: string, id: string, email: string, name = '', role = '') {
    const venueId = await this.access.requireOwner(ownerId, id);
    const addr = email.trim().toLowerCase();
    if (!addr) throw badRequest('bad_request');
    const r = role.trim().toLowerCase();
    const user = await this.repo.userByEmail(addr);
    const member = await this.repo.insertMember({
      id: randomUUID(),
      venueId,
      userId: user?.id ?? '',
      name: name.trim() || user?.displayName || '',
      email: addr,
      role: STAFF_ROLES.includes(r) ? r : 'waiter',
      status: user ? 'ACTIVE' : 'INVITED',
      onShift: false,
      createdAt: this.now(),
    });
    if (user) await this.repo.makeStaff(user.id, this.now());
    return presentMember(member);
  }

  async team(ownerId: string, id: string) {
    const venueId = await this.access.requireOwner(ownerId, id);
    return (await this.repo.team(venueId))
      .map(({ m, displayName }) => presentMember(m, displayName))
      .sort((a, b) => a.role.localeCompare(b.role) || (a.name ?? '').localeCompare(b.name ?? '') || a.id.localeCompare(b.id));
  }

  private async teamMember(venueId: string, staffId: string): Promise<MemberRow> {
    const m = await this.repo.member(staffId);
    if (!m || m.venueId !== venueId) throw notFound('not_found');
    return m;
  }

  async remove(ownerId: string, id: string, staffId: string) {
    const venueId = await this.access.requireOwner(ownerId, id);
    await this.teamMember(venueId, staffId);
    await this.repo.deleteMember(staffId);
    return { ok: true };
  }

  /** Sets "on shift" (or flips it without a value). */
  async toggleShift(ownerId: string, id: string, staffId: string, onShift?: boolean) {
    const venueId = await this.access.requireOwner(ownerId, id);
    const m = await this.teamMember(venueId, staffId);
    return presentMember(await this.repo.updateMember(staffId, { onShift: onShift ?? !m.onShift }));
  }

  /** The invited person (same email) accepts after signing up. */
  async accept(userId: string, inviteId: string) {
    const user = await this.repo.user(userId);
    const m = await this.repo.member(inviteId);
    if (!user || !m) throw notFound('not_found');
    if (m.status !== 'INVITED' && m.status !== 'ACTIVE') throw conflict('conflict');
    if (m.email && m.email.toLowerCase() !== user.email.toLowerCase()) throw forbidden();
    const updated = await this.repo.updateMember(inviteId, { userId, status: 'ACTIVE' });
    await this.repo.makeStaff(userId, this.now());
    return presentMember(updated);
  }

  private async overlaps(venueId: string, staffId: string, date: string, start: string, end: string, exceptId = '') {
    return (await this.repo.activeShiftsOn(venueId, staffId, date, exceptId)).some((s) => shiftsOverlap(start, end, s.startTime, s.endTime));
  }

  private shiftRow(venueId: string, m: MemberRow, date: string, start: string, end: string, note: string) {
    const now = this.now();
    return {
      id: randomUUID(),
      venueId,
      staffId: m.id,
      staffName: m.name || m.email,
      role: m.role || 'waiter',
      date,
      startTime: start,
      endTime: end,
      status: 'PENDING',
      note: note.trim(),
      createdAt: now,
      updatedAt: now,
    };
  }

  async createShift(ownerId: string, id: string, input: ShiftInput) {
    const venueId = await this.access.requireOwner(ownerId, id);
    const m = await this.repo.member((input.staff_id ?? '').trim());
    if (!m || m.venueId !== venueId) throw badRequest('bad_request');
    const date = (input.date ?? '').trim();
    const start = (input.start_time ?? '').trim();
    const end = (input.end_time ?? '').trim();
    if (!validDate(date) || shiftMinutes(start) === undefined || shiftMinutes(end) === undefined) throw badRequest('bad_request');
    if (await this.overlaps(venueId, m.id, date, start, end)) throw conflict('conflict');
    return presentShift(await this.repo.insertShift(this.shiftRow(venueId, m, date, start, end, input.note ?? '')));
  }

  /** Same hours for several people and days; overlapping ones are skipped (409 when all are). */
  async batch(ownerId: string, id: string, input: BatchInput) {
    const venueId = await this.access.requireOwner(ownerId, id);
    const start = (input.start_time ?? '').trim();
    const end = (input.end_time ?? '').trim();
    if (shiftMinutes(start) === undefined || shiftMinutes(end) === undefined || !input.staff_ids?.length || !input.dates?.length) throw badRequest('bad_request');
    const created: ShiftRow[] = [];
    let skipped = 0;
    for (const staffId of input.staff_ids) {
      const m = await this.repo.member(staffId.trim());
      if (!m || m.venueId !== venueId) continue;
      for (const raw of input.dates) {
        const date = raw.trim();
        if (!validDate(date)) continue;
        if (await this.overlaps(venueId, m.id, date, start, end)) {
          skipped++;
          continue;
        }
        created.push(await this.repo.insertShift(this.shiftRow(venueId, m, date, start, end, input.note ?? '')));
      }
    }
    if (!created.length && skipped) throw conflict('conflict');
    return created.map(presentShift);
  }

  /** Copies the 7 days from the source date to the week from the target date (declined shifts left out). */
  async copyWeek(ownerId: string, id: string, source: string, target: string) {
    const venueId = await this.access.requireOwner(ownerId, id);
    if (!validDate(source) || !validDate(target)) throw badRequest('bad_request');
    const created: ShiftRow[] = [];
    let skipped = 0;
    for (const s of await this.repo.shiftsOf(venueId)) {
      const diff = dayDiff(source, s.date);
      if (s.status === 'DECLINED' || !validDate(s.date) || diff < 0 || diff > 6) continue;
      const m = await this.repo.member(s.staffId);
      if (!m || m.venueId !== venueId) continue;
      const date = addDays(target, diff);
      if (await this.overlaps(venueId, m.id, date, s.startTime, s.endTime)) {
        skipped++;
        continue;
      }
      created.push(await this.repo.insertShift({ ...this.shiftRow(venueId, m, date, s.startTime, s.endTime, s.note), role: m.role || s.role }));
    }
    if (!created.length && skipped) throw conflict('conflict');
    return { shifts: created.map(presentShift), created_count: created.length, skipped_count: skipped };
  }

  /** Owner, admin or staff see a venue schedule; ?role=waiter|cook filters. */
  async shifts(userId: string, id: string, role?: string) {
    if (!(await this.access.ownerCanManage(userId, id))) {
      const user = await this.repo.user(userId);
      if (!user || (user.role !== 'admin' && user.role !== 'staff')) throw forbidden();
    }
    const venueId = await this.access.resolveVenueId(id);
    const filter = role && role !== 'all' ? role.trim().toLowerCase() : undefined;
    return (await this.repo.shiftsOf(venueId, filter)).map(presentShift);
  }

  async deleteShift(ownerId: string, id: string, shiftId: string) {
    const venueId = await this.access.requireOwner(ownerId, id);
    const s = await this.repo.shift(shiftId);
    if (!s || s.venueId !== venueId) throw notFound('not_found');
    await this.repo.deleteShift(shiftId);
    return { ok: true };
  }

  /** Gives the shift to another team member; it waits for their confirmation again. */
  async swap(ownerId: string, id: string, shiftId: string, newStaffId: string) {
    const venueId = await this.access.requireOwner(ownerId, id);
    const s = await this.repo.shift(shiftId);
    if (!s || s.venueId !== venueId) throw notFound('not_found');
    const m = await this.repo.member(newStaffId);
    if (!m || m.venueId !== venueId || m.id === s.staffId) throw badRequest('bad_request');
    if (await this.overlaps(venueId, m.id, s.date, s.startTime, s.endTime, s.id)) throw conflict('conflict');
    return presentShift(
      await this.repo.updateShift(shiftId, { staffId: m.id, staffName: m.name || m.email, role: m.role || s.role, status: 'PENDING', reason: '', updatedAt: this.now() }),
    );
  }

  /** The staff member's own shifts across venues. */
  async myShifts(userId: string) {
    const user = await this.repo.user(userId);
    if (!user) throw notFound('not_found');
    const memberships = await this.repo.membershipsOf(user);
    return (await this.repo.shiftsOfMembers(memberships.map((m) => m.id))).map(presentShift);
  }

  /** Confirm, decline or ask for a swap: the assigned person, the owner or an admin. */
  async respond(userId: string, shiftId: string, response: string, reason = '') {
    const user = await this.repo.user(userId);
    if (!user) throw notFound('not_found');
    const status = response.trim().toUpperCase();
    if (!SHIFT_RESPONSES.includes(status)) throw badRequest('bad_request');
    const s = await this.repo.shift(shiftId);
    if (!s) throw notFound('not_found');
    const m = await this.repo.member(s.staffId);
    const assigned = Boolean(m && (m.userId === userId || m.email.toLowerCase() === user.email.toLowerCase()));
    if (!assigned && user.role !== 'admin' && !(await this.access.ownerCanManage(userId, s.venueId))) throw forbidden();
    return presentShift(await this.repo.updateShift(shiftId, { status, ...(reason.trim() ? { reason: reason.trim() } : {}), updatedAt: this.now() }));
  }
}
