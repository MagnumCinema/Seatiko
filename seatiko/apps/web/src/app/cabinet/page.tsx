"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { PanelShell } from "@/components/panel-shell";
import {
  CabinetFloorPanel,
  CabinetRulesPanel,
} from "@/components/cabinet-ops";
import { CabinetMenuPanel } from "@/components/cabinet-menu";
import { CabinetShiftsPlanner } from "@/components/cabinet-shifts";
import { CabinetStaffPanel } from "@/components/cabinet-staff";
import { useLocale } from "@/components/locale-provider";
import { StatusBadge } from "@/components/status-badge";
import { CabinetConfirmDialog } from "@/components/cabinet-confirm-dialog";
import { CabinetBookingsPanel } from "@/components/cabinet-bookings";
import { CabinetHistoryPanel } from "@/components/cabinet-history";
import { CabinetOverviewPanel } from "@/components/cabinet-overview";
import { CabinetProfilePanel } from "@/components/cabinet-profile";
import { dayKey, upcomingOwnerBookings, type BookingPeriod } from "@/lib/cabinet-bookings";
import {
  ApiError,
  createApplication,
  deleteApplication,
  fetchMe,
  fetchMapConfig,
  getToken,
  listMyApplications,
  listRestaurantReservations,
  listVenueWorkShifts,
  pickLocale,
  submitApplication,
  type MapConfig,
  type RestaurantReservation,
  type User,
  type VenueApplication,
} from "@/lib/api";
import { getSiteCopy } from "@/lib/site-copy";
import {
  clearStoredEdits,
  hasStoredEdits,
  READINESS_KEYS,
  readiness,
  valuesFromApplication,
} from "@/lib/venue-profile";
import "./bookings.css";
import "./history.css";
import "./overview.css";

type Section =
  | "overview"
  | "profile"
  | "floor"
  | "menu"
  | "rules"
  | "staff"
  | "shifts"
  | "reservations"
  | "activity";

/* Modern SVG Icons for crisp, accessible UI */
function OverviewIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect width="7" height="9" x="3" y="3" rx="1.5" />
      <rect width="7" height="5" x="14" y="3" rx="1.5" />
      <rect width="7" height="9" x="14" y="12" rx="1.5" />
      <rect width="7" height="5" x="3" y="16" rx="1.5" />
    </svg>
  );
}

function ProfileIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 9.5 12 3l9 6.5V20a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  );
}

function FloorIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect width="18" height="18" x="3" y="3" rx="2" />
      <path d="M3 9h18" />
      <path d="M9 21V9" />
    </svg>
  );
}

function MenuIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z" />
      <path d="M6 6h10" />
      <path d="M6 10h10" />
      <path d="M6 14h6" />
    </svg>
  );
}

function RulesIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" x2="8" y1="13" y2="13" />
      <line x1="16" x2="8" y1="17" y2="17" />
      <line x1="10" x2="8" y1="9" y2="9" />
    </svg>
  );
}

function StaffIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

function ShiftsIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect width="18" height="18" x="3" y="4" rx="2" />
      <line x1="16" x2="16" y1="2" y2="6" />
      <line x1="8" x2="8" y1="2" y2="6" />
      <line x1="3" x2="21" y1="10" y2="10" />
      <circle cx="12" cy="15" r="2" />
    </svg>
  );
}

function ReservationsIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect width="18" height="18" x="3" y="4" rx="2" />
      <line x1="16" x2="16" y1="2" y2="6" />
      <line x1="8" x2="8" y1="2" y2="6" />
      <line x1="3" x2="21" y1="10" y2="10" />
      <path d="m9 16 2 2 4-4" />
    </svg>
  );
}

function ActivityIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
      <path d="M3 3v5h5" />
      <path d="M12 7v5l4 2" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function editable(status: string) {
  return status === "DRAFT" || status === "REJECTED";
}

/** Readiness of the saved profile, by the same rules the API checks before moderation. */
function getSetupChecks(app: VenueApplication, copy: ReturnType<typeof getSiteCopy>["cabinet"]) {
  const done = readiness(valuesFromApplication(app), app.photo_urls?.length ?? 0);
  const labels = {
    basics: copy.checkNameDesc,
    address: copy.checkAddress,
    point: copy.checkMapPoint,
    cuisine: copy.checkCuisine,
    contacts: copy.checkContacts,
    hours: copy.checkHours,
    photos: copy.checkPhotos,
  };
  return READINESS_KEYS.map((key) => ({ label: labels[key], done: done[key] }));
}

function getStatusHint(status: string, copy: ReturnType<typeof getSiteCopy>["cabinet"]) {
  if (status === "PUBLISHED") return copy.statusHintPublished;
  if (status === "APPROVED") return copy.statusHintApproved;
  if (status === "UNDER_REVIEW") return copy.statusHintUnderReview;
  if (status === "SUBMITTED") return copy.statusHintSubmitted;
  if (status === "REJECTED") return copy.statusHintRejected;
  return copy.statusHintDraft;
}

function formatOwnerName(user: User): string {
  if (user.display_name) {
    const cleaned = user.display_name
      .replace(/\s*\((?:владелец|owner|proprietar|администратор|admin)[^)]*\)/gi, "")
      .trim();
    if (cleaned && !/^(?:владелец|owner|proprietar)$/i.test(cleaned)) {
      return cleaned;
    }
  }
  const first = user.first_name?.trim() || "";
  const last = user.last_name?.trim() || "";
  if (/^(?:владелец|owner|proprietar)$/i.test(last)) {
    return first || user.email;
  }
  return `${first} ${last}`.trim() || user.email;
}

function initials(user: User) {
  const first = user.first_name?.trim() || "";
  const last = user.last_name?.trim() || "";
  if (first && last && !/^(?:владелец|owner|proprietar)$/i.test(last)) {
    return `${first[0]}${last[0]}`.toUpperCase();
  }
  if (first && last) {
    return `${first[0]}${last[0]}`.toUpperCase();
  }
  if (first) {
    return first.slice(0, 2).toUpperCase();
  }
  const cleanName = formatOwnerName(user);
  const parts = cleanName.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }
  return (cleanName.slice(0, 2) || "VR").toUpperCase();
}

export default function CabinetPage() {
  const router = useRouter();
  const { locale } = useLocale();
  const siteCopy = useMemo(() => getSiteCopy(locale), [locale]);
  const cabinetCopy = siteCopy.cabinet;
  const ui = cabinetCopy.ui;
  const [user, setUser] = useState<User | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const contentRef = useRef<HTMLElement>(null);
  const [mapConfig, setMapConfig] = useState<MapConfig | null>(null);

  useEffect(() => {
    let active = true;
    fetchMapConfig().then((config) => { if (active) setMapConfig(config); }).catch(() => {});
    return () => { active = false; };
  }, []);

  const locations = mapConfig?.cities.filter((city) => city.country === "MD") ?? [];
  const [apps, setApps] = useState<VenueApplication[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [section, setSection] = useState<Section>("overview");
  const [reservations, setReservations] = useState<RestaurantReservation[]>([]);
  const [focusBookingId, setFocusBookingId] = useState<string | null>(null);
  const [bookingsPeriod, setBookingsPeriod] = useState<BookingPeriod | undefined>(undefined);
  const [shiftAlertCount, setShiftAlertCount] = useState(0);
  // Bumped after the cabinet changes the venue, so the history tab reloads its log.
  const [historyVersion, setHistoryVersion] = useState(0);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deletingApp, setDeletingApp] = useState<VenueApplication | null>(null);

  // Keeps "upcoming" vs "history" honest when the cabinet stays open for hours.
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  // Success notices fade on their own; errors stay until dismissed.
  useEffect(() => {
    if (!msg || error) return;
    const timer = window.setTimeout(() => setMsg(null), 6000);
    return () => window.clearTimeout(timer);
  }, [msg, error]);

  function openSection(next: Section) {
    setSection(next);
    setBookingsPeriod(undefined);
    setMsg(null);
    setError(null);
    // On phones the tab grid sits above the content; bring the opened tab into view.
    if (typeof window !== "undefined" && window.matchMedia("(max-width: 960px)").matches) {
      window.requestAnimationFrame(() =>
        contentRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }),
      );
    }
  }

  /** Bookings tab opened from the overview on a given quick filter (today, tomorrow, upcoming). */
  function openBookings(period?: BookingPeriod) {
    openSection("reservations");
    setBookingsPeriod(period);
  }

  const selected = apps.find((app) => app.id === selectedId) ?? null;

  const navigation: { id: Section; label: string; icon: React.ReactNode }[] = useMemo(
    () => [
      { id: "overview", label: cabinetCopy.nav.overview, icon: <OverviewIcon /> },
      { id: "profile", label: cabinetCopy.nav.profile, icon: <ProfileIcon /> },
      { id: "floor", label: cabinetCopy.nav.floor, icon: <FloorIcon /> },
      { id: "menu", label: cabinetCopy.nav.menu, icon: <MenuIcon /> },
      { id: "rules", label: cabinetCopy.nav.rules, icon: <RulesIcon /> },
      { id: "staff", label: cabinetCopy.nav.staff, icon: <StaffIcon /> },
      { id: "shifts", label: cabinetCopy.nav.shifts, icon: <ShiftsIcon /> },
      { id: "reservations", label: cabinetCopy.nav.reservations, icon: <ReservationsIcon /> },
      { id: "activity", label: cabinetCopy.nav.activity, icon: <ActivityIcon /> },
    ],
    [cabinetCopy],
  );

  // The setters are listed so React Compiler can keep this memo once the old inline tabs are gone.
  const load = useCallback(async () => {
    if (!getToken()) {
      router.replace("/login");
      return;
    }
    try {
      const me = await fetchMe();
      if (me.role !== "restaurant" && me.role !== "admin") {
        router.replace("/");
        return;
      }
      // Bookings load apart: if they fail, the tab shows its own retry and the rest still opens.
      const [applicationList, bookingList] = await Promise.all([
        listMyApplications(),
        listRestaurantReservations().catch(() => null),
      ]);
      setUser(me);
      setApps(applicationList);
      if (bookingList) setReservations(bookingList);
      setLoadFailed(false);
      setNow(Date.now());
      setSelectedId((current) => {
        if (current && applicationList.some((app) => app.id === current)) return current;
        return applicationList[0]?.id ?? null;
      });
    } catch (value) {
      // Only an expired session sends the owner back to login; a network hiccup shows a retry screen.
      if (value instanceof ApiError && (value.status === 401 || value.status === 403)) {
        router.replace("/login");
        return;
      }
      setLoadFailed(true);
    }
  }, [router, setUser, setApps, setReservations, setLoadFailed, setNow, setSelectedId]);

  // The history tab loads its own log; this only tells it that something changed.
  const refreshActivity = useCallback((applicationId: string) => {
    void applicationId;
    setHistoryVersion((version) => version + 1);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  useEffect(() => {
    const targetVenueId = selected ? selected.venue_id || selected.id : "";
    if (!targetVenueId) return;
    let cancelled = false;
    // Shift dates are venue days (Chișinău), not the owner's local calendar.
    const todayStr = dayKey(Date.now());
    listVenueWorkShifts(targetVenueId)
      .then((list) => {
        if (cancelled) return;
        const count = list.filter(
          (s) => s.date >= todayStr && (s.status === "SWAP_REQUESTED" || s.status === "DECLINED"),
        ).length;
        setShiftAlertCount(count);
      })
      .catch(() => {
        if (!cancelled) setShiftAlertCount(0);
      });
    return () => {
      cancelled = true;
    };
  }, [selected]);

  const selectedReservations = useMemo(
    () =>
      selected?.venue_id
        ? reservations.filter((reservation) => reservation.venue_id === selected.venue_id)
        : [],
    [reservations, selected],
  );
  const clearFocusBooking = useCallback(() => setFocusBookingId(null), [setFocusBookingId]);

  function showApiError(value: unknown, fallback: string) {
    if (value instanceof ApiError && value.code === "incomplete") {
      const missing = selected
        ? getSetupChecks(selected, cabinetCopy)
            .filter((check) => !check.done)
            .map((check) => check.label.toLowerCase())
        : [];
      setError(
        missing.length
          ? ui.missingFields.replace("{list}", missing.join(", "))
          : ui.checkRequired,
      );
      return;
    }
    if (value instanceof ApiError && value.code === "invalid_fields") {
      setError(ui.invalidFields);
      return;
    }
    setError(fallback);
  }

  async function onCreate() {
    setBusy(true);
    setError(null);
    try {
      const app = await createApplication();
      setApps((current) => [app, ...current]);
      setSelectedId(app.id);
      setSection("profile");
      setMsg(ui.draftCreated);
    } catch (value) {
      showApiError(value, ui.createFailed);
    } finally {
      setBusy(false);
    }
  }

  async function onDeleteConfirm() {
    if (!deletingApp) return;
    const target = deletingApp;
    setBusy(true);
    setError(null);
    try {
      await deleteApplication(target.id);
      clearStoredEdits(target.id);
      const remaining = apps.filter((item) => item.id !== target.id);
      setApps(remaining);
      setSelectedId(remaining[0]?.id ?? null);
      setSection("overview");
      setDeletingApp(null);
      setMsg(ui.venueDeleted);
    } catch (value) {
      setDeletingApp(null);
      showApiError(value, ui.deleteFailed);
    } finally {
      setBusy(false);
    }
  }

  /** Overview's "Submit": sends the saved profile; unsaved profile edits are finished in the profile tab first. */
  async function onSubmit() {
    if (!selected || !editable(selected.status)) return;
    if (hasStoredEdits(selected, locale)) {
      openSection("profile");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const updated = await submitApplication(selected.id);
      setApps((current) => current.map((app) => (app.id === updated.id ? updated : app)));
      setMsg(ui.submitted);
      refreshActivity(selected.id);
    } catch (value) {
      showApiError(value, ui.submitFailed);
    } finally {
      setBusy(false);
    }
  }

  if (!user) {
    if (loadFailed) {
      return (
        <div className="panel-page owner-loading owner-load-failed" role="alert">
          <strong>{ui.loadFailedTitle}</strong>
          <p>{ui.loadFailedHint}</p>
          <button
            type="button"
            className="panel-btn"
            onClick={() => {
              setLoadFailed(false);
              void load();
            }}
          >
            {ui.retry}
          </button>
        </div>
      );
    }
    return (
      <div className="panel-page owner-loading" role="status" aria-live="polite">
        <span />
        <p>{ui.loadingWorkspace}</p>
      </div>
    );
  }

  const checks = selected ? getSetupChecks(selected, cabinetCopy) : [];
  const isDraftStatus = selected ? editable(selected.status) : false;
  const canEdit = isDraftStatus;
  const effectiveVenueId = selected ? selected.venue_id || selected.id : "";
  const futureBookings = upcomingOwnerBookings(selectedReservations, now);
  // Profile edits that are neither saved nor sent (the open profile tab shows its own state).
  const unsavedProfile = (app: VenueApplication) =>
    !(app.id === selectedId && section === "profile") && hasStoredEdits(app, locale);
  const venueTitle = (app: VenueApplication) =>
    pickLocale(app.name, locale) || pickLocale(app.name, "ru") || ui.newVenue;

  return (
    <PanelShell
      title={cabinetCopy.title}
      subtitle={cabinetCopy.subtitle}
      email={user.email}
    >
      <div className="owner-dashboard">
        <aside className="owner-sidebar" aria-label={cabinetCopy.title}>
          <div className="owner-person">
            <span className="owner-avatar">{initials(user)}</span>
            <div className="owner-person-info">
              <strong>{formatOwnerName(user)}</strong>
              <span className="owner-role-badge">
                <i className="owner-role-dot" aria-hidden="true" />
                {cabinetCopy.owner}
              </span>
            </div>
          </div>

          <div className="owner-venue-switcher">
            <span id="venue-switcher-label">{cabinetCopy.venues}</span>
            <div role="group" aria-labelledby="venue-switcher-label">
              {apps.map((app) => (
                <button
                  key={app.id}
                  type="button"
                  className={`${app.id === selectedId ? "active" : ""}${unsavedProfile(app) ? " vp-unsaved" : ""}`.trim()}
                  onClick={() => {
                    setSelectedId(app.id);
                    openSection("overview");
                  }}
                  aria-pressed={app.id === selectedId}
                >
                  <i>{venueTitle(app).slice(0, 1).toUpperCase()}</i>
                  <span title={venueTitle(app)}>{venueTitle(app)}</span>
                  {unsavedProfile(app) && <span className="vp-sr">{cabinetCopy.profileTab.unsavedNav}</span>}
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </button>
              ))}
            </div>
            <button
              type="button"
              className="owner-add-venue"
              disabled={busy}
              onClick={() => void onCreate()}
            >
              <i>+</i>
              <span>{cabinetCopy.add}</span>
            </button>
          </div>

          {selected && (
            <nav
              className="owner-nav"
              role="tablist"
              aria-label={cabinetCopy.title}
              tabIndex={0}
            >
              {navigation.map((item) => (
                <button
                  key={item.id}
                  id={`tab-${item.id}`}
                  role="tab"
                  aria-selected={section === item.id}
                  aria-controls={`tabpanel-${item.id}`}
                  tabIndex={section === item.id ? 0 : -1}
                  type="button"
                  className={section === item.id ? "active" : ""}
                  onClick={() => openSection(item.id)}
                >
                  <span className="owner-nav-icon">{item.icon}</span>
                  <span>{item.label}</span>
                  {item.id === "profile" && unsavedProfile(selected) && (
                    <i className="vp-nav-dot" role="img" title={cabinetCopy.profileTab.unsavedNav} aria-label={cabinetCopy.profileTab.unsavedNav} />
                  )}
                  {item.id === "shifts" && shiftAlertCount > 0 && (
                    <b className="owner-nav-alert-badge">{shiftAlertCount}</b>
                  )}
                  {item.id === "reservations" && futureBookings.length > 0 && (
                    <b>{futureBookings.length}</b>
                  )}
                </button>
              ))}
            </nav>
          )}

          <div className="owner-support">
            <span>{cabinetCopy.needHelp}</span>
            <p>{cabinetCopy.supportHelpText}</p>
            <a href="mailto:partners@seatiko.md">{cabinetCopy.contactSupport}</a>
          </div>
        </aside>

        <main
          ref={contentRef}
          className="owner-content"
          id={`tabpanel-${section}`}
          role="tabpanel"
          aria-labelledby={`tab-${section}`}
          tabIndex={0}
        >
          {(msg || error) && (
            <div className={`owner-notice ${error ? "error" : "success"}`} role={error ? "alert" : "status"} aria-live="polite">
              <span>{error ? "!" : <CheckIcon />}</span>
              <p>{error || msg}</p>
              <button
                type="button"
                aria-label={ui.close}
                onClick={() => {
                  setError(null);
                  setMsg(null);
                }}
              >
                ×
              </button>
            </div>
          )}

          {!selected ? (
            <section className="owner-empty-state">
              <span className="owner-empty-mark">S</span>
              <span className="owner-kicker">{ui.firstStep}</span>
              <h2>{cabinetCopy.emptyVenuesTitle}</h2>
              <p>{cabinetCopy.emptyVenuesBody}</p>
              <button
                type="button"
                className="panel-btn"
                disabled={busy}
                onClick={() => void onCreate()}
              >
                {cabinetCopy.emptyVenuesBtn}
              </button>
              <div className="owner-empty-assurances">
                <span>{ui.assuranceNoFees}</span>
                <span>{ui.assuranceReview}</span>
                <span>{ui.assuranceSupport}</span>
              </div>
            </section>
          ) : (
            <>
              <header className="owner-section-head">
                <div>
                  <span className="owner-kicker">
                    {section === "overview" && ui.controlCenter}
                    {section === "profile" && cabinetCopy.dataForGuests}
                    {section === "floor" && cabinetCopy.floorTitle}
                    {section === "menu" && cabinetCopy.menuSectionTitle}
                    {section === "rules" && ui.rulesKicker}
                    {section === "staff" && cabinetCopy.staffSubtitle}
                    {section === "shifts" && cabinetCopy.shiftsSubtitle}
                    {section === "reservations" && ui.operations}
                    {section === "activity" && ui.auditKicker}
                  </span>
                  <h2>
                    {section === "overview" && venueTitle(selected)}
                    {section === "profile" && cabinetCopy.profile}
                    {section === "floor" && cabinetCopy.floor}
                    {section === "menu" && cabinetCopy.menu}
                    {section === "rules" && cabinetCopy.rules}
                    {section === "staff" && cabinetCopy.staff}
                    {section === "shifts" && cabinetCopy.shifts}
                    {section === "reservations" && cabinetCopy.reservations}
                    {section === "activity" && cabinetCopy.activity}
                  </h2>
                </div>
                <div className="owner-section-status">
                  <span>{cabinetCopy.status}</span>
                  <StatusBadge status={selected.status} />
                </div>
              </header>

              {section === "overview" && (
                <CabinetOverviewPanel
                  key={selected.id}
                  application={selected}
                  apps={apps}
                  ownerRows={reservations}
                  checks={checks}
                  canEdit={canEdit}
                  busy={busy}
                  statusHint={getStatusHint(selected.status, cabinetCopy)}
                  venueTitle={venueTitle}
                  onOpenSection={openSection}
                  onOpenBookings={openBookings}
                  onOpenBooking={(id) => {
                    setFocusBookingId(id);
                    openBookings();
                  }}
                  onSelectVenue={(id) => {
                    setSelectedId(id);
                    openSection("overview");
                  }}
                  onSubmit={() => void onSubmit()}
                  onOwnerRows={setReservations}
                />
              )}

              {section === "profile" && (
                <CabinetProfilePanel
                  key={selected.id}
                  application={selected}
                  mapConfig={mapConfig}
                  cities={locations}
                  onApplicationChange={(updated) =>
                    setApps((current) => current.map((app) => (app.id === updated.id ? updated : app)))
                  }
                  onNotice={(text, tone) => {
                    if (!text) {
                      setMsg(null);
                      setError(null);
                    } else if (tone === "error") {
                      setMsg(null);
                      setError(text);
                    } else {
                      setError(null);
                      setMsg(text);
                    }
                  }}
                  onActivityChange={() => void refreshActivity(selected.id)}
                  onSubmitted={() => {
                    openSection("overview");
                    setMsg(ui.submitted);
                  }}
                  onDelete={() => setDeletingApp(selected)}
                  deleteBusy={busy}
                />
              )}

              {section === "floor" && (
                <CabinetFloorPanel venueId={effectiveVenueId} />
              )}

              {section === "menu" && (
                // The menu lives on the published venue; before publishing there is none yet.
                <CabinetMenuPanel venueId={selected.venue_id ?? ""} />
              )}

              {section === "rules" && (
                <CabinetRulesPanel venueId={effectiveVenueId} published={Boolean(selected.venue_id)} hoursText={selected.hours_text} />
              )}

              {section === "staff" && (
                <CabinetStaffPanel venueId={effectiveVenueId} />
              )}

              {section === "shifts" && (
                <CabinetShiftsPlanner
                  venueId={effectiveVenueId}
                  hoursText={selected.hours_text}
                  onAlertCountChange={setShiftAlertCount}
                />
              )}

              {section === "reservations" &&
                (selected.venue_id ? (
                  <CabinetBookingsPanel
                    key={selected.venue_id}
                    venueId={selected.venue_id}
                    initialRows={selectedReservations}
                    initialPeriod={bookingsPeriod}
                    focusBookingId={focusBookingId}
                    onFocusHandled={clearFocusBooking}
                    onOwnerRows={setReservations}
                  />
                ) : (
                  <section className="owner-reservations">
                    <div className="owner-section-empty">
                      <span aria-hidden="true"><ReservationsIcon /></span>
                      <h3>{ui.bookingsLockedTitle}</h3>
                      <p>{cabinetCopy.bookingsAppearAfterPublish}</p>
                    </div>
                  </section>
                ))}

              {section === "activity" && (
                <CabinetHistoryPanel
                  apps={apps}
                  selectedId={selected.id}
                  ownerId={user.id}
                  ownerName={formatOwnerName(user)}
                  cityNames={Object.fromEntries(locations.map((city) => [city.id, pickLocale(city.name, locale)]))}
                  refreshKey={historyVersion}
                  onOpen={(applicationId, target) => {
                    setSelectedId(applicationId);
                    openSection(target);
                  }}
                  onSelectVenue={setSelectedId}
                />
              )}
            </>
          )}
        </main>
      </div>

      <CabinetConfirmDialog
        open={!!deletingApp}
        title={ui.deleteVenueTitle}
        text={ui.deleteVenueText.replace("{name}", deletingApp ? venueTitle(deletingApp) : "")}
        confirmLabel={ui.deleteVenue}
        cancelLabel={cabinetCopy.opsMenuCancel}
        busy={busy}
        onConfirm={() => void onDeleteConfirm()}
        onCancel={() => setDeletingApp(null)}
      />
    </PanelShell>
  );
}
