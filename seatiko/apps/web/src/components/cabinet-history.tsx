"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useLocale } from "@/components/locale-provider";
import { SelectMenu, type SelectMenuOption } from "@/components/ui/select-menu";
import {
  listApplicationActivity,
  listMyChangeRequests,
  pickLocale,
  type LocalizedString,
  type ProfileChangeRequest,
  type VenueApplication,
} from "@/lib/api";
import { formatClock, formatDay, dayKey, addDays, VENUE_TIME_ZONE } from "@/lib/cabinet-bookings";
import { pluralize } from "@/lib/cabinet-helpers";
import {
  clip,
  countBy,
  DEFAULT_HISTORY_FILTERS,
  filterEntries,
  filtersActive,
  groupEntriesByDay,
  linkChangeRequests,
  patchRows,
  sortEntries,
  toCsv,
  toHistoryEntry,
  type HistoryActor,
  type HistoryCategory,
  type HistoryCategoryFilter,
  type HistoryEntry,
  type HistoryFilters,
  type HistoryPeriod,
  type HistoryWho,
  type PatchRow,
} from "@/lib/cabinet-history";
import { getSiteCopy } from "@/lib/site-copy";

const PAGE_SIZE = 30;
const ALL = "all";

export type HistoryOpenTarget = "profile" | "overview";

/** One venue's journal; `loadedAt` is the last successful load. */
type VenueLog = { entries: HistoryEntry[]; failed: boolean; loadedAt: number | null };

type Props = {
  apps: VenueApplication[];
  selectedId: string;
  ownerId: string;
  ownerName: string;
  /** City id → name in the current language, for requested city changes. */
  cityNames: Record<string, string>;
  /** Bumped by the cabinet after it changes the venue, so the log reloads. */
  refreshKey: number;
  onOpen: (applicationId: string, target: HistoryOpenTarget) => void;
  onSelectVenue: (applicationId: string) => void;
};

const fill = (template: string, values: Record<string, string | number>) =>
  template.replace(/\{(\w+)\}/g, (match, key: string) => (key in values ? String(values[key]) : match));

const capitalize = (value: string) => (value ? value[0].toLocaleUpperCase() + value.slice(1) : value);

/* ---------- Icons ---------- */

function Svg({ children, size = 16 }: { children: ReactNode; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}

const CATEGORY_ICONS: Record<HistoryCategory, ReactNode> = {
  profile: (
    <Svg>
      <path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4Z" />
      <path d="m13.5 6.5 4 4" />
    </Svg>
  ),
  photos: (
    <Svg>
      <rect x="3" y="5" width="18" height="14" rx="2.5" />
      <circle cx="9" cy="10" r="1.8" />
      <path d="m21 16-5-5-9 8" />
    </Svg>
  ),
  moderation: (
    <Svg>
      <path d="M12 3 5 6v5c0 4.4 3 8.3 7 10 4-1.7 7-5.6 7-10V6l-7-3Z" />
      <path d="m9 12 2 2 4-4" />
    </Svg>
  ),
  changes: (
    <Svg>
      <path d="M4 8h13l-3-3" />
      <path d="M20 16H7l3 3" />
    </Svg>
  ),
  other: (
    <Svg>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4" />
    </Svg>
  ),
};

function SearchIcon() {
  return (
    <Svg>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m20 20-4.2-4.2" />
    </Svg>
  );
}

function CloseIcon() {
  return (
    <Svg size={14}>
      <path d="M6 6l12 12M18 6 6 18" />
    </Svg>
  );
}

function RefreshIcon() {
  return (
    <Svg>
      <path d="M20 11a8 8 0 0 0-14.6-4.5L4 8" />
      <path d="M4 3v5h5" />
      <path d="M4 13a8 8 0 0 0 14.6 4.5L20 16" />
      <path d="M20 21v-5h-5" />
    </Svg>
  );
}

function DownloadIcon() {
  return (
    <Svg>
      <path d="M12 4v11" />
      <path d="m7 10 5 5 5-5" />
      <path d="M5 20h14" />
    </Svg>
  );
}

function ArrowIcon() {
  return (
    <Svg size={14}>
      <path d="M5 12h14" />
      <path d="m13 6 6 6-6 6" />
    </Svg>
  );
}

function ExternalIcon() {
  return (
    <Svg size={14}>
      <path d="M14 4h6v6" />
      <path d="M20 4 10 14" />
      <path d="M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5" />
    </Svg>
  );
}

function HistoryIcon() {
  return (
    <Svg size={22}>
      <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
      <path d="M3 3v5h5" />
      <path d="M12 7v5l3 2" />
    </Svg>
  );
}

function InfoIcon() {
  return (
    <Svg>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5M12 8h.01" />
    </Svg>
  );
}

/* ---------- Panel ---------- */

type Described = HistoryEntry & {
  title: string;
  actorName: string;
  venueName: string;
  fieldLabels: string[];
  request?: ProfileChangeRequest;
  requestRows: { label: string; value: string; empty: boolean }[];
  noteLabel: string;
  search: string;
};

export function CabinetHistoryPanel({
  apps,
  selectedId,
  ownerId,
  ownerName,
  cityNames,
  refreshKey,
  onOpen,
  onSelectVenue,
}: Props) {
  const { locale } = useLocale();
  const siteCopy = useMemo(() => getSiteCopy(locale), [locale]);
  const copy = siteCopy.cabinet.history;
  const entriesForms = copy.entriesForms;

  // The venue picked in the sidebar is the default; switching it there follows here.
  const [scope, setScope] = useState<string>(selectedId);
  const [followed, setFollowed] = useState(selectedId);
  if (followed !== selectedId) {
    setFollowed(selectedId);
    setScope(selectedId);
  }
  const multiVenue = apps.length > 1;
  const effectiveScope = scope === ALL && multiVenue ? ALL : apps.some((app) => app.id === scope) ? scope : selectedId;
  const scopeIds = useMemo(
    () => (effectiveScope === ALL ? apps.map((app) => app.id) : [effectiveScope]),
    [apps, effectiveScope],
  );
  const scopeKey = scopeIds.join("|");

  const [logs, setLogs] = useState<Record<string, VenueLog>>({});
  const [requests, setRequests] = useState<ProfileChangeRequest[]>([]);
  const [requestsFailed, setRequestsFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [filters, setFilters] = useState<HistoryFilters>(DEFAULT_HISTORY_FILTERS);
  const [visible, setVisible] = useState(PAGE_SIZE);
  const [now, setNow] = useState(() => Date.now());
  const loadSeq = useRef(0);

  const load = useCallback(
    async (ids: string[]) => {
      const seq = ++loadSeq.current;
      setRefreshing(true);
      const [activity, changeRequests] = await Promise.all([
        Promise.allSettled(ids.map((id) => listApplicationActivity(id))),
        listMyChangeRequests().then(
          (list) => ({ ok: true as const, list }),
          () => ({ ok: false as const, list: [] as ProfileChangeRequest[] }),
        ),
      ]);
      // A later load (another venue, a refresh) wins; this one is stale.
      if (seq !== loadSeq.current) return;
      setLogs((current) => {
        const next = { ...current };
        ids.forEach((id, index) => {
          const result = activity[index];
          if (result.status === "fulfilled") {
            next[id] = {
              entries: result.value
                .map((row) => toHistoryEntry({ ...row, application_id: row.application_id || id }, ownerId))
                .filter((row): row is HistoryEntry => row !== null),
              failed: false,
              loadedAt: Date.now(),
            };
          } else {
            // Keep what was shown before; only mark the venue as failed.
            next[id] = { entries: current[id]?.entries ?? [], failed: true, loadedAt: current[id]?.loadedAt ?? null };
          }
        });
        return next;
      });
      if (changeRequests.ok) setRequests(changeRequests.list);
      setRequestsFailed(!changeRequests.ok);
      setNow(Date.now());
      setRefreshing(false);
    },
    [ownerId],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => void load(scopeKey.split("|").filter(Boolean)), 0);
    return () => window.clearTimeout(timer);
  }, [load, scopeKey, refreshKey]);

  // Keeps «today» / «yesterday» right when the cabinet stays open past midnight.
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const appById = useMemo(() => new Map(apps.map((app) => [app.id, app])), [apps]);
  const venueTitle = useCallback(
    (app: VenueApplication | undefined) =>
      app ? pickLocale(app.name, locale) || pickLocale(app.name, "ru") || siteCopy.cabinet.ui.newVenue : "",
    [locale, siteCopy],
  );

  const scopeLogs = scopeIds.map((id) => logs[id]);
  const firstLoad = scopeLogs.some((log) => !log);
  const failedIds = scopeIds.filter((id) => logs[id]?.failed);
  const allFailed = !firstLoad && failedIds.length === scopeIds.length && scopeLogs.every((log) => !log?.entries.length);
  // The oldest successful load of the venues in view: «updated at» never claims more than is true.
  const loadedTimes = scopeLogs.map((log) => log?.loadedAt ?? null);
  const updatedAt = loadedTimes.some((time) => time === null) ? null : Math.min(...(loadedTimes as number[]));

  const entries = useMemo(
    () => sortEntries(scopeIds.flatMap((id) => logs[id]?.entries ?? [])),
    [logs, scopeIds],
  );
  const links = useMemo(() => linkChangeRequests(entries, requests), [entries, requests]);

  const formatValue = useCallback(
    (row: PatchRow): { value: string; empty: boolean } => {
      const value = row.value;
      const text = (() => {
        switch (row.field) {
          case "name":
          case "address":
          case "description": {
            const picked =
              typeof value === "string"
                ? value
                : pickLocale(value as LocalizedString, locale) || pickLocale(value as LocalizedString, "ru");
            return row.field === "description" ? clip(picked) : picked.trim();
          }
          case "cuisine":
            return Array.isArray(value) ? value.filter(Boolean).join(", ") : String(value ?? "");
          case "venue_type": {
            const chips = siteCopy.discover.chips as Record<string, string>;
            return value ? chips[String(value)] ?? String(value) : "";
          }
          case "city":
            return value ? cityNames[String(value)] ?? String(value) : "";
          case "location": {
            const point = value as { lat?: number; lng?: number };
            const fmt = (n?: number) => (Number.isFinite(n) ? (n as number).toFixed(5) : "—");
            return `${fmt(point.lat)}, ${fmt(point.lng)}`;
          }
          case "price_level": {
            const level = Number(value);
            return copy.priceLevels[level - 1] ?? String(value ?? "");
          }
          case "average_check":
            return value === null || value === undefined || value === "" ? "" : fill(copy.averageValue, { n: Number(value) });
          default:
            return String(value ?? "").trim();
        }
      })();
      return text ? { value: text, empty: false } : { value: copy.emptyValue, empty: true };
    },
    [cityNames, copy, locale, siteCopy],
  );

  const described: Described[] = useMemo(() => {
    const actorName = (actor: HistoryActor) =>
      actor === "owner"
        ? ownerName || copy.actorOwnerFallback
        : actor === "seatiko"
          ? copy.actorSeatiko
          : actor === "system"
            ? copy.actorSystem
            : copy.actorStaff;
    const fieldLabel = (key: string) => (copy.fields as Record<string, string>)[key] ?? key;
    return entries.map((entry) => {
      const title = entry.known ? (copy.actions as Record<string, string>)[entry.action] : copy.otherAction;
      const request = links.get(entry.id);
      const requestRows =
        request && entry.action === "PROFILE_CHANGE_REQUESTED"
          ? patchRows(request.patch).map((row) => ({ label: fieldLabel(row.field), ...formatValue(row) }))
          : [];
      // A review lists which fields its request touched; the values sit on the request itself.
      const fieldKeys =
        request && entry.action !== "PROFILE_CHANGE_REQUESTED" ? patchRows(request.patch).map((row) => row.field) : entry.fields;
      const fieldLabels = fieldKeys.map(fieldLabel);
      const noteLabel =
        entry.action === "APPLICATION_REJECTED" || entry.action === "PROFILE_CHANGE_REJECTED"
          ? copy.rejectReason
          : entry.actor === "seatiko"
            ? copy.moderatorComment
            : copy.note;
      const venueName = venueTitle(appById.get(entry.appId));
      const search = [
        title,
        actorName(entry.actor),
        venueName,
        ...fieldLabels,
        ...requestRows.flatMap((row) => [row.label, row.value]),
        entry.note,
        entry.known ? "" : entry.action,
      ].join(" ");
      return {
        ...entry,
        title,
        actorName: actorName(entry.actor),
        venueName,
        fieldLabels,
        request,
        requestRows,
        noteLabel,
        search,
      };
    });
  }, [appById, copy, entries, formatValue, links, ownerName, venueTitle]);

  const filtered = useMemo(
    () => filterEntries(described, filters, now, (entry) => entry.search),
    [described, filters, now],
  );
  const shown = filtered.slice(0, visible);
  const groups = groupEntriesByDay(shown);
  const active = filtersActive(filters);
  // Filters and counts only make sense once there is history to look through.
  const showFilters = !firstLoad && !allFailed && (described.length > 0 || active);

  // Chip counts follow the other filters, so a chip never promises entries it would not show.
  const categoryCounts = useMemo(
    () => countBy(filterEntries(described, { ...filters, category: "all" }, now, (e) => e.search), (e) => e.category),
    [described, filters, now],
  );
  const actorCounts = useMemo(() => countBy(described, (e) => e.actor), [described]);

  const update = (patch: Partial<HistoryFilters>) => {
    setFilters((current) => ({ ...current, ...patch }));
    setVisible(PAGE_SIZE);
  };

  const today = dayKey(now);
  const yesterday = addDays(today, -1);
  const dayHeading = (day: string) => {
    const relative = day === today ? copy.today : day === yesterday ? copy.yesterday : "";
    const date = capitalize(formatDay(day, locale, { weekday: true, year: day.slice(0, 4) !== today.slice(0, 4) }));
    return { relative, date };
  };

  const viewerZone = useMemo(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone;
    } catch {
      return VENUE_TIME_ZONE;
    }
  }, []);

  const categoryChips: { id: HistoryCategoryFilter; label: string }[] = [
    { id: "all", label: copy.catAll },
    { id: "profile", label: copy.catProfile },
    { id: "photos", label: copy.catPhotos },
    { id: "moderation", label: copy.catModeration },
    { id: "changes", label: copy.catChanges },
    { id: "other", label: copy.catOther },
  ];
  const chipCount = (id: HistoryCategoryFilter) =>
    id === "all"
      ? Object.values(categoryCounts).reduce<number>((sum, n) => sum + (n ?? 0), 0)
      : categoryCounts[id as HistoryCategory] ?? 0;
  // «Other» only appears when the API sends an action this screen does not know yet.
  const visibleChips = categoryChips.filter((chip) => chip.id !== "other" || described.some((e) => e.category === "other"));

  const venueOptions: SelectMenuOption[] = [
    { value: ALL, label: copy.allVenues },
    ...apps.map((app) => ({ value: app.id, label: venueTitle(app) })),
  ];
  const whoLabels: Record<HistoryActor, string> = {
    owner: copy.whoOwner,
    seatiko: copy.whoSeatiko,
    system: copy.whoSystem,
    staff: copy.whoStaff,
  };
  const whoOptions: SelectMenuOption[] = [
    { value: ALL, label: copy.whoAll },
    ...(Object.keys(whoLabels) as HistoryActor[])
      .filter((actor) => actorCounts[actor] || filters.who === actor || actor === "owner" || actor === "seatiko")
      .map((actor) => ({ value: actor, label: whoLabels[actor] })),
  ];
  const periodOptions: { value: HistoryPeriod; label: string }[] = [
    { value: "all", label: copy.periodAll },
    { value: "today", label: copy.periodToday },
    { value: "7d", label: copy.period7 },
    { value: "30d", label: copy.period30 },
    { value: "90d", label: copy.period90 },
  ];

  const exportCsv = () => {
    const rows = [
      [copy.csvDate, ...(multiVenue ? [copy.csvVenue] : []), copy.csvWho, copy.csvAction, copy.csvDetails, copy.csvNote],
      ...filtered.map((entry) => {
        const details = entry.requestRows.length
          ? entry.requestRows.map((row) => `${row.label}: ${row.value}`).join("; ")
          : entry.fieldLabels.join(", ");
        return [
          `${dayKey(entry.at)} ${formatClock(entry.at)}`,
          ...(multiVenue ? [entry.venueName] : []),
          entry.actorName,
          entry.known ? entry.title : `${entry.title} (${entry.action})`,
          details,
          entry.note,
        ];
      }),
    ];
    const blob = new Blob([toCsv(rows)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const slug =
      effectiveScope === ALL
        ? "all"
        : venueTitle(appById.get(effectiveScope))
            .normalize("NFD")
            .replace(/[̀-ͯ]/g, "")
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-|-$/g, "") || "venue";
    link.href = url;
    link.download = `seatiko-history-${slug}-${today}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const retry = () => void load(scopeIds);

  // One venue here is the cabinet's venue too (sidebar, status); «all venues» only widens this list.
  const changeScope = (value: string) => {
    setScope(value);
    setVisible(PAGE_SIZE);
    if (value !== ALL && value !== selectedId) onSelectVenue(value);
  };

  const renderLink = (entry: Described) => {
    const app = appById.get(entry.appId);
    if (!app) return null;
    if (entry.target === "venue") {
      if (!app.venue_id) return null;
      return (
        <a className="ch-link" href={`/venues/${app.venue_id}`} target="_blank" rel="noopener noreferrer">
          {copy.openVenue}
          <ExternalIcon />
        </a>
      );
    }
    if (entry.target !== "profile" && entry.target !== "overview") return null;
    const target = entry.target;
    return (
      <button type="button" className="ch-link" onClick={() => onOpen(entry.appId, target)}>
        {target === "profile" ? copy.openProfile : copy.openOverview}
        <ArrowIcon />
      </button>
    );
  };

  return (
    <section className="owner-activity ch-panel">
      <div className="owner-audit-intro ch-intro">
        <span aria-hidden="true">
          <InfoIcon />
        </span>
        <div>
          <strong>{copy.introTitle}</strong>
          <p>{copy.introText}</p>
          <p className="ch-intro-limit">{copy.notLogged}</p>
        </div>
      </div>

      {!showFilters && multiVenue && (
        <div className="ch-controls is-venue-only">
          <SelectMenu
            value={effectiveScope}
            onChange={changeScope}
            options={venueOptions}
            ariaLabel={copy.venueLabel}
            className="ch-select"
          />
        </div>
      )}

      {showFilters && (
        <div className="ch-toolbar" role="search" aria-label={copy.filtersLabel}>
          <div className="ch-chips" role="group" aria-label={copy.categoriesLabel}>
            {visibleChips.map((chip) => (
              <button
                key={chip.id}
                type="button"
                className={filters.category === chip.id ? "active" : ""}
                aria-pressed={filters.category === chip.id}
                onClick={() => update({ category: chip.id })}
              >
                {chip.label}
                <b>{chipCount(chip.id)}</b>
              </button>
            ))}
          </div>
          <div className={`ch-controls${multiVenue ? " has-venue" : ""}`}>
            <label className="ch-search">
              <SearchIcon />
              <input
                type="search"
                value={filters.query}
                onChange={(event) => update({ query: event.target.value })}
                placeholder={copy.searchPlaceholder}
                aria-label={copy.searchLabel}
              />
              {filters.query && (
                <button type="button" onClick={() => update({ query: "" })} aria-label={copy.clearSearch}>
                  <CloseIcon />
                </button>
              )}
            </label>
            {multiVenue && (
              <SelectMenu
                value={effectiveScope}
                onChange={changeScope}
                options={venueOptions}
                ariaLabel={copy.venueLabel}
                className="ch-select"
              />
            )}
            <SelectMenu
              value={filters.who}
              onChange={(value) => update({ who: value as HistoryWho })}
              options={whoOptions}
              ariaLabel={copy.whoLabel}
              className="ch-select"
            />
            <SelectMenu
              value={filters.period}
              onChange={(value) => update({ period: value as HistoryPeriod })}
              options={periodOptions}
              ariaLabel={copy.periodLabel}
              className="ch-select"
            />
          </div>
        </div>

      )}

      {showFilters && (
        <div className="ch-status-row">
          <p className="ch-total">
            {firstLoad
              ? copy.loading
              : filtered.length > shown.length
                ? fill(copy.shownOf, { shown: shown.length, total: filtered.length })
                : `${filtered.length} ${pluralize(filtered.length, entriesForms, locale)}`}
          </p>
          <div className="ch-actions">
            <span className="ch-updated" aria-live="polite">
              {refreshing && !firstLoad ? copy.refreshing : updatedAt ? fill(copy.updatedAt, { time: formatClock(updatedAt) }) : ""}
            </span>
            <button
              type="button"
              className="ch-icon-btn"
              onClick={retry}
              disabled={refreshing}
              aria-label={copy.refresh}
              title={copy.refresh}
            >
              <span className={refreshing ? "ch-spin" : ""}>
                <RefreshIcon />
              </span>
            </button>
            <button
              type="button"
              className="ch-icon-btn ch-export"
              onClick={exportCsv}
              disabled={filtered.length === 0}
              title={copy.exportCsvHint}
              aria-label={copy.exportCsvHint}
            >
              <DownloadIcon />
              <span>{copy.exportCsv}</span>
            </button>
          </div>
        </div>
      )}

      {(failedIds.length > 0 && !allFailed) || (requestsFailed && !firstLoad) || viewerZone !== VENUE_TIME_ZONE ? (
        <div className="ch-notes">
          {failedIds.length > 0 && !allFailed && (
            <p className="ch-note is-warn" role="alert">
              {scopeIds.length > 1
                ? fill(copy.partialError, { venues: failedIds.map((id) => venueTitle(appById.get(id))).join(", ") })
                : updatedAt
                  ? fill(copy.refreshFailed, { time: formatClock(updatedAt) })
                  : copy.errorTitle}{" "}
              <button type="button" className="ch-inline-btn" onClick={retry} disabled={refreshing}>
                {copy.retry}
              </button>
            </p>
          )}
          {requestsFailed && !firstLoad && <p className="ch-note">{copy.requestsUnavailable}</p>}
          {viewerZone !== VENUE_TIME_ZONE && <p className="ch-note">{copy.timezoneNote}</p>}
        </div>
      ) : null}

      {firstLoad ? (
        <div className="owner-section-empty" role="status">
          <span className="owner-inline-spinner" aria-hidden="true" />
          <p>{copy.loading}</p>
        </div>
      ) : allFailed ? (
        <div className="owner-section-empty ch-empty" role="alert">
          <span aria-hidden="true">
            <HistoryIcon />
          </span>
          <h3>{copy.errorTitle}</h3>
          <p>{copy.errorHint}</p>
          <button type="button" className="panel-btn ghost ch-btn" onClick={retry} disabled={refreshing}>
            {copy.retry}
          </button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="owner-section-empty ch-empty">
          <span aria-hidden="true">
            <HistoryIcon />
          </span>
          <h3>{active ? copy.emptyFilteredTitle : copy.emptyTitle}</h3>
          <p>{active ? copy.emptyFilteredHint : copy.emptyHint}</p>
          {active && (
            <button type="button" className="panel-btn ghost ch-btn" onClick={() => update(DEFAULT_HISTORY_FILTERS)}>
              {copy.resetFilters}
            </button>
          )}
        </div>
      ) : (
        <div className="ch-groups">
          {groups.map((group) => {
            const heading = dayHeading(group.day);
            return (
              <section key={group.day} className="ch-group" aria-label={heading.relative ? `${heading.relative}, ${heading.date}` : heading.date}>
                <h3 className="ch-group-head">
                  {heading.relative && <strong>{heading.relative}</strong>}
                  <span>{heading.date}</span>
                </h3>
                <ol className="owner-card ch-list">
                  {group.entries.map((entry) => (
                    <li key={entry.id} className={`ch-item tone-${entry.tone}`}>
                      <span className="ch-mark" aria-hidden="true">
                        {CATEGORY_ICONS[entry.category]}
                      </span>
                      <div className="ch-body">
                        <div className="ch-head">
                          <strong className="ch-title">{entry.title}</strong>
                          <time dateTime={new Date(entry.at).toISOString()}>{formatClock(entry.at)}</time>
                        </div>
                        <p className="ch-meta">
                          <span>{entry.actorName}</span>
                          {effectiveScope === ALL && <span className="ch-venue">{entry.venueName}</span>}
                          {!entry.known && <code>{fill(copy.actionCode, { code: entry.action })}</code>}
                        </p>

                        {entry.requestRows.length > 0 ? (
                          <div className="ch-request">
                            <div className="ch-request-head">
                              <span>{copy.requestedLabel}</span>
                              {entry.request && (copy.requestStatus as Record<string, string>)[entry.request.status] && (
                                <span className={`ch-pill status-${entry.request.status.toLowerCase()}`}>
                                  {(copy.requestStatus as Record<string, string>)[entry.request.status]}
                                </span>
                              )}
                            </div>
                            <dl>
                              {entry.requestRows.map((row) => (
                                <div key={row.label}>
                                  <dt>{row.label}</dt>
                                  <dd className={row.empty ? "is-empty" : ""}>
                                    <ArrowIcon />
                                    <span>{row.value}</span>
                                  </dd>
                                </div>
                              ))}
                            </dl>
                          </div>
                        ) : (
                          entry.fieldLabels.length > 0 && (
                            <div className="ch-fields">
                              <span>
                                {entry.request && entry.action !== "PROFILE_CHANGE_REQUESTED"
                                  ? fill(copy.requestFrom, { date: formatDay(dayKey(Date.parse(entry.request.created_at)), locale, { weekday: false }) })
                                  : copy.changedLabel}
                              </span>
                              <ul>
                                {entry.fieldLabels.map((label) => (
                                  <li key={label}>{label}</li>
                                ))}
                              </ul>
                            </div>
                          )
                        )}

                        {entry.note && (
                          <blockquote className="ch-note-quote">
                            <span>{entry.noteLabel}</span>
                            {entry.note}
                          </blockquote>
                        )}

                        {renderLink(entry)}
                      </div>
                    </li>
                  ))}
                </ol>
              </section>
            );
          })}
          {filtered.length > shown.length && (
            <button type="button" className="panel-btn ghost ch-btn ch-more" onClick={() => setVisible((n) => n + PAGE_SIZE)}>
              {fill(copy.showMore, { n: Math.min(PAGE_SIZE, filtered.length - shown.length) })}
            </button>
          )}
        </div>
      )}
    </section>
  );
}
