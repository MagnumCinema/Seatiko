// Where a person works, as Twenty's People show it: the Company link and the Job Title.
// Owners work at their restaurant (Twenty's People → Company holds one company, so a
// published venue first, then the earliest application); staff with active access at the
// restaurant they were added to. A restaurant that is not published yet is still its
// application: staff of it point at the application id.

export type WorkplaceApplication = { id: string; ownerUserId: string; venueId: string | null; status: string; createdAt: string };
export type WorkplaceStaff = { userId: string; venueId: string; role: string; status: string; createdAt: string };
export type Workplace = { applicationId: string; jobTitle: string };

export const JOB_TITLES: Record<string, string> = { owner: 'Владелец', waiter: 'Официант', cook: 'Повар' };

const earlier = (a: { createdAt: string; id?: string }, b: { createdAt: string; id?: string }) =>
  a.createdAt < b.createdAt || (a.createdAt === b.createdAt && (a.id ?? '') < (b.id ?? ''));

/** User id → workplace. Owners win over a staff membership of the same person. */
export function workplaces(apps: WorkplaceApplication[], staff: WorkplaceStaff[]): Map<string, Workplace> {
  const result = new Map<string, Workplace>();

  const best = new Map<string, WorkplaceApplication>();
  for (const a of apps) {
    const cur = best.get(a.ownerUserId);
    const pub = a.status === 'PUBLISHED';
    const curPub = cur?.status === 'PUBLISHED';
    if (!cur || (pub && !curPub) || (pub === curPub && earlier(a, cur))) best.set(a.ownerUserId, a);
  }
  for (const [userId, app] of best) result.set(userId, { applicationId: app.id, jobTitle: JOB_TITLES.owner });

  const byVenue = new Map<string, WorkplaceApplication>();
  for (const a of apps) {
    byVenue.set(a.id, a);
    if (a.venueId) byVenue.set(a.venueId, a);
  }
  const active = staff.filter((s) => s.status === 'ACTIVE' && s.userId).sort((a, b) => (earlier(a, b) ? -1 : 1));
  for (const s of active) {
    if (result.has(s.userId)) continue;
    const app = byVenue.get(s.venueId);
    if (!app) continue; // a venue without an application (seed / open data) is not in the CRM
    result.set(s.userId, { applicationId: app.id, jobTitle: JOB_TITLES[s.role] ?? JOB_TITLES.waiter });
  }
  return result;
}
