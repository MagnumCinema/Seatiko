"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { createPortal } from "react-dom";
import { useLocale } from "@/components/locale-provider";
import { CabinetRolesCard } from "@/components/cabinet-roles";
import { CabinetReports } from "@/components/cabinet-reports";
import { SelectMenu } from "@/components/ui/select-menu";
import {
  assignVenueStaffRole,
  deleteVenueWorkShift,
  inviteVenueStaff,
  listVenueRoles,
  listVenueStaff,
  listVenueWorkShifts,
  removeVenueStaff,
  swapVenueWorkShiftStaff,
  toggleVenueStaffShift,
  type StaffMember,
  type VenueRole,
  type WorkShift,
} from "@/lib/api";
import { dayKey, intlLocale, minutesIntoDay, VENUE_TIME_ZONE } from "@/lib/cabinet-bookings";
import {
  defaultInviteRole,
  fillTemplate as fill,
  filterTeam,
  inviteProblem,
  findMemberByEmail,
  memberInitials,
  memberName,
  memberStatus,
  relinkInvite,
  removeMember,
  shiftsToday,
  sortTeam,
  teamCounts,
  upcomingShiftsOf,
  type InviteProblem,
  type TeamApi,
  type TeamFilters,
  type TeamStatusFilter,
} from "@/lib/cabinet-team";
import { getSiteCopy } from "@/lib/site-copy";
import { useDialogFocus } from "@/lib/use-dialog-focus";
import { roleColor, roleLabel, roleNameByKey, sortRoles } from "@/lib/venue-roles";
import "@/app/cabinet/staff.css";

type View = "staff" | "roles" | "reports";
const VIEWS: View[] = ["staff", "roles", "reports"];
/** "info" stays until closed: it carries a next step for the owner. */
type Notice = { kind: "success" | "info" | "error"; text: string };

/** Toolbar (search and filters) shows once the team is big enough to need it. */
const TOOLBAR_FROM = 4;

/**
 * «Команда и отчёты»: the team (invite, roles, on-shift mark, removal), the venue roles and
 * the reports. The view survives a venue switch; everything else starts over for the new venue.
 */
export function CabinetStaffPanel({ venueId }: { venueId: string }) {
  const [view, setView] = useState<View>("staff");
  return <TeamPanel key={venueId} venueId={venueId} view={view} onView={setView} />;
}

function TeamPanel({ venueId, view, onView }: { venueId: string; view: View; onView: (v: View) => void }) {
  const { locale } = useLocale();
  const site = getSiteCopy(locale);
  const cabinet = site.cabinet;
  const t = cabinet.team;
  const presetNames = cabinet.roles.presets as Record<string, string>;
  const baseId = useId();

  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [roles, setRoles] = useState<VenueRole[]>([]);
  const [venueType, setVenueType] = useState("");
  const [suggested, setSuggested] = useState<string[]>([]);
  const [shifts, setShifts] = useState<WorkShift[] | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [notice, setNotice] = useState<Notice | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(async () => {
    const [members, roleData, shiftList] = await Promise.all([
      listVenueStaff(venueId),
      listVenueRoles(venueId),
      // The team still opens when the schedule is unavailable; only today's shift goes missing.
      listVenueWorkShifts(venueId).catch(() => null),
    ]);
    setStaff(members);
    setRoles(roleData.roles);
    setVenueType(roleData.venue_type);
    setSuggested(roleData.suggested);
    setShifts(shiftList);
    setNow(Date.now());
  }, [venueId]);

  const firstLoad = useCallback(() => {
    setState("loading");
    load()
      .then(() => setState("ready"))
      .catch(() => setState("error"));
  }, [load]);

  useEffect(() => {
    const timer = window.setTimeout(firstLoad, 0);
    return () => window.clearTimeout(timer);
  }, [firstLoad]);

  // "Today" and today's shifts follow the clock when the cabinet stays open.
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  // Success notices fade; info and errors stay until closed.
  useEffect(() => {
    if (notice?.kind !== "success") return;
    const timer = window.setTimeout(() => setNotice(null), 6000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const counts = useMemo(() => teamCounts(staff), [staff]);

  function onTabKey(event: ReactKeyboardEvent<HTMLDivElement>) {
    const index = VIEWS.indexOf(view);
    let next = -1;
    if (event.key === "ArrowRight") next = (index + 1) % VIEWS.length;
    else if (event.key === "ArrowLeft") next = (index - 1 + VIEWS.length) % VIEWS.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = VIEWS.length - 1;
    if (next < 0) return;
    event.preventDefault();
    onView(VIEWS[next]);
    document.getElementById(`${baseId}-tab-${VIEWS[next]}`)?.focus();
  }

  const viewCount: Partial<Record<View, number>> = state === "ready" ? { staff: staff.length, roles: roles.length } : {};

  return (
    <div className="cs-panel">
      <div className="cb-view cs-views" role="tablist" aria-label={t.viewsLabel} onKeyDown={onTabKey}>
        {VIEWS.map((v) => (
          <button
            key={v}
            id={`${baseId}-tab-${v}`}
            type="button"
            role="tab"
            aria-selected={view === v}
            aria-controls={`${baseId}-panel`}
            tabIndex={view === v ? 0 : -1}
            className={view === v ? "active" : ""}
            onClick={() => onView(v)}
          >
            {t.views[v]}
            {viewCount[v] !== undefined && <b>{viewCount[v]}</b>}
          </button>
        ))}
      </div>

      {notice && (
        <div
          className={`owner-notice ${notice.kind}`}
          role={notice.kind === "error" ? "alert" : "status"}
          aria-live="polite"
        >
          <span aria-hidden="true">{notice.kind === "error" ? "!" : notice.kind === "info" ? "i" : "✓"}</span>
          <p>{notice.text}</p>
          <button type="button" aria-label={t.close} onClick={() => setNotice(null)}>
            ×
          </button>
        </div>
      )}

      <div id={`${baseId}-panel`} role="tabpanel" aria-labelledby={`${baseId}-tab-${view}`} className="cs-view">
        {state === "loading" && (
          <div className="owner-section-empty" role="status">
            <span className="owner-inline-spinner" aria-hidden="true" />
            <p>{t.loading}</p>
          </div>
        )}
        {state === "error" && (
          <div className="owner-section-empty" role="alert">
            <h3>{t.loadFailed}</h3>
            <button type="button" className="panel-btn" onClick={firstLoad}>
              {t.retry}
            </button>
          </div>
        )}
        {state === "ready" && view === "staff" && (
          <TeamView
            venueId={venueId}
            staff={staff}
            roles={roles}
            shifts={shifts}
            now={now}
            counts={counts}
            presetNames={presetNames}
            shiftsTabName={cabinet.shifts}
            setStaff={setStaff}
            reload={load}
            notify={setNotice}
          />
        )}
        {state === "ready" && view === "roles" && (
          <CabinetRolesCard
            venueId={venueId}
            roles={roles}
            staff={staff}
            venueType={venueType}
            suggested={suggested}
            onChanged={load}
          />
        )}
        {state === "ready" && view === "reports" && (
          <CabinetReports venueId={venueId} staff={staff} roles={roles} shifts={shifts} presetNames={presetNames} />
        )}
      </div>
    </div>
  );
}

type TeamViewProps = {
  venueId: string;
  staff: StaffMember[];
  roles: VenueRole[];
  shifts: WorkShift[] | null;
  now: number;
  counts: { all: number; onShift: number; invited: number };
  presetNames: Record<string, string>;
  shiftsTabName: string;
  setStaff: (update: (prev: StaffMember[]) => StaffMember[]) => void;
  reload: () => Promise<void>;
  notify: (notice: Notice | null) => void;
};

const EMPTY_FILTERS: TeamFilters = { query: "", role: "all", status: "all" };

function TeamView({ venueId, staff, roles, shifts, now, counts, presetNames, shiftsTabName, setStaff, reload, notify }: TeamViewProps) {
  const { locale } = useLocale();
  const t = getSiteCopy(locale).cabinet.team;
  const [formOpen, setFormOpen] = useState(false);
  const [filters, setFilters] = useState<TeamFilters>(EMPTY_FILTERS);
  const [busyIds, setBusyIds] = useState<Set<string>>(() => new Set());
  const [removing, setRemoving] = useState<StaffMember | null>(null);

  const today = dayKey(now, VENUE_TIME_ZONE);
  const nowMin = minutesIntoDay(now, today, VENUE_TIME_ZONE);
  const orderedRoles = useMemo(() => sortRoles(roles), [roles]);
  const visible = useMemo(() => filterTeam(staff, filters), [staff, filters]);
  const filtered = filters.query.trim() !== "" || filters.role !== "all" || filters.status !== "all";
  const dateFormat = useMemo(
    () => new Intl.DateTimeFormat(intlLocale(locale), { day: "numeric", month: "short", timeZone: VENUE_TIME_ZONE }),
    [locale],
  );

  const api: TeamApi = useMemo(
    () => ({
      invite: (email, name, role) => inviteVenueStaff(venueId, email, name, role),
      remove: (id) => removeVenueStaff(venueId, id),
      swapShift: (shiftId, staffId) => swapVenueWorkShiftStaff(venueId, shiftId, staffId),
      deleteShift: (shiftId) => deleteVenueWorkShift(venueId, shiftId),
    }),
    [venueId],
  );

  function setBusy(id: string, on: boolean) {
    setBusyIds((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  const roleOptions = (current?: string) => [
    ...(current && !roles.some((r) => r.key === current)
      ? [{ value: current, label: roleNameByKey(current, roles, presetNames), color: roleColor(current, roles) }]
      : []),
    ...orderedRoles.map((r) => ({ value: r.key, label: roleLabel(r, presetNames), color: r.color || "#64748b" })),
  ];

  async function changeRole(member: StaffMember, role: string) {
    if (role === member.role) return;
    const name = memberName(member);
    setBusy(member.id, true);
    setStaff((prev) => prev.map((m) => (m.id === member.id ? { ...m, role } : m)));
    try {
      const updated = await assignVenueStaffRole(venueId, member.id, role);
      setStaff((prev) => sortTeam(prev.map((m) => (m.id === member.id ? { ...m, role: updated.role } : m)), roles));
      notify({ kind: "success", text: fill(t.roleChanged, { name, role: roleNameByKey(updated.role, roles, presetNames) }) });
      // Upcoming shifts follow the new role on the server; refresh them quietly.
      void reload().catch(() => {});
    } catch {
      setStaff((prev) => prev.map((m) => (m.id === member.id ? { ...m, role: member.role } : m)));
      notify({ kind: "error", text: t.actionFailed });
    } finally {
      setBusy(member.id, false);
    }
  }

  async function toggleOnShift(member: StaffMember, on: boolean) {
    const name = memberName(member);
    setBusy(member.id, true);
    setStaff((prev) => prev.map((m) => (m.id === member.id ? { ...m, on_shift: on } : m)));
    try {
      const updated = await toggleVenueStaffShift(venueId, member.id, on);
      setStaff((prev) => prev.map((m) => (m.id === member.id ? { ...m, on_shift: updated.on_shift } : m)));
      notify({ kind: "success", text: fill(on ? t.onShiftOn : t.onShiftOff, { name }) });
    } catch {
      setStaff((prev) => prev.map((m) => (m.id === member.id ? { ...m, on_shift: member.on_shift } : m)));
      notify({ kind: "error", text: t.actionFailed });
    } finally {
      setBusy(member.id, false);
    }
  }

  async function recheck(member: StaffMember) {
    setBusy(member.id, true);
    notify(null);
    try {
      const ahead = shifts ? upcomingShiftsOf(shifts, member.id, today, nowMin) : [];
      const result = await relinkInvite(api, member, ahead);
      if (result.kind === "still_invited") {
        notify({ kind: "info", text: fill(t.recheckStill, { email: member.email }) });
        return;
      }
      await reload().catch(() => {});
      const parts = [fill(t.recheckLinked, { email: member.email })];
      if (result.moved) parts.push(fill(t.recheckMoved, { count: result.moved }));
      if (result.failed) parts.push(fill(t.recheckMoveFailed, { count: result.failed, shifts: shiftsTabName }));
      notify({ kind: result.failed ? "error" : "success", text: parts.join(" ") });
    } catch {
      notify({ kind: "error", text: t.actionFailed });
      void reload().catch(() => {});
    } finally {
      setBusy(member.id, false);
    }
  }

  return (
    <section className="owner-card cs-card" aria-labelledby="cs-team-title">
      <div className="cs-card-head cs-team-head">
        <div>
          <h3 id="cs-team-title">{t.title}</h3>
          <p className="cs-summary">
            <span>{fill(t.summaryTeam, { count: counts.all })}</span>
            <span>{fill(t.summaryOnShift, { count: counts.onShift })}</span>
            {counts.invited > 0 && <span>{fill(t.summaryInvited, { count: counts.invited })}</span>}
          </p>
        </div>
        {!formOpen && staff.length > 0 && (
          <button type="button" className="panel-btn cs-btn" onClick={() => setFormOpen(true)}>
            <PlusIcon />
            {t.add}
          </button>
        )}
      </div>

      {formOpen && (
        <InviteForm
          staff={staff}
          roles={roles}
          presetNames={presetNames}
          onCancel={() => setFormOpen(false)}
          onInvite={async (email, name, role) => {
            const created = await inviteVenueStaff(venueId, email, name, role);
            setStaff((prev) => sortTeam([...prev, created], roles));
            setFormOpen(false);
            notify(
              created.status === "ACTIVE"
                ? { kind: "success", text: fill(t.addedActive, { name: memberName(created) }) }
                : { kind: "info", text: fill(t.addedInvited, { email: created.email }) },
            );
          }}
        />
      )}

      {staff.length === 0 ? (
        !formOpen && (
          <div className="owner-section-empty cs-empty">
            <span aria-hidden="true">
              <TeamIcon />
            </span>
            <h3>{t.emptyTitle}</h3>
            <p>{t.emptyBody}</p>
            <button type="button" className="panel-btn cs-btn" onClick={() => setFormOpen(true)}>
              <PlusIcon />
              {t.add}
            </button>
          </div>
        )
      ) : (
        <>
          {staff.length >= TOOLBAR_FROM && (
            <TeamToolbar
              filters={filters}
              onFilters={setFilters}
              counts={counts}
              roleOptions={[{ value: "all", label: t.allRoles }, ...roleOptions().filter((o) => staff.some((m) => m.role === o.value))]}
            />
          )}
          {visible.length === 0 ? (
            <div className="owner-section-empty cs-empty">
              <h3>{t.noMatchTitle}</h3>
              <p>{t.noMatchBody}</p>
              {filtered && (
                <button type="button" className="panel-btn ghost" onClick={() => setFilters(EMPTY_FILTERS)}>
                  {t.resetFilters}
                </button>
              )}
            </div>
          ) : (
            <ul className="cs-list">
              {visible.map((member) => {
                const name = memberName(member);
                const status = memberStatus(member);
                const busy = busyIds.has(member.id);
                const todays = shifts ? shiftsToday(shifts, member.id, today) : null;
                const color = roleColor(member.role, roles);
                return (
                  <li key={member.id} className={`cs-row is-${status}`} aria-busy={busy || undefined}>
                    <span className="cs-avatar" style={{ "--role-color": color } as CSSProperties} aria-hidden="true">
                      {memberInitials(member)}
                    </span>
                    <div className="cs-person">
                      <strong title={name}>{name}</strong>
                      <a href={`mailto:${member.email}`} title={fill(t.writeTo, { name })}>
                        {member.email}
                      </a>
                      {status === "invited" && Number.isFinite(Date.parse(member.created_at)) && (
                        <small>{fill(t.invitedSince, { date: dateFormat.format(new Date(member.created_at)) })}</small>
                      )}
                    </div>
                    <div className="cs-role">
                      <SelectMenu
                        size="compact"
                        value={member.role}
                        disabled={busy}
                        ariaLabel={fill(t.roleOf, { name })}
                        onChange={(next) => void changeRole(member, next)}
                        options={roleOptions(member.role)}
                      />
                    </div>
                    {status === "invited" ? (
                      <p className="cs-today">
                        <span className="cs-pill">{t.invitedPill}</span>
                      </p>
                    ) : (
                      <p className="cs-today">
                        <ClockIcon />
                        <span>
                          {todays === null
                            ? "—"
                            : todays.length
                              ? fill(t.todayShift, { time: todays.map((s) => `${s.start_time}–${s.end_time}`).join(", ") })
                              : t.noShiftToday}
                        </span>
                      </p>
                    )}
                    <div className="cs-state">
                      {status === "invited" ? (
                        <button
                          type="button"
                          className="panel-btn ghost sm cs-btn"
                          disabled={busy}
                          title={t.recheckHint}
                          aria-label={`${t.recheck}: ${name}`}
                          onClick={() => void recheck(member)}
                        >
                          {t.recheck}
                        </button>
                      ) : (
                        <label className="cabinet-role-switch cs-switch" title={t.onShiftHint}>
                          <input
                            type="checkbox"
                            role="switch"
                            aria-label={`${t.onShift}: ${name}`}
                            checked={status === "on_shift"}
                            disabled={busy}
                            onChange={(e) => void toggleOnShift(member, e.target.checked)}
                          />
                          <span className="cabinet-role-switch-track" aria-hidden="true" />
                          <span className="cabinet-role-switch-label">{t.onShift}</span>
                        </label>
                      )}
                    </div>
                    <button
                      type="button"
                      className="cb-icon-btn cs-remove"
                      disabled={busy}
                      aria-label={fill(t.removeLabel, { name })}
                      title={fill(t.removeLabel, { name })}
                      onClick={() => setRemoving(member)}
                    >
                      <TrashIcon />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}

      <RemoveDialog
        key={removing?.id ?? "closed"}
        member={removing}
        shiftsAhead={removing && shifts ? upcomingShiftsOf(shifts, removing.id, today, nowMin) : []}
        onCancel={() => setRemoving(null)}
        onConfirm={async (member, shiftIds) => {
          const name = memberName(member);
          const result = await removeMember(api, member, shiftIds);
          setStaff((prev) => prev.filter((m) => m.id !== member.id));
          setRemoving(null);
          const parts = [fill(t.removed, { name })];
          if (result.deletedShifts) parts.push(fill(t.removedShifts, { count: result.deletedShifts }));
          if (result.failedShifts) parts.push(fill(t.removedShiftsFailed, { count: result.failedShifts, shifts: shiftsTabName }));
          notify({ kind: result.failedShifts ? "error" : "success", text: parts.join(" ") });
          void reload().catch(() => {});
        }}
        onError={() => notify({ kind: "error", text: t.actionFailed })}
      />
    </section>
  );
}

function TeamToolbar({
  filters,
  onFilters,
  counts,
  roleOptions,
}: {
  filters: TeamFilters;
  onFilters: (f: TeamFilters) => void;
  counts: { all: number; onShift: number; invited: number };
  roleOptions: { value: string; label: string; color?: string }[];
}) {
  const { locale } = useLocale();
  const t = getSiteCopy(locale).cabinet.team;
  const chips: { id: TeamStatusFilter; label: string; count: number }[] = [
    { id: "all", label: t.filterAll, count: counts.all },
    { id: "on_shift", label: t.filterOnShift, count: counts.onShift },
    ...(counts.invited > 0 || filters.status === "invited"
      ? [{ id: "invited" as const, label: t.filterInvited, count: counts.invited }]
      : []),
  ];
  return (
    <div className="cs-toolbar">
      <div className="cb-search cs-search">
        <SearchIcon />
        <input
          type="search"
          value={filters.query}
          placeholder={t.searchPlaceholder}
          aria-label={t.searchLabel}
          onChange={(e) => onFilters({ ...filters, query: e.target.value })}
        />
        {filters.query && (
          <button type="button" aria-label={t.clearSearch} onClick={() => onFilters({ ...filters, query: "" })}>
            ×
          </button>
        )}
      </div>
      <div className="cb-chips cs-chips" role="group" aria-label={t.statusFilterLabel}>
        {chips.map((chip) => (
          <button
            key={chip.id}
            type="button"
            aria-pressed={filters.status === chip.id}
            className={filters.status === chip.id ? "active" : ""}
            onClick={() => onFilters({ ...filters, status: chip.id })}
          >
            {chip.label}
            <b>{chip.count}</b>
          </button>
        ))}
      </div>
      {roleOptions.length > 2 && (
        <SelectMenu
          className="cs-role-filter"
          value={filters.role}
          ariaLabel={t.roleFilterLabel}
          onChange={(role) => onFilters({ ...filters, role })}
          options={roleOptions}
        />
      )}
    </div>
  );
}

function InviteForm({
  staff,
  roles,
  presetNames,
  onCancel,
  onInvite,
}: {
  staff: StaffMember[];
  roles: VenueRole[];
  presetNames: Record<string, string>;
  onCancel: () => void;
  onInvite: (email: string, name: string, role: string) => Promise<void>;
}) {
  const { locale } = useLocale();
  const t = getSiteCopy(locale).cabinet.team;
  const id = useId();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState(() => defaultInviteRole(roles));
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    nameRef.current?.focus();
  }, []);

  const problem: InviteProblem | null = inviteProblem(email, staff);
  // An empty field only complains after a submit; a typed one as soon as it is wrong.
  const shown = touched || (problem !== "empty" && email.includes("@")) ? problem : null;
  const duplicate = problem === "duplicate" ? findMemberByEmail(staff, email) : undefined;
  const errorText =
    shown === "empty"
      ? t.errEmailEmpty
      : shown === "invalid"
        ? t.errEmailInvalid
        : shown === "duplicate" && duplicate
          ? fill(t.errDuplicate, { name: memberName(duplicate) })
          : "";

  async function submit() {
    setTouched(true);
    setFailed(false);
    if (problem) {
      emailRef.current?.focus();
      return;
    }
    setBusy(true);
    try {
      await onInvite(email.trim(), name.trim().replace(/\s+/g, " "), role);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      className="cs-invite"
      aria-labelledby={`${id}-title`}
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape" && !busy) onCancel();
      }}
    >
      <h4 id={`${id}-title`}>{t.formTitle}</h4>
      <div className="cs-invite-grid">
        <div className="cs-field">
          <label htmlFor={`${id}-name`}>{t.nameLabel}</label>
          <input
            ref={nameRef}
            id={`${id}-name`}
            className="cabinet-staff-input"
            value={name}
            maxLength={80}
            autoComplete="off"
            placeholder={t.namePlaceholder}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="cs-field">
          <label htmlFor={`${id}-email`}>{t.emailLabel}</label>
          <input
            ref={emailRef}
            id={`${id}-email`}
            className="cabinet-staff-input"
            type="email"
            inputMode="email"
            autoComplete="off"
            value={email}
            maxLength={120}
            placeholder={t.emailPlaceholder}
            aria-invalid={Boolean(errorText)}
            aria-describedby={`${id}-email-error`}
            onChange={(e) => setEmail(e.target.value)}
            onBlur={() => email.trim() && setTouched(true)}
          />
          <small id={`${id}-email-error`} className="cs-field-error" aria-live="polite">
            {errorText}
          </small>
        </div>
        <div className="cs-field">
          <span id={`${id}-role`} className="cs-label">
            {t.roleLabel}
          </span>
          <SelectMenu
            value={role}
            onChange={setRole}
            ariaLabelledBy={`${id}-role`}
            options={sortRoles(roles).map((r) => ({ value: r.key, label: roleLabel(r, presetNames), color: r.color || "#64748b" }))}
          />
        </div>
      </div>
      <p className="cs-hint">{t.formHint}</p>
      {failed && (
        <p className="cs-field-error" role="alert">
          {t.actionFailed}
        </p>
      )}
      <div className="cs-invite-actions">
        <button type="submit" className="panel-btn cs-btn" disabled={busy}>
          {t.submit}
        </button>
        <button type="button" className="panel-btn ghost cs-btn" disabled={busy} onClick={onCancel}>
          {t.cancel}
        </button>
      </div>
    </form>
  );
}

function RemoveDialog({
  member,
  shiftsAhead,
  onCancel,
  onConfirm,
  onError,
}: {
  member: StaffMember | null;
  shiftsAhead: WorkShift[];
  onCancel: () => void;
  onConfirm: (member: StaffMember, shiftIds: string[]) => Promise<void>;
  onError: () => void;
}) {
  const { locale } = useLocale();
  const t = getSiteCopy(locale).cabinet.team;
  const ref = useRef<HTMLElement>(null);
  const [dropShifts, setDropShifts] = useState(true);
  const [busy, setBusy] = useState(false);
  const close = useCallback(() => {
    if (!busy) onCancel();
  }, [busy, onCancel]);
  useDialogFocus(Boolean(member), ref, close);

  useEffect(() => {
    if (!member) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [member]);

  if (!member || typeof document === "undefined") return null;
  const name = memberName(member);

  async function confirm() {
    if (!member) return;
    setBusy(true);
    try {
      await onConfirm(member, dropShifts ? shiftsAhead.map((s) => s.id) : []);
    } catch {
      onError();
    } finally {
      setBusy(false);
    }
  }

  return createPortal(
    <div className="booking-popup-root cabinet-delete-modal-root" role="presentation">
      <button type="button" className="booking-popup-backdrop" aria-label={t.cancel} onClick={close} />
      <section
        ref={ref}
        className="booking-popup cabinet-delete-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="cs-remove-title"
        aria-describedby="cs-remove-text"
      >
        <div className="booking-popup-card cabinet-delete-card danger cs-remove-card">
          <button type="button" className="booking-popup-x" onClick={close} aria-label={t.cancel}>
            ×
          </button>
          <div className="cabinet-delete-icon" aria-hidden="true">
            <TrashIcon size={24} />
          </div>
          <h3 id="cs-remove-title">{fill(t.removeTitle, { name })}</h3>
          <p id="cs-remove-text" className="cabinet-delete-text">
            {t.removeBody}
          </p>
          {shiftsAhead.length > 0 && (
            <div className="cs-remove-shifts">
              <label className="cs-check">
                <input type="checkbox" checked={dropShifts} onChange={(e) => setDropShifts(e.target.checked)} />
                <span>{fill(t.removeShifts, { count: shiftsAhead.length })}</span>
              </label>
              {!dropShifts && <p>{t.removeShiftsKeep}</p>}
            </div>
          )}
          <div className="cabinet-delete-actions">
            <button type="button" className="panel-btn danger" disabled={busy} onClick={() => void confirm()}>
              {t.removeConfirm}
            </button>
            <button type="button" className="panel-btn ghost" data-autofocus disabled={busy} onClick={close}>
              {t.cancel}
            </button>
          </div>
        </div>
      </section>
    </div>,
    document.body,
  );
}

function PlusIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

function TrashIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 6h18" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <path d="M10 11v6M14 11v6" />
    </svg>
  );
}

function TeamIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}
