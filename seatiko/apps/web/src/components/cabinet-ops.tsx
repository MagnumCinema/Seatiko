"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { CabinetRolesCard, RoleBadge } from "@/components/cabinet-roles";
import { QRCodeSVG } from "qrcode.react";
import { FloorPlanEditor } from "@/components/floor-plan-editor";
import {
  draftFromApi,
  draftToApi,
  layoutOf,
  planSignature,
  type FloorPlanState,
} from "@/lib/floor-layout";
import { readFloorLayout, writeFloorLayout } from "@/lib/floor-layout-store";
import { normalizeZone } from "@/lib/floor-zones";
import { useUndoHistory } from "@/lib/use-undo-history";
import { BookingRulesForm } from "@/components/booking-rules-form";
import { useLocale } from "@/components/locale-provider";
import { CabinetMenuPanel } from "@/components/cabinet-menu";
import { useDialogFocus } from "@/lib/use-dialog-focus";
import { SelectMenu } from "@/components/ui/select-menu";
import { CabinetConfirmDialog } from "@/components/cabinet-confirm-dialog";
import { getSiteCopy } from "@/lib/site-copy";
import {
  groupStaffByRole,
  plannerRoles,
  roleColor,
  roleLabel,
  roleNameByKey,
  sortRoles,
} from "@/lib/venue-roles";
import {
  assignVenueStaffRole,
  fetchVenueAnalytics,
  inviteVenueStaff,
  listVenueQR,
  listVenueRoles,
  listVenueStaff,
  regenerateVenueQR,
  removeVenueStaff,
  replaceVenueTables,
  toggleVenueStaffShift,
  type StaffMember,
  type Table,
  type VenueAnalytics,
  type VenueRole,
} from "@/lib/api";

type Props = { venueId: string };

type Notice = { kind: "success" | "error"; text: string };

function OpsNotice({ notice, onClose, closeLabel }: { notice: Notice | null; onClose: () => void; closeLabel: string }) {
  if (!notice) return null;
  return (
    <div
      className={`owner-notice ${notice.kind}`}
      role={notice.kind === "error" ? "alert" : "status"}
      aria-live="polite"
    >
      <span>{notice.kind === "error" ? "!" : "✓"}</span>
      <p>{notice.text}</p>
      <button type="button" aria-label={closeLabel} onClick={onClose}>
        ×
      </button>
    </div>
  );
}

/** Success notices disappear after a few seconds; errors stay until closed. */
function useAutoHideNotice(notice: Notice | null, clear: () => void) {
  useEffect(() => {
    if (!notice || notice.kind !== "success") return;
    const timer = window.setTimeout(clear, 5000);
    return () => window.clearTimeout(timer);
  }, [notice, clear]);
}

const EMPTY_PLAN: FloorPlanState = { tables: [], fixtures: {} };
const FLOOR_DRAFT_PREFIX = "seatiko:floor-draft:";

/**
 * Unsaved edits survive switching cabinet tabs or a reload (sessionStorage), but only on top
 * of the same saved plan they started from; seated / reserved state comes from the server.
 */
function readFloorDraft(venueId: string, base: FloorPlanState): FloorPlanState | null {
  try {
    const raw = window.sessionStorage.getItem(FLOOR_DRAFT_PREFIX + venueId);
    if (!raw) return null;
    const draft = JSON.parse(raw) as { base?: string; plan?: FloorPlanState };
    if (draft.base !== planSignature(base) || !draft.plan || !Array.isArray(draft.plan.tables)) return null;
    const live = new Map(base.tables.map((t) => [t.key, t]));
    return {
      fixtures: draft.plan.fixtures ?? {},
      tables: draft.plan.tables.map((t) => {
        const cur = live.get(t.key);
        return cur ? { ...t, status: cur.status, locked: cur.locked } : t;
      }),
    };
  } catch {
    return null;
  }
}

function writeFloorDraft(venueId: string, base: FloorPlanState, plan: FloorPlanState | null) {
  try {
    if (plan) {
      window.sessionStorage.setItem(FLOOR_DRAFT_PREFIX + venueId, JSON.stringify({ base: planSignature(base), plan }));
    } else {
      window.sessionStorage.removeItem(FLOOR_DRAFT_PREFIX + venueId);
    }
  } catch {
    // Storage may be unavailable (private mode); the draft just isn't kept.
  }
}

/** Editor state from the API tables plus the layout kept for this venue (bar, kitchen, entrance, rotation). */
function planFromTables(tables: Table[], layoutVenueId: string): FloorPlanState {
  const layout = readFloorLayout(layoutVenueId);
  const rotated = new Set(layout.rotated);
  return {
    tables: tables
      .slice()
      .sort((a, b) => a.number - b.number)
      .map((t) => draftFromApi(t, normalizeZone(t.zone), rotated)),
    fixtures: layout.zones,
  };
}

/**
 * Floor & Hall Management Panel (Floor plan, QR codes)
 */
export function CabinetFloorPanel({ venueId }: Props) {
  const { locale } = useLocale();
  const copy = getSiteCopy(locale).cabinet;
  const ui = copy.ui;
  const [tables, setTables] = useState<Table[]>([]);
  const [baseline, setBaseline] = useState<FloorPlanState>(EMPTY_PLAN);
  const plan = useUndoHistory<FloorPlanState>(EMPTY_PLAN);
  const resetPlan = plan.reset;
  const pushPlan = plan.push;
  const [notice, setNotice] = useState<Notice | null>(null);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [confirmRegen, setConfirmRegen] = useState(false);
  const clearNotice = useCallback(() => setNotice(null), []);
  useAutoHideNotice(notice, clearNotice);
  const dirty = useMemo(() => planSignature(plan.present) !== planSignature(baseline), [plan.present, baseline]);

  /** The layout is stored under the real venue id (an unpublished application has none yet). */
  const layoutKey = (list: Table[]) => list[0]?.venue_id || venueId;

  const reload = useCallback(
    async (restoreDraft = false) => {
      const qr = await listVenueQR(venueId);
      const next = planFromTables(qr, qr[0]?.venue_id || venueId);
      setTables(qr);
      setBaseline(next);
      resetPlan(next);
      const draft = restoreDraft ? readFloorDraft(venueId, next) : null;
      if (draft && planSignature(draft) !== planSignature(next)) {
        pushPlan(draft);
        return true;
      }
      return false;
    },
    [venueId, resetPlan, pushPlan],
  );

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      setBusy(true);
      reload(true)
        .then((restored) => {
          if (restored && !cancelled) {
            setNotice({ kind: "success", text: getSiteCopy(locale).cabinet.floorEditor.draftRestored });
          }
        })
        .catch(() => {
          if (!cancelled) setNotice({ kind: "error", text: getSiteCopy(locale).cabinet.ui.floorLoadFailed });
        })
        .finally(() => {
          if (!cancelled) {
            setBusy(false);
            setLoaded(true);
          }
        });
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [venueId]);

  useEffect(() => {
    if (loaded) writeFloorDraft(venueId, baseline, dirty ? plan.present : null);
  }, [loaded, venueId, baseline, dirty, plan.present]);

  // Closing the tab or reloading with an unsaved plan asks first (the browser shows its own text).
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  async function run(action: () => Promise<string | void>, ok: string) {
    setBusy(true);
    setNotice(null);
    try {
      const warning = await action();
      await reload();
      setNotice(warning ? { kind: "error", text: warning } : { kind: "success", text: ok });
    } catch {
      setNotice({ kind: "error", text: ui.opFailed });
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    const state = plan.present;
    setSaving(true);
    try {
      await run(async () => {
        await replaceVenueTables(venueId, state.tables.map(draftToApi));
        // Bar, kitchen, entrance and rotation are not part of the tables API yet (BACKEND_TASKS №28).
        if (!writeFloorLayout(layoutKey(tables), layoutOf(state))) return copy.floorEditor.layoutSaveFailed;
      }, ui.floorSaved);
    } finally {
      setSaving(false);
    }
  }

  const status = saving ? "saving" : dirty ? "unsaved" : "saved";
  const statusText =
    status === "saving" ? copy.floorEditor.statusSaving : status === "unsaved" ? copy.floorEditor.statusUnsaved : copy.floorEditor.statusSaved;

  return (
    <div className="cabinet-ops">
      <OpsNotice notice={notice} onClose={clearNotice} closeLabel={ui.close} />

      {/* Floor Plan Section */}
      <section className="owner-card cabinet-ops-card" aria-busy={busy}>
        <div className="owner-card-head cabinet-ops-floor-head">
          <div>
            <h3>{copy.opsFloorPlan}</h3>
            <p className="cabinet-ops-sub">{copy.opsFloorPlanHint}</p>
          </div>
          <div className="cabinet-ops-floor-actions">
            {loaded && (
              <span className={`floor-save-status ${status}`} role="status" aria-live="polite">
                <i aria-hidden="true" />
                {statusText}
              </span>
            )}
            <button
              type="button"
              className="panel-btn ghost"
              disabled={busy || !dirty}
              onClick={() => {
                // Undoable: the discarded edits come back with Undo.
                plan.push(baseline);
                setNotice({ kind: "success", text: ui.changesReset });
              }}
            >
              {copy.opsFloorPlanReset}
            </button>
            <button
              type="button"
              className="panel-btn"
              disabled={busy || !dirty || plan.present.tables.length === 0}
              onClick={() => void save()}
            >
              {copy.opsFloorPlanSave}
            </button>
          </div>
        </div>
        {!loaded ? (
          <div className="cabinet-ops-loading" role="status">
            <span className="owner-inline-spinner" aria-hidden="true" />
            <p>{ui.loading}</p>
          </div>
        ) : (
          <FloorPlanEditor
            value={plan.present}
            busy={busy}
            onChange={plan.push}
            canUndo={plan.canUndo}
            canRedo={plan.canRedo}
            onUndo={plan.undo}
            onRedo={plan.redo}
          />
        )}

        {tables.length > 0 && (
          <details className="cabinet-ops-qr" open>
            <summary>{copy.opsQrTitle} ({tables.length})</summary>
            <p className="cabinet-ops-sub">{copy.opsQrHint}</p>
            <div className="cabinet-qr-grid">
              {tables.map((t) => {
                const payload = `${venueId}:${t.id}:${t.qr_token || "demo"}`;
                return (
                  <figure key={t.id} className="cabinet-qr-card">
                    <QRCodeSVG value={payload} size={132} level="M" />
                    <figcaption>
                      <strong>{copy.table} {t.number}</strong>
                      <code>{payload}</code>
                    </figcaption>
                  </figure>
                );
              })}
            </div>
            <div className="cabinet-qr-actions">
              <button
                type="button"
                className="panel-btn ghost"
                onClick={() => window.print()}
              >
                {copy.opsQrPrint}
              </button>
              <button
                type="button"
                className="panel-btn ghost danger"
                disabled={busy}
                onClick={() => setConfirmRegen(true)}
              >
                {copy.opsQrRegen}
              </button>
            </div>
          </details>
        )}
      </section>

      <CabinetConfirmDialog
        open={confirmRegen}
        tone="warning"
        title={ui.qrRegenConfirmTitle}
        text={ui.qrRegenConfirmText}
        confirmLabel={ui.qrRegenConfirmBtn}
        cancelLabel={copy.opsMenuCancel}
        busy={busy}
        onCancel={() => setConfirmRegen(false)}
        onConfirm={() => {
          setConfirmRegen(false);
          void run(async () => {
            await regenerateVenueQR(venueId);
          }, ui.qrRegenerated);
        }}
      />
    </div>
  );
}

/**
 * Booking Rules Management Panel
 */
export function CabinetRulesPanel({ venueId }: Props) {
  const { locale } = useLocale();
  const copy = getSiteCopy(locale).cabinet;

  return (
    <div className="cabinet-ops">
      <section className="owner-card cabinet-ops-card">
        <p className="cabinet-ops-sub cabinet-rules-lead">{copy.rulesSubtitle}</p>
        <BookingRulesForm venueId={venueId} />
      </section>
    </div>
  );
}

/**
 * Staff & Analytics Panel
 */
export function CabinetStaffPanel({ venueId }: Props) {
  const { locale } = useLocale();
  const copy = getSiteCopy(locale).cabinet;
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [analytics, setAnalytics] = useState<VenueAnalytics | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [roles, setRoles] = useState<VenueRole[]>([]);
  const [venueType, setVenueType] = useState("");
  const [suggestedRoles, setSuggestedRoles] = useState<string[]>([]);
  const [inviteRole, setInviteRole] = useState("");
  const [staffFilter, setStaffFilter] = useState("all");
  const presetNames = copy.roles.presets as Record<string, string>;
  const orderedRoles = useMemo(() => sortRoles(roles), [roles]);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [removingMember, setRemovingMember] = useState<StaffMember | null>(null);
  const removeModalRef = useRef<HTMLElement>(null);
  useDialogFocus(!!removingMember, removeModalRef, () => setRemovingMember(null));

  useEffect(() => {
    if (!removingMember) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [removingMember]);

  async function reload() {
    const [members, stats, roleData] = await Promise.all([
      listVenueStaff(venueId),
      // A draft has no live floor yet (analytics 404); the team and roles still load.
      fetchVenueAnalytics(venueId).catch(() => null),
      listVenueRoles(venueId),
    ]);
    setStaff(members);
    setAnalytics(stats);
    setRoles(roleData.roles);
    setVenueType(roleData.venue_type);
    setSuggestedRoles(roleData.suggested);
  }

  async function reloadTeam() {
    const [members, roleData] = await Promise.all([listVenueStaff(venueId), listVenueRoles(venueId)]);
    setStaff(members);
    setRoles(roleData.roles);
    setVenueType(roleData.venue_type);
    setSuggestedRoles(roleData.suggested);
  }

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      setBusy(true);
      reload()
        .catch(() => {
          if (!cancelled) {
            setMessage(
              locale === "ro"
                ? "Eroare la încărcarea datelor personalului"
                : locale === "en"
                ? "Failed to load staff data"
                : "Не удалось загрузить данные персонала",
            );
          }
        })
        .finally(() => {
          if (!cancelled) setBusy(false);
        });
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [venueId]);

  async function run(action: () => Promise<void>, ok: string) {
    setBusy(true);
    setMessage(null);
    try {
      await action();
      await reload();
      setMessage(ok);
    } catch {
      setMessage(
        locale === "ro"
          ? "Eroare la executarea operațiunii"
          : locale === "en"
          ? "Operation error"
          : "Ошибка операции",
      );
    } finally {
      setBusy(false);
    }
  }


  return (
    <div className="cabinet-ops">
      {message && (
        <div className="owner-notice success" role="alert">
          <span>✓</span>
          <p>{message}</p>
        </div>
      )}
      {busy && (
        <p className="fa-muted">
          {locale === "ro" ? "Se încarcă…" : locale === "en" ? "Loading…" : "Загрузка…"}
        </p>
      )}

      {/* Shift Analytics Section */}
      {analytics && (
        <section className="owner-card cabinet-ops-card">
          <div className="owner-card-head">
            <div>
              <span className="owner-kicker">{copy.staff}</span>
              <h3>{copy.opsAnalyticsTitle}</h3>
              <p className="cabinet-ops-sub">
                {locale === "ro"
                  ? "Indicatori operaționali în timp real pentru tura curentă"
                  : locale === "en"
                  ? "Real-time operational indicators for current shift"
                  : "Оперативные показатели текущей смены в реальном времени"}
              </p>
            </div>
          </div>
          <div className="owner-metrics">
            <article>
              <span>{locale === "ro" ? "Total mese" : locale === "en" ? "Total tables" : "Всего столов"}</span>
              <strong>{analytics.total_tables}</strong>
            </article>
            <article>
              <span>{locale === "ro" ? "Mese libere" : locale === "en" ? "Free tables" : "Свободно столов"}</span>
              <strong>{analytics.free_tables}</strong>
            </article>
            <article>
              <span>{locale === "ro" ? "Chemări chelner" : locale === "en" ? "Waiter calls" : "Вызовы официанта"}</span>
              <strong>{analytics.waiter_calls_pending}</strong>
            </article>
          </div>
        </section>
      )}

      <CabinetRolesCard
        venueId={venueId}
        roles={roles}
        staff={staff}
        venueType={venueType}
        suggested={suggestedRoles}
        onChanged={reloadTeam}
      />

      {/* Staff Management Section */}
      <section className="owner-card cabinet-ops-card">
        <div className="owner-card-head">
          <div>
            <span className="owner-kicker">{copy.staff}</span>
            <h3>{copy.opsStaffTitle}</h3>
            <p className="cabinet-ops-sub">
              {locale === "ro"
                ? "Invitați angajați și atribuiți-le un rol al localului"
                : locale === "en"
                ? "Invite team members and give each a venue role"
                : "Приглашайте сотрудников и назначайте каждому роль заведения"}
            </p>
          </div>
        </div>

        <form
          className="cabinet-staff-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (!email.trim()) return;
            void run(async () => {
              const created = await inviteVenueStaff(venueId, email.trim(), name.trim(), inviteRole);
              setStaff((prev) => [...prev, created]);
              setEmail("");
              setName("");
              setInviteRole("");
            }, locale === "ro" ? "Invitația a fost expediată" : locale === "en" ? "Invitation sent" : "Приглашение отправлено");
          }}
        >
          <div className="cabinet-ops-inputs-grid cabinet-staff-invite-grid">
            <SelectMenu
              value={inviteRole || (plannerRoles(roles)[0] ?? orderedRoles[0])?.key || ""}
              onChange={setInviteRole}
              className="cabinet-staff-role-select"
              ariaLabel={copy.opsStaffRoleLabel}
              options={orderedRoles.map((r) => ({
                value: r.key,
                label: roleLabel(r, presetNames),
                color: r.color || "#64748b",
              }))}
            />
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={locale === "ro" ? "Nume și prenume" : locale === "en" ? "Full name" : "Имя и фамилия"}
              type="text"
              className="cabinet-staff-input"
            />
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={copy.opsStaffPlaceholder}
              type="email"
              inputMode="email"
              required
              className="cabinet-staff-input"
            />
            <button
              type="submit"
              className="panel-btn"
              disabled={busy || !email.trim()}
            >
              {copy.opsStaffInvite}
            </button>
          </div>
        </form>

        {staff.length > 0 && (
          <div className="cabinet-category-pills cabinet-staff-filter-pills" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={staffFilter === "all"}
              className={staffFilter === "all" ? "active" : ""}
              onClick={() => setStaffFilter("all")}
            >
              {copy.opsScheduleTabAll} ({staff.length})
            </button>
            {groupStaffByRole(staff, roles).map(({ role, members }) => (
              <button
                key={role.key}
                type="button"
                role="tab"
                aria-selected={staffFilter === role.key}
                className={staffFilter === role.key ? "active" : ""}
                onClick={() => setStaffFilter(role.key)}
              >
                <span className="cabinet-role-pill-dot" style={{ "--role-color": role.color } as CSSProperties} aria-hidden="true" />
                {roleLabel(role, presetNames)} ({members.length})
              </button>
            ))}
          </div>
        )}

        <ul className="cabinet-staff-cards-list">
          {staff.length === 0 ? (
            <li className="cabinet-staff-empty fa-muted">
              {locale === "ro"
                ? "Niciun membru al personalului adăugat încă"
                : locale === "en"
                ? "No staff members added yet"
                : "Сотрудники пока не добавлены"}
            </li>
          ) : (
            staff
              .filter((m) => staffFilter === "all" || m.role === staffFilter)
              .map((member) => {
              const displayName = member.name?.trim() || member.email.split("@")[0];
              const isOnShift = member.on_shift ?? (member.status === "ACTIVE");
              return (
                <li key={member.id} className="cabinet-staff-card">
                  <div className="cabinet-staff-card-left">
                    <span className="cabinet-staff-avatar" aria-hidden="true">
                      {displayName.slice(0, 2).toUpperCase()}
                    </span>
                    <div className="cabinet-staff-info">
                      <div className="cabinet-staff-name-row">
                        <strong className="cabinet-staff-name">{displayName}</strong>
                        <RoleBadge
                          label={roleNameByKey(member.role, roles, presetNames)}
                          color={roleColor(member.role, roles)}
                        />
                        <span className={`cabinet-staff-shift-pill ${isOnShift ? "on-shift" : "off-shift"}`}>
                          <span className="cabinet-staff-shift-dot" />
                          {isOnShift
                            ? (locale === "ro" ? "În tură" : locale === "en" ? "On shift" : "На смене")
                            : (locale === "ro" ? "În afara turei" : locale === "en" ? "Off shift" : "Не на смене")}
                        </span>
                      </div>
                      <span className="cabinet-staff-email">{member.email}</span>
                      <small className="cabinet-staff-meta">
                        {member.status === "ACTIVE"
                          ? (locale === "ro" ? "Activ" : locale === "en" ? "Active" : "Активен")
                          : (locale === "ro" ? "Invitație trimisă" : locale === "en" ? "Invited" : "Приглашён")}
                      </small>
                    </div>
                  </div>

                  <div className="cabinet-staff-card-actions">
                    <SelectMenu
                      className="cabinet-staff-role-assign"
                      size="compact"
                      fullWidth={false}
                      value={member.role}
                      disabled={busy}
                      ariaLabel={`${copy.roles.assignLabel}: ${displayName}`}
                      onChange={(next) => {
                        void run(async () => {
                          const updated = await assignVenueStaffRole(venueId, member.id, next);
                          setStaff((prev) => prev.map((s) => (s.id === member.id ? { ...s, role: updated.role } : s)));
                        }, copy.roles.assigned);
                      }}
                      options={[
                        ...(!roles.some((r) => r.key === member.role)
                          ? [{ value: member.role, label: member.role, color: roleColor(member.role, roles) }]
                          : []),
                        ...orderedRoles.map((r) => ({
                          value: r.key,
                          label: roleLabel(r, presetNames),
                          color: r.color || "#64748b",
                        })),
                      ]}
                    />
                    <button
                      type="button"
                      className={`panel-btn ghost sm ${isOnShift ? "shift-active" : ""}`}
                      disabled={busy}
                      title={
                        isOnShift
                          ? (locale === "ro" ? "Încheie tura" : locale === "en" ? "End shift" : "Завершить смену")
                          : (locale === "ro" ? "Deschide tura" : locale === "en" ? "Start shift" : "Выйти на смену")
                      }
                      onClick={() =>
                        run(async () => {
                          const updated = await toggleVenueStaffShift(venueId, member.id, !isOnShift);
                          setStaff((prev) =>
                            prev.map((s) => (s.id === member.id ? { ...s, on_shift: updated.on_shift } : s)),
                          );
                        }, !isOnShift
                          ? (locale === "ro" ? "Personalul a intrat în tură" : locale === "en" ? "Staff entered shift" : "Сотрудник вышел на смену")
                          : (locale === "ro" ? "Tura a fost încheiată" : locale === "en" ? "Shift ended" : "Смена завершена"))
                      }
                    >
                      {isOnShift
                        ? (locale === "ro" ? "Încheie tura" : locale === "en" ? "End shift" : "Завершить смену")
                        : (locale === "ro" ? "Deschide tura" : locale === "en" ? "Start shift" : "Выйти на смену")}
                    </button>

                    <button
                      type="button"
                      className="panel-btn ghost sm danger cabinet-staff-delete-btn"
                      disabled={busy}
                      title={locale === "ro" ? "Elimină personalul" : locale === "en" ? "Remove staff member" : "Удалить сотрудника"}
                      onClick={() => setRemovingMember(member)}
                    >
                      {locale === "ro" ? "Elimină" : locale === "en" ? "Remove" : "Удалить"}
                    </button>
                  </div>
                </li>
              );
            })
          )}
        </ul>
      </section>

      {removingMember && typeof document !== "undefined" && createPortal(
        <div className="booking-popup-root cabinet-delete-modal-root" role="presentation">
          <button
            type="button"
            className="booking-popup-backdrop"
            aria-label={copy.opsMenuCancel}
            onClick={() => setRemovingMember(null)}
          />
          <section
            ref={removeModalRef}
            className="booking-popup cabinet-delete-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="cabinet-staff-delete-title"
          >
            <div className="booking-popup-card cabinet-delete-card">
              <button
                type="button"
                className="booking-popup-x"
                onClick={() => setRemovingMember(null)}
                aria-label={copy.opsMenuCancel}
              >
                ×
              </button>
              <div className="cabinet-delete-icon" aria-hidden="true">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                  <line x1="10" y1="11" x2="10" y2="17" />
                  <line x1="14" y1="11" x2="14" y2="17" />
                </svg>
              </div>
              <h3 id="cabinet-staff-delete-title">
                {locale === "ro"
                  ? "Eliminați angajatul?"
                  : locale === "en"
                  ? "Remove staff member?"
                  : "Удалить сотрудника?"}
              </h3>
              <p className="cabinet-delete-text">
                {locale === "ro"
                  ? `Sigur doriți să îl eliminați pe ${removingMember.name?.trim() || removingMember.email} din echipa localului?`
                  : locale === "en"
                  ? `Are you sure you want to remove ${removingMember.name?.trim() || removingMember.email} from the venue staff?`
                  : `Вы уверены, что хотите удалить ${removingMember.name?.trim() || removingMember.email} из списка персонала заведения?`}
              </p>
              <div className="cabinet-delete-actions">
                <button
                  type="button"
                  className="panel-btn danger"
                  disabled={busy}
                  onClick={() => {
                    const target = removingMember;
                    void run(async () => {
                      await removeVenueStaff(venueId, target.id);
                      setStaff((prev) => prev.filter((s) => s.id !== target.id));
                      setRemovingMember(null);
                    }, locale === "ro" ? "Personalul a fost eliminat" : locale === "en" ? "Staff member removed" : "Сотрудник удалён");
                  }}
                >
                  {locale === "ro" ? "Elimină" : locale === "en" ? "Remove" : "Удалить"}
                </button>
                <button
                  type="button"
                  className="panel-btn ghost"
                  data-autofocus
                  disabled={busy}
                  onClick={() => setRemovingMember(null)}
                >
                  {copy.opsMenuCancel}
                </button>
              </div>
            </div>
          </section>
        </div>,
        document.body,
      )}
    </div>
  );
}

/**
 * Combined operations panel for backwards compatibility
 */
export function CabinetOpsPanel({ venueId }: Props) {
  return (
    <div style={{ display: "grid", gap: 24 }}>
      <CabinetFloorPanel venueId={venueId} />
      <CabinetMenuPanel venueId={venueId} />
    </div>
  );
}
