"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { PanelShell } from "@/components/panel-shell";
import { useLocale } from "@/components/locale-provider";
import { StaffBookingsTab } from "@/components/staff-bookings";
import { StaffCallsTab } from "@/components/staff-calls";
import {
  actionErrorText,
  fill,
  StaffDayBar,
  StaffEmpty,
  useNow,
  useStaffFloor,
  type StaffCopy,
} from "@/components/staff-live";
import { StaffOrdersTab } from "@/components/staff-orders";
import { StaffShiftsPanel } from "@/components/staff-shifts";
import { StaffWaitlistTab, type NewWalkIn } from "@/components/staff-waitlist";
import {
  ApiError,
  fetchMe,
  fetchVenue,
  fetchVenues,
  getToken,
  listMyApplications,
  listMyStaffShifts,
  pickLocale,
  redirectPathForRole,
  staffAcceptWaiterCall,
  staffAddWaitlist,
  staffAgeCheckOrder,
  staffCloseWaitlist,
  staffCompleteWaiterCall,
  staffNotifyWaitlist,
  staffSeatWaitlist,
  staffUpdateOrder,
  type LocaleCode,
  type LocalizedString,
  type User,
  type WorkShift,
} from "@/lib/api";
import { dayKey, formatClock, intlLocale, venueRules, VENUE_TIME_ZONE } from "@/lib/cabinet-bookings";
import { formatDate } from "@/components/shift-ui";
import {
  bookingsOfDay,
  bookingTables,
  callBoard,
  isStaffTab,
  myShift,
  openOrderCount,
  orderBoard,
  orderTables,
  queueBoard,
  sessionTables,
  shiftVenueIds,
  staffBookings,
  STAFF_TABS,
  tableNumbers,
  type StaffTab,
} from "@/lib/staff-floor";
import { getSiteCopy } from "@/lib/site-copy";
import { addDays, shiftSpan, todayInZone } from "@/lib/shift-schedule";
import { shiftRoleLabel } from "@/lib/venue-roles";
import "./staff.css";

type PanelRole = "staff" | "restaurant" | "admin";
type StaffVenue = { id: string; name: LocalizedString | string };

const PANEL_ROLES: PanelRole[] = ["staff", "restaurant", "admin"];
const VENUE_KEY = "fa_staff_venue";
const NOTICE_MS = 4_000;

function readStoredVenue(): string {
  try {
    return localStorage.getItem(VENUE_KEY) ?? "";
  } catch {
    return "";
  }
}

function storeVenue(id: string) {
  try {
    localStorage.setItem(VENUE_KEY, id);
  } catch {
    /* private mode: the URL still keeps the venue */
  }
}

/**
 * Venues the person can open the panel for. The API has no such list yet (backend task №36):
 * an owner's published venues, an admin's city, and for everyone the venues of their own shifts
 * and the one asked for in `?venue=`. A venue they cannot work answers 403 and says so.
 */
async function resolveVenues(role: PanelRole, shifts: WorkShift[], requested: string): Promise<StaffVenue[]> {
  const out: StaffVenue[] = [];
  const add = (venue: StaffVenue) => {
    if (venue.id && !out.some((v) => v.id === venue.id)) out.push(venue);
  };
  if (role === "restaurant") {
    const apps = await listMyApplications().catch(() => []);
    for (const app of apps) if (app.venue_id) add({ id: app.venue_id, name: app.name });
  } else if (role === "admin") {
    const all = await fetchVenues().catch(() => []);
    for (const venue of all) add({ id: venue.id, name: venue.name });
  }
  const extra = [...shiftVenueIds(shifts, Date.now()), requested].filter((id) => id && !out.some((v) => v.id === id));
  const found = await Promise.all(extra.map((id) => fetchVenue(id).catch(() => null)));
  for (const venue of found) if (venue) add({ id: venue.id, name: venue.name });
  return out;
}

function initials(user: User): string {
  const first = user.first_name?.trim() ?? "";
  const last = user.last_name?.trim() ?? "";
  if (first && last) return `${first[0]}${last[0]}`.toUpperCase();
  const name = user.display_name?.trim() || user.email;
  return name.slice(0, 2).toUpperCase();
}

const displayName = (user: User) => user.display_name?.trim() || `${user.first_name ?? ""} ${user.last_name ?? ""}`.trim() || user.email;

/* ---------- Icons ---------- */

const icon = (path: React.ReactNode) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {path}
  </svg>
);
const TAB_ICONS: Record<StaffTab, React.ReactNode> = {
  calls: icon(
    <>
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </>,
  ),
  orders: icon(
    <>
      <path d="M4 2v20l3-2 3 2 2-2 2 2 3-2 3 2V2l-3 2-3-2-2 2-2-2-3 2z" />
      <path d="M8 9h8M8 13h6" />
    </>,
  ),
  waitlist: icon(
    <>
      <circle cx="9" cy="7" r="3" />
      <path d="M3 21v-1a6 6 0 0 1 12 0v1" />
      <path d="M17 11h4M17 15h4M19 7h2" />
    </>,
  ),
  bookings: icon(
    <>
      <rect width="18" height="18" x="3" y="4" rx="2" />
      <path d="M16 2v4M8 2v4M3 10h18" />
      <path d="m9 16 2 2 4-4" />
    </>,
  ),
  shifts: icon(
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>,
  ),
};

function AlertIcon() {
  return icon(
    <>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 8v4M12 16h.01" />
    </>,
  );
}

/* ---------- Page ---------- */

export default function StaffPage() {
  const router = useRouter();
  const { locale } = useLocale();
  const site = getSiteCopy(locale);
  const copy = site.staff;
  const [user, setUser] = useState<User | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [venues, setVenues] = useState<StaffVenue[] | null>(null);
  const [venueId, setVenueId] = useState("");
  const [tab, setTab] = useState<StaffTab>("calls");
  const [shifts, setShifts] = useState<WorkShift[]>([]);
  const [shiftsFailed, setShiftsFailed] = useState(false);

  const reloadShifts = useCallback(async () => {
    try {
      setShifts(await listMyStaffShifts());
      setShiftsFailed(false);
    } catch {
      setShiftsFailed(true);
    }
  }, []);

  const load = useCallback(async () => {
    if (!getToken()) {
      router.replace("/login?next=/staff");
      return;
    }
    try {
      const me = await fetchMe();
      const role = String(me.role) as PanelRole;
      if (!PANEL_ROLES.includes(role)) {
        router.replace(redirectPathForRole(me.role));
        return;
      }
      const params = new URLSearchParams(window.location.search);
      const requested = params.get("venue") ?? "";
      const requestedTab = params.get("tab");
      const shiftList = await listMyStaffShifts().catch(() => null);
      const list = await resolveVenues(role, shiftList ?? [], requested);
      const stored = readStoredVenue();
      const pick = [requested, stored].find((id) => id && list.some((v) => v.id === id)) ?? list[0]?.id ?? "";
      setUser(me);
      setShifts(shiftList ?? []);
      setShiftsFailed(shiftList === null);
      setVenues(list);
      setVenueId(pick);
      setTab(isStaffTab(requestedTab) ? requestedTab : pick ? "calls" : "shifts");
      setLoadFailed(false);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        router.replace("/login?next=/staff");
        return;
      }
      setLoadFailed(true);
    }
  }, [router]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  // The URL keeps the venue and tab, so a reload or a shared link opens the same screen.
  useEffect(() => {
    if (!user) return;
    const params = new URLSearchParams();
    if (venueId) params.set("venue", venueId);
    if (tab !== "calls") params.set("tab", tab);
    const query = params.toString();
    window.history.replaceState(window.history.state, "", query ? `/staff?${query}` : "/staff");
  }, [user, venueId, tab]);

  return (
    <PanelShell title={copy.title} subtitle={copy.subtitle} email={user?.email}>
      {loadFailed ? (
        <StaffEmpty
          icon={<AlertIcon />}
          title={copy.loadFailed}
          hint={copy.loadFailedHint}
          action={
            <button type="button" className="btn btn--primary btn--md" onClick={() => void load()}>
              {copy.retry}
            </button>
          }
        />
      ) : !user || !venues ? (
        <div className="owner-dashboard sf-dashboard" aria-busy="true">
          <aside className="owner-sidebar">
            <div className="sf-skeleton" />
          </aside>
          <main className="owner-content">
            <p className="sf-loading">{copy.loading}</p>
          </main>
        </div>
      ) : (
        <StaffDashboard
          key={venueId || "none"}
          copy={copy}
          locale={locale}
          user={user}
          venues={venues}
          venueId={venueId}
          onVenue={(id) => {
            setVenueId(id);
            if (tab === "shifts") setTab("calls");
          }}
          tab={tab}
          onTab={setTab}
          shifts={shifts}
          shiftsFailed={shiftsFailed}
          onReloadShifts={reloadShifts}
        />
      )}
    </PanelShell>
  );
}

/* ---------- Dashboard of one venue ---------- */

function StaffDashboard({
  copy,
  locale,
  user,
  venues,
  venueId,
  onVenue,
  tab,
  onTab,
  shifts,
  shiftsFailed,
  onReloadShifts,
}: {
  copy: StaffCopy;
  locale: LocaleCode;
  user: User;
  venues: StaffVenue[];
  venueId: string;
  onVenue: (id: string) => void;
  tab: StaffTab;
  onTab: (tab: StaffTab) => void;
  shifts: WorkShift[];
  shiftsFailed: boolean;
  onReloadShifts: () => Promise<void>;
}) {
  const site = getSiteCopy(locale);
  const bcopy = site.cabinet.bookings;
  const presetNames = site.cabinet.roles.presets as Record<string, string>;
  const role = String(user.role) as PanelRole;
  const floor = useStaffFloor(venueId, role === "restaurant");
  const now = useNow();
  const [notice, setNotice] = useState<{ tone: "error" | "success"; text: string } | null>(null);

  useEffect(() => {
    if (notice?.tone !== "success") return;
    const timer = window.setTimeout(() => setNotice(null), NOTICE_MS);
    return () => window.clearTimeout(timer);
  }, [notice]);

  // Remember the venue only once it opens: a venue without access is not offered next time.
  useEffect(() => {
    if (floor.state === "ready" && venueId) storeVenue(venueId);
  }, [floor.state, venueId]);

  const venueName = useCallback(
    (id: string) => {
      const v = venues.find((x) => x.id === id);
      return v ? pickLocale(v.name, locale) || id : "";
    },
    [venues, locale],
  );

  // Derived views of the live data.
  const numbers = useMemo(() => tableNumbers(floor.tables), [floor.tables]);
  const calls = useMemo(() => callBoard(floor.calls, now), [floor.calls, now]);
  const orders = useMemo(() => orderBoard(floor.orders, now), [floor.orders, now]);
  const queue = useMemo(() => queueBoard(floor.queue), [floor.queue]);
  const rules = useMemo(() => venueRules(floor.venue), [floor.venue]);
  const today = dayKey(now);
  const allBookings = useMemo(() => staffBookings(floor.bookings, rules, floor.names), [floor.bookings, rules, floor.names]);
  const todayBookings = useMemo(() => bookingsOfDay(allBookings, today), [allBookings, today]);
  const sessions = useMemo(() => sessionTables(floor.calls), [floor.calls]);
  const booked = useMemo(() => bookingTables(allBookings), [allBookings]);
  const pendingShifts = shifts.filter((s) => s.status === "PENDING" && (shiftSpan(s)?.end ?? 0) > now).length;

  const counts: Record<StaffTab, { n: number; alert?: boolean }> = {
    calls: calls.pending.length ? { n: calls.pending.length, alert: true } : { n: calls.accepted.length },
    orders: { n: openOrderCount(orders) },
    waitlist: { n: queue.ready.length + queue.waiting.length },
    bookings: { n: todayBookings.filter((b) => (b.status === "CONFIRMED" || b.status === "CHECKED_IN") && b.end > now).length },
    shifts: { n: pendingShifts, alert: pendingShifts > 0 },
  };

  // New calls show in the browser tab title, so a waiter on another tab sees them.
  useEffect(() => {
    const base = document.title.replace(/^\(\d+\)\s*/, "");
    const pending = calls.pending.length;
    document.title = pending ? `(${pending}) ${base}` : base;
    return () => {
      document.title = document.title.replace(/^\(\d+\)\s*/, "");
    };
  }, [calls.pending.length]);

  const act = async (action: () => Promise<unknown>, success?: string): Promise<boolean> => {
    setNotice(null);
    try {
      await action();
      if (success) setNotice({ tone: "success", text: success });
      return true;
    } catch (error) {
      setNotice({ tone: "error", text: actionErrorText(error, copy) });
      return false;
    } finally {
      await floor.reload();
    }
  };

  const hasVenue = Boolean(venueId);
  const tabs = hasVenue ? STAFF_TABS : (["shifts"] as const);
  const activeTab: StaffTab = hasVenue ? tab : "shifts";

  // The person's shift: running now, else the next one.
  const mine = myShift(shifts, now);
  const roleShift = myShift(shifts, now, venueId);
  const roleLabel =
    role === "admin"
      ? copy.roleAdmin
      : role === "restaurant"
        ? copy.roleOwner
        : roleShift.current || roleShift.next
          ? shiftRoleLabel((roleShift.current ?? roleShift.next)!, presetNames)
          : copy.roleStaff;
  const shiftLine = (() => {
    if (mine.current) return { live: true, text: fill(copy.onShiftUntil, { time: mine.current.end_time }) };
    if (!mine.next) return { live: false, text: copy.shiftNone };
    const todayLocal = todayInZone(new Date(now));
    if (mine.next.date === todayLocal) return { live: false, text: fill(copy.shiftToday, { time: mine.next.start_time }) };
    const day =
      mine.next.date === addDays(todayLocal, 1)
        ? site.cabinet.opsScheduleFilterTomorrow.toLowerCase()
        : formatDate(mine.next.date, locale, { weekday: "short", day: "numeric", month: "short" });
    return { live: false, text: fill(copy.shiftNext, { day, time: mine.next.start_time }) };
  })();
  const showShiftLine = role === "staff" || shifts.length > 0;

  const dateLine = new Intl.DateTimeFormat(intlLocale(locale), {
    timeZone: VENUE_TIME_ZONE,
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date(now));
  const capitalized = dateLine.charAt(0).toUpperCase() + dateLine.slice(1);

  const venueTab = activeTab !== "shifts";

  let content: React.ReactNode;
  if (activeTab === "shifts") {
    content = (
      <>
        {!hasVenue && (
          <div className="owner-notice sf-notice-info" role="status">
            <span aria-hidden="true">i</span>
            <p>
              <strong>{copy.noVenuesTitle}</strong> {copy.noVenuesBody}
            </p>
          </div>
        )}
        <StaffShiftsPanel venueName={venueName} shifts={shifts} failed={shiftsFailed} now={now} onReload={onReloadShifts} />
      </>
    );
  } else if (floor.state === "forbidden") {
    content = <StaffEmpty icon={<AlertIcon />} title={copy.noAccess} hint={copy.noAccessHint} />;
  } else if (floor.state === "failed") {
    content = (
      <StaffEmpty
        icon={<AlertIcon />}
        title={copy.loadFailed}
        hint={copy.loadFailedHint}
        action={
          <button type="button" className="btn btn--primary btn--md" onClick={() => void floor.reload()}>
            {copy.retry}
          </button>
        }
      />
    );
  } else if (floor.state === "loading") {
    content = <p className="sf-loading">{copy.loading}</p>;
  } else if (activeTab === "calls") {
    content = (
      <StaffCallsTab
        copy={copy}
        locale={locale}
        calls={floor.calls}
        tableNumbers={numbers}
        fresh={floor.fresh}
        now={now}
        onAccept={async (call) => {
          await act(() => staffAcceptWaiterCall(call.id));
        }}
        onDone={async (call) => {
          await act(() => staffCompleteWaiterCall(call.id));
        }}
      />
    );
  } else if (activeTab === "orders") {
    content = (
      <StaffOrdersTab
        copy={copy}
        locale={locale}
        board={orders}
        tablesOf={(order) => orderTables(order, sessions, numbers, booked)}
        now={now}
        onAdvance={async (order, status) => {
          await act(() => staffUpdateOrder(order.id, venueId, status));
        }}
        onCancel={async (order) => {
          await act(() => staffUpdateOrder(order.id, venueId, "CANCELLED"));
        }}
        onAgeCheck={async (order, approved) => {
          await act(() => staffAgeCheckOrder(order.id, approved));
        }}
      />
    );
  } else if (activeTab === "waitlist") {
    content = (
      <StaffWaitlistTab
        copy={copy}
        locale={locale}
        seatsForms={bcopy.seatsForms}
        entries={floor.queue}
        tables={floor.tables}
        now={now}
        onAdd={(input: NewWalkIn) =>
          act(() => staffAddWaitlist({ venue_id: venueId, ...input }), fill(copy.waitlist.added, { name: input.guest_name }))
        }
        onNotify={async (entry, tableId) => {
          await act(() => staffNotifyWaitlist(entry.id, tableId));
        }}
        onSeat={async (entry, tableId) => {
          await act(() => staffSeatWaitlist(entry.id, tableId));
        }}
        onClose={async (entry, status) => {
          await act(() => staffCloseWaitlist(entry.id, status));
        }}
      />
    );
  } else {
    content = (
      <StaffBookingsTab copy={copy} bcopy={bcopy} locale={locale} bookings={todayBookings} holdMin={rules.holdMin} now={now} />
    );
  }

  return (
    <div className="owner-dashboard sf-dashboard">
      <aside className="owner-sidebar" aria-label={copy.title}>
        <div className="owner-person">
          <span className="owner-avatar">{initials(user)}</span>
          <div className="owner-person-info">
            <strong title={displayName(user)}>{displayName(user)}</strong>
            <span className="owner-role-badge">
              <i className="owner-role-dot" aria-hidden="true" />
              {roleLabel}
            </span>
          </div>
        </div>

        {showShiftLine && (
          <button type="button" className={`sf-myshift ${shiftLine.live ? "is-live" : ""}`} onClick={() => onTab("shifts")}>
            <span>{copy.myShift}</span>
            <strong>
              <i aria-hidden="true" />
              {shiftLine.text}
            </strong>
          </button>
        )}

        {venues.length > 0 && (
          <div className={`owner-venue-switcher ${venues.length === 1 ? "sf-single-venue" : ""}`}>
            <span id="sf-venues-label">{copy.venues}</span>
            <div role="group" aria-labelledby="sf-venues-label">
              {venues.map((venue) => {
                const name = pickLocale(venue.name, locale) || venue.id;
                return (
                  <button
                    key={venue.id}
                    type="button"
                    className={venue.id === venueId ? "active" : ""}
                    aria-pressed={venue.id === venueId}
                    onClick={() => onVenue(venue.id)}
                  >
                    <i>{name.slice(0, 1).toUpperCase()}</i>
                    <span title={name}>{name}</span>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <polyline points="9 18 15 12 9 6" />
                    </svg>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <nav
          className="owner-nav sf-nav"
          role="tablist"
          aria-label={copy.title}
          onKeyDown={(event) => {
            const keys = ["ArrowDown", "ArrowRight", "ArrowUp", "ArrowLeft", "Home", "End"];
            if (!keys.includes(event.key)) return;
            event.preventDefault();
            const list = [...tabs] as StaffTab[];
            const at = list.indexOf(activeTab);
            const next =
              event.key === "Home"
                ? 0
                : event.key === "End"
                  ? list.length - 1
                  : (at + (event.key === "ArrowDown" || event.key === "ArrowRight" ? 1 : -1) + list.length) % list.length;
            onTab(list[next]);
            document.getElementById(`sf-tab-${list[next]}`)?.focus();
          }}
        >
          {tabs.map((id) => (
            <button
              key={id}
              id={`sf-tab-${id}`}
              role="tab"
              type="button"
              aria-selected={activeTab === id}
              aria-controls="sf-tabpanel"
              tabIndex={activeTab === id ? 0 : -1}
              className={activeTab === id ? "active" : ""}
              onClick={() => onTab(id)}
            >
              <span className="owner-nav-icon">{TAB_ICONS[id]}</span>
              <span>{copy.nav[id]}</span>
              {counts[id].n > 0 && <b className={counts[id].alert ? "owner-nav-alert-badge" : ""}>{counts[id].n}</b>}
            </button>
          ))}
        </nav>
      </aside>

      <main className="owner-content sf-content" id="sf-tabpanel" role="tabpanel" aria-labelledby={`sf-tab-${activeTab}`}>
        <header className="owner-section-head sf-head">
          <div>
            <span className="owner-kicker">{venueTab && hasVenue ? `${copy.kicker[activeTab]} · ${venueName(venueId)}` : copy.kicker[activeTab]}</span>
            <h2>{copy.heading[activeTab]}</h2>
          </div>
        </header>

        {venueTab && floor.state !== "forbidden" && (
          <StaffDayBar
            copy={copy}
            dateLine={capitalized}
            now={now}
            updatedAt={floor.updatedAt}
            refreshing={floor.refreshing}
            onRefresh={() => void floor.reload()}
          />
        )}

        {venueTab && floor.stale && floor.state === "ready" && floor.updatedAt && (
          <div className="sf-stale" role="status">
            <AlertIcon />
            <p>{fill(copy.refreshFailed, { time: formatClock(floor.updatedAt) })}</p>
            <button type="button" className="btn btn--secondary btn--sm" onClick={() => void floor.reload()} disabled={floor.refreshing}>
              {copy.retry}
            </button>
          </div>
        )}

        {notice && (
          <div className={`owner-notice ${notice.tone}`} role={notice.tone === "error" ? "alert" : "status"} aria-live="polite">
            <span aria-hidden="true">{notice.tone === "error" ? "!" : "✓"}</span>
            <p>{notice.text}</p>
            <button type="button" className="btn btn--ghost btn--sm btn--icon" aria-label={copy.close} onClick={() => setNotice(null)}>
              ×
            </button>
          </div>
        )}

        {content}
      </main>
    </div>
  );
}
