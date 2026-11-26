"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { CabinetRolesCard, RoleBadge } from "@/components/cabinet-roles";
import { QRCodeSVG } from "qrcode.react";
import {
  FloorPlanEditor,
  tablesToDraft,
  type FloorDraftTable,
} from "@/components/floor-plan-editor";
import { BookingRulesForm } from "@/components/booking-rules-form";
import { useLocale } from "@/components/locale-provider";
import { LeafIcon, FlameIcon } from "@/components/venue-icons";
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
  deleteOwnerMenuItem,
  emptyLocalized,
  fetchVenueAnalytics,
  inviteVenueStaff,
  listOwnerMenu,
  listVenueQR,
  listVenueRoles,
  listVenueStaff,
  mediaUrl,
  pickLocale,
  regenerateVenueQR,
  removeVenueStaff,
  replaceVenueTables,
  stopOwnerMenuItem,
  toggleVenueStaffShift,
  updateOwnerMenuItem,
  upsertOwnerMenuItem,
  type MenuItem,
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

const CATEGORIES = [
  "Закуски",
  "Супы",
  "Салаты",
  "Основное",
  "Десерты",
  "Напитки",
  "Бар",
];

const CATEGORY_NAMES: Record<string, { ru: string; ro: string; en: string }> = {
  Закуски: { ru: "Закуски", ro: "Gustări", en: "Appetizers" },
  Супы: { ru: "Супы", ro: "Supe", en: "Soups" },
  Салаты: { ru: "Салаты", ro: "Salate", en: "Salads" },
  Основное: { ru: "Основное", ro: "Feluri principale", en: "Mains" },
  Десерты: { ru: "Десерты", ro: "Deserturi", en: "Desserts" },
  Напитки: { ru: "Напитки", ro: "Băuturi", en: "Drinks" },
  Бар: { ru: "Бар", ro: "Bar", en: "Bar" },
};

type Localized = { ru: string; en: string; ro: string };

/** Category key used for grouping: the Russian name, like the stored data. */
function categoryKey(item: MenuItem): string {
  return item.category.ru || item.category.en || item.category.ro || "";
}

/** Writes `value` into the current language, keeping the other translations; fills empty ones. */
function mergeLocalized(previous: Partial<Localized> | undefined, locale: string, value: string): Localized {
  const base = { ru: previous?.ru ?? "", en: previous?.en ?? "", ro: previous?.ro ?? "" };
  const original = base[locale as keyof Localized];
  const next = { ...base, [locale]: value } as Localized;
  // Languages that only mirrored the old text (or were empty) follow the edit.
  (["ru", "en", "ro"] as const).forEach((code) => {
    if (code !== locale && (!next[code] || next[code] === original)) next[code] = value;
  });
  return next;
}

type MenuForm = {
  id?: string;
  name: string;
  category: string;
  description: string;
  price: string;
  alcohol: boolean;
  image_url: string;
  weight_g: string;
  allergens: string;
  isPopular: boolean;
  isVeg: boolean;
  isSpicy: boolean;
};

const emptyForm = (defaultCategory = "Основное"): MenuForm => ({
  name: "",
  category: defaultCategory,
  description: "",
  price: "80",
  alcohol: false,
  image_url: "",
  weight_g: "",
  allergens: "",
  isPopular: false,
  isVeg: false,
  isSpicy: false,
});

/**
 * Floor & Hall Management Panel (Floor plan, QR codes)
 */
export function CabinetFloorPanel({ venueId }: Props) {
  const { locale } = useLocale();
  const copy = getSiteCopy(locale).cabinet;
  const ui = copy.ui;
  const [tables, setTables] = useState<Table[]>([]);
  const [draft, setDraft] = useState<FloorDraftTable[]>([]);
  const [dirty, setDirty] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [confirmRegen, setConfirmRegen] = useState(false);
  const clearNotice = useCallback(() => setNotice(null), []);
  useAutoHideNotice(notice, clearNotice);

  async function reload() {
    const qr = await listVenueQR(venueId);
    setTables(qr);
    setDraft(tablesToDraft(qr));
    setDirty(false);
  }

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      setBusy(true);
      reload()
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

  // Closing the tab or reloading with an unsaved plan asks first (the browser shows its own text).
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  async function run(action: () => Promise<void>, ok: string) {
    setBusy(true);
    setNotice(null);
    try {
      await action();
      await reload();
      setNotice({ kind: "success", text: ok });
    } catch {
      setNotice({ kind: "error", text: ui.opFailed });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="cabinet-ops">
      <OpsNotice notice={notice} onClose={clearNotice} closeLabel={ui.close} />

      {/* Floor Plan Section */}
      <section className="owner-card cabinet-ops-card" aria-busy={busy}>
        <div className="owner-card-head cabinet-ops-floor-head">
          <div>
            <h3>{copy.opsFloorPlan}</h3>
            <p className="cabinet-ops-sub">{copy.opsFloorPlanHint}</p>
            {dirty && <span className="cabinet-ops-unsaved">{copy.opsUnsavedChanges}</span>}
          </div>
          <div className="cabinet-ops-floor-actions">
            <button
              type="button"
              className="panel-btn ghost"
              disabled={busy || !dirty}
              onClick={() => {
                setDraft(tablesToDraft(tables));
                setDirty(false);
                setNotice({ kind: "success", text: ui.changesReset });
              }}
            >
              {copy.opsFloorPlanReset}
            </button>
            <button
              type="button"
              className="panel-btn"
              disabled={busy || !dirty || draft.length === 0}
              onClick={() =>
                run(async () => {
                  await replaceVenueTables(
                    venueId,
                    draft.map((t) => ({
                      number: t.number,
                      seats: t.seats,
                      x: t.x,
                      y: t.y,
                      zone: t.zone || "hall",
                    })),
                  );
                }, ui.floorSaved)
              }
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
            tables={draft}
            busy={busy}
            onChange={(next) => {
              setDraft(next);
              setDirty(true);
            }}
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
 * Menu & Stop-List Management Panel
 */
export function CabinetMenuPanel({ venueId }: Props) {
  const { locale } = useLocale();
  const copy = getSiteCopy(locale).cabinet;
  const ui = copy.ui;
  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [form, setForm] = useState<MenuForm>(() => emptyForm());
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [deletingDish, setDeletingDish] = useState<MenuItem | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const clearNotice = useCallback(() => setNotice(null), []);
  useAutoHideNotice(notice, clearNotice);

  const modalRef = useRef<HTMLElement>(null);

  useDialogFocus(isModalOpen, modalRef, () => setIsModalOpen(false));

  useEffect(() => {
    if (!isModalOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [isModalOpen]);

  async function reload() {
    const items = await listOwnerMenu(venueId);
    setMenu(items);
  }

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      setBusy(true);
      reload()
        .catch(() => {
          if (!cancelled) setNotice({ kind: "error", text: getSiteCopy(locale).cabinet.ui.menuLoadFailed });
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

  async function run(action: () => Promise<void>, ok: string, failed: string = ui.menuSaveFailed): Promise<boolean> {
    setBusy(true);
    setNotice(null);
    try {
      await action();
      await reload();
      setNotice({ kind: "success", text: ok });
      return true;
    } catch {
      setNotice({ kind: "error", text: failed });
      return false;
    } finally {
      setBusy(false);
    }
  }

  const dishName = (item: MenuItem) => pickLocale(item.name, locale) || item.name.ru || item.name.en || "";
  const dishDescription = (item: MenuItem) =>
    pickLocale(item.description, locale) || item.description.ru || item.description.en || "";

  /** Categories in the order the venue's menu lists them. */
  const categories = useMemo(() => {
    const keys: string[] = [];
    const labels = new Map<string, string>();
    for (const item of menu) {
      const key = categoryKey(item);
      if (!key) continue;
      if (!labels.has(key)) {
        labels.set(key, pickLocale(item.category, locale) || CATEGORY_NAMES[key]?.[locale] || key);
        keys.push(key);
      }
    }
    return keys.map((key) => ({ key, label: labels.get(key) ?? key }));
  }, [menu, locale]);

  const categoryOptions = useMemo(() => {
    const options = CATEGORIES.map((key) => ({ key, label: CATEGORY_NAMES[key]?.[locale] || key }));
    for (const category of categories) {
      if (!CATEGORIES.includes(category.key)) options.push(category);
    }
    return options;
  }, [categories, locale]);

  function editItem(item: MenuItem) {
    const tags = item.tags ?? [];
    const allergens = item.allergens ?? [];
    setFormError(null);
    setForm({
      id: item.id,
      name: dishName(item),
      category: categoryKey(item) || "Основное",
      description: dishDescription(item),
      price: String(item.price),
      alcohol: !!item.contains_alcohol,
      image_url: item.image_url || "",
      weight_g: item.weight_g ? String(item.weight_g) : "",
      allergens: allergens.join(", "),
      isPopular: tags.includes("popular"),
      isVeg: tags.includes("vegetarian"),
      isSpicy: tags.includes("spicy"),
    });
    setIsModalOpen(true);
  }

  function openAddDish() {
    setFormError(null);
    setForm(emptyForm(selectedCategory !== "all" ? selectedCategory : "Основное"));
    setIsModalOpen(true);
  }

  async function saveDish() {
    const name = form.name.trim();
    if (!name) return;
    if (!(Number(form.price) > 0)) {
      setFormError(ui.priceRequired);
      document.getElementById("edit-dish-price")?.focus();
      return;
    }
    setFormError(null);
    const original = form.id ? menu.find((item) => item.id === form.id) : undefined;
    const categorySample = menu.find((item) => categoryKey(item) === form.category);
    const tags: string[] = [];
    if (form.isPopular) tags.push("popular");
    if (form.isVeg) tags.push("vegetarian");
    if (form.isSpicy) tags.push("spicy");

    const allergens = form.allergens
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);

    const payload: Partial<MenuItem> & { name: { ru: string; en: string; ro: string }; price: number } = {
      name: original ? mergeLocalized(original.name, locale, name) : emptyLocalized(name),
      category: categorySample
        ? { ru: categorySample.category.ru, en: categorySample.category.en, ro: categorySample.category.ro }
        : CATEGORY_NAMES[form.category] ?? emptyLocalized(form.category.trim() || "Основное"),
      description: original
        ? mergeLocalized(original.description, locale, form.description.trim())
        : emptyLocalized(form.description.trim()),
      price: Number(form.price) || 0,
      contains_alcohol: form.alcohol,
      image_url: form.image_url.trim() || undefined,
      weight_g: form.weight_g ? Number(form.weight_g) : undefined,
      tags,
      allergens: allergens.length > 0 ? allergens : undefined,
    };

    // On failure the popup stays open so nothing typed is lost.
    const ok = await run(async () => {
      if (form.id) {
        await updateOwnerMenuItem(venueId, form.id, payload);
      } else {
        await upsertOwnerMenuItem(venueId, payload);
      }
    }, form.id ? ui.dishUpdated : ui.dishAdded);
    if (ok) {
      setIsModalOpen(false);
      setForm(emptyForm());
    } else {
      setFormError(ui.menuSaveFailed);
    }
  }

  async function handleDeleteDish() {
    if (!deletingDish) return;
    const dish = deletingDish;
    await run(async () => {
      await deleteOwnerMenuItem(venueId, dish.id);
      if (form.id === dish.id) {
        setIsModalOpen(false);
        setForm(emptyForm());
      }
    }, ui.dishRemoved, ui.opFailed);
    setDeletingDish(null);
  }

  const filteredDishes = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const haystack = (value: Partial<Localized>) =>
      [value.ru, value.en, value.ro].filter(Boolean).join(" ").toLowerCase();
    return menu.filter((item) => {
      const matchCat = selectedCategory === "all" || categoryKey(item) === selectedCategory;
      const matchQuery =
        !query || haystack(item.name).includes(query) || haystack(item.description).includes(query);
      return matchCat && matchQuery;
    });
  }, [menu, selectedCategory, searchQuery]);

  // Cheap to compute; plain function keeps the React Compiler happy.
  const grouped = (() => {
    const groups = categories
      .map((category) => ({
        cat: category.key,
        label: category.label,
        items: filteredDishes.filter((m) => categoryKey(m) === category.key),
      }))
      .filter((g) => g.items.length > 0);
    const uncategorized = filteredDishes.filter((m) => !categoryKey(m));
    return uncategorized.length
      ? [...groups, { cat: "other", label: ui.other, items: uncategorized }]
      : groups;
  })();

  return (
    <div className="cabinet-ops">
      <OpsNotice notice={notice} onClose={clearNotice} closeLabel={ui.close} />

      {/* Menu Catalog & Stop List */}
      <section className="owner-card cabinet-ops-card" aria-busy={busy}>
        <div className="owner-card-head cabinet-menu-head">
          <div>
            <h3>{copy.menuSectionTitle} ({menu.length})</h3>
            <p className="cabinet-ops-sub">{copy.menuSectionSubtitle}</p>
          </div>
          <div className="cabinet-menu-head-actions">
            <input
              type="search"
              aria-label={ui.searchDish}
              placeholder={ui.searchDish}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="cabinet-search-input"
            />
            <button
              type="button"
              className="panel-btn primary cabinet-add-dish-btn"
              onClick={openAddDish}
            >
              + {copy.opsMenuAddDish}
            </button>
          </div>
        </div>

        {/* Category Filter Pills */}
        {menu.length > 0 && (
          <div className="cabinet-category-pills" role="group" aria-label={ui.menuCategories}>
            <button
              type="button"
              className={selectedCategory === "all" ? "active" : ""}
              aria-pressed={selectedCategory === "all"}
              onClick={() => setSelectedCategory("all")}
            >
              {ui.all} ({menu.length})
            </button>
            {categories.map((category) => {
              const count = menu.filter((m) => categoryKey(m) === category.key).length;
              return (
                <button
                  key={category.key}
                  type="button"
                  className={selectedCategory === category.key ? "active" : ""}
                  aria-pressed={selectedCategory === category.key}
                  onClick={() => setSelectedCategory(category.key)}
                >
                  {category.label} ({count})
                </button>
              );
            })}
          </div>
        )}

        {!loaded ? (
          <div className="cabinet-ops-loading" role="status">
            <span className="owner-inline-spinner" aria-hidden="true" />
            <p>{ui.loading}</p>
          </div>
        ) : menu.length === 0 ? (
          <div className="cabinet-ops-empty cabinet-menu-empty">
            <p>{copy.opsMenuEmpty}</p>
            <button
              type="button"
              className="panel-btn primary cabinet-add-dish-btn"
              onClick={openAddDish}
            >
              + {copy.opsMenuAddDish}
            </button>
          </div>
        ) : filteredDishes.length === 0 ? (
          <div className="cabinet-ops-empty cabinet-menu-empty">
            <p>{ui.noDishesFound}</p>
            <button
              type="button"
              className="panel-btn ghost"
              onClick={() => {
                setSearchQuery("");
                setSelectedCategory("all");
              }}
            >
              {ui.resetSearch}
            </button>
          </div>
        ) : (
          <div className="cabinet-menu-list">
            {grouped.map((group) => (
              <div key={group.cat} className="cabinet-menu-group">
                <h4>{group.label}</h4>
                <ul>
                  {group.items.map((item) => (
                    <li key={item.id} className={item.stopped ? "stopped" : ""}>
                      <div className="cabinet-dish-info">
                        <div className="cabinet-dish-title-row">
                          <strong>{dishName(item)}</strong>
                          <span className="cabinet-dish-price">{item.price} MDL</span>
                        </div>
                        {(item.contains_alcohol || item.stopped) && (
                          <div className="cabinet-dish-badges">
                            {item.contains_alcohol && <span className="cabinet-dish-adult-badge">18+</span>}
                            {item.stopped && <span className="cabinet-dish-stop-badge">{ui.stoppedBadge}</span>}
                          </div>
                        )}
                        {dishDescription(item) ? <p>{dishDescription(item)}</p> : null}
                      </div>
                      <div className="cabinet-menu-actions">
                        <button
                          type="button"
                          className="panel-btn ghost sm"
                          onClick={() => editItem(item)}
                        >
                          {copy.opsMenuEdit}
                        </button>
                        <button
                          type="button"
                          className="panel-btn ghost sm"
                          disabled={busy}
                          aria-pressed={!!item.stopped}
                          onClick={() =>
                            void run(
                              async () => {
                                await stopOwnerMenuItem(venueId, item.id, !item.stopped);
                              },
                              (item.stopped ? ui.stopListOff : ui.stopListOn).replace("{name}", dishName(item)),
                              ui.opFailed,
                            )
                          }
                        >
                          {item.stopped ? copy.opsMenuResume : copy.opsMenuStop}
                        </button>
                        <button
                          type="button"
                          className="panel-btn ghost sm danger"
                          onClick={() => setDeletingDish(item)}
                        >
                          {copy.opsMenuDelete}
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Dish Edit / Add Modal Popup matching Client Dish Details */}
      {isModalOpen && typeof document !== "undefined" && createPortal(
        <div className="booking-popup-root menu-dish-popup-root" role="presentation">
          <button
            type="button"
            className="booking-popup-backdrop"
            aria-label={copy.opsMenuCancel}
            onClick={() => setIsModalOpen(false)}
          />
          <section
            ref={modalRef}
            className="booking-popup menu-dish-popup cabinet-dish-popup"
            role="dialog"
            aria-modal="true"
            aria-label={form.id ? copy.opsMenuEditDish : copy.opsMenuAddDish}
            aria-labelledby="cabinet-dish-popup-title"
          >
            <div className="booking-popup-card menu-dish-popup-card cabinet-dish-popup-card">
              <button
                type="button"
                className="booking-popup-x menu-dish-popup-x"
                onClick={() => setIsModalOpen(false)}
                aria-label={copy.opsMenuCancel}
              >
                ×
              </button>

              <div className="menu-dish-popup-layout cabinet-dish-edit-layout">
                {/* Media column */}
                <div className="cabinet-dish-edit-media">
                  {form.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={mediaUrl(form.image_url)} alt={form.name || "Dish photo"} />
                  ) : (
                    <div className="cabinet-dish-media-placeholder">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
                        <rect width="18" height="18" x="3" y="3" rx="2" ry="2"/>
                        <circle cx="9" cy="9" r="2"/>
                        <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>
                      </svg>
                      <span>{copy.opsMenuNoPhoto}</span>
                    </div>
                  )}
                  <div className="cabinet-dish-media-input-bar">
                    <label htmlFor="edit-dish-photo">{copy.opsMenuPhotoUrl}</label>
                    <input
                      id="edit-dish-photo"
                      value={form.image_url}
                      onChange={(e) => setForm((f) => ({ ...f, image_url: e.target.value }))}
                      placeholder={copy.opsMenuPhotoPlaceholder}
                    />
                  </div>
                </div>

                {/* Form fields column */}
                <form
                  className="menu-dish-popup-copy"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void saveDish();
                  }}
                >
                  <div className="menu-dish-popup-top">
                    <div>
                      <label htmlFor="edit-dish-name" className="sr-only">
                        {copy.opsMenuNamePlaceholder}
                      </label>
                      <input
                        id="edit-dish-name"
                        className="cabinet-dish-title-input"
                        value={form.name}
                        onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                        placeholder={copy.opsMenuNamePlaceholder}
                        required
                        data-autofocus
                      />
                    </div>

                    <div className="cabinet-dish-meta-grid">
                      <div className="cabinet-dish-field-wrap">
                        <label htmlFor="edit-dish-cat">{copy.opsMenuCategoryLabel}</label>
                        <SelectMenu
                          id="edit-dish-cat"
                          value={form.category}
                          onChange={(value) => setForm((f) => ({ ...f, category: value }))}
                          options={categoryOptions.map((option) => ({
                            value: option.key,
                            label: option.label,
                          }))}
                        />
                      </div>
                      <div className="cabinet-dish-field-wrap">
                        <label htmlFor="edit-dish-weight">{copy.opsMenuWeight}</label>
                        <input
                          id="edit-dish-weight"
                          type="number"
                          min="0"
                          placeholder="300"
                          value={form.weight_g}
                          onChange={(e) => setForm((f) => ({ ...f, weight_g: e.target.value }))}
                        />
                      </div>
                    </div>

                    <div className="cabinet-dish-tag-buttons">
                      <button
                        type="button"
                        className={`cabinet-dish-tag-btn ${form.alcohol ? "active adult" : ""}`}
                        onClick={() => setForm((f) => ({ ...f, alcohol: !f.alcohol }))}
                      >
                        {copy.opsMenuAlcohol}
                      </button>
                      <button
                        type="button"
                        className={`cabinet-dish-tag-btn ${form.isPopular ? "active popular" : ""}`}
                        onClick={() => setForm((f) => ({ ...f, isPopular: !f.isPopular }))}
                      >
                        ★ {copy.opsMenuPopular}
                      </button>
                      <button
                        type="button"
                        className={`cabinet-dish-tag-btn ${form.isVeg ? "active veg" : ""}`}
                        onClick={() => setForm((f) => ({ ...f, isVeg: !f.isVeg }))}
                      >
                        <LeafIcon className="menu-tag-icon" /> {copy.opsMenuVeg}
                      </button>
                      <button
                        type="button"
                        className={`cabinet-dish-tag-btn ${form.isSpicy ? "active spicy" : ""}`}
                        onClick={() => setForm((f) => ({ ...f, isSpicy: !f.isSpicy }))}
                      >
                        <FlameIcon className="menu-tag-icon" /> {copy.opsMenuSpicy}
                      </button>
                    </div>
                  </div>

                  <div className="menu-dish-popup-block">
                    <h3>{copy.opsMenuDescPlaceholder}</h3>
                    <textarea
                      id="edit-dish-desc"
                      className="cabinet-dish-desc-textarea"
                      rows={3}
                      value={form.description}
                      onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                      placeholder={copy.opsMenuDescPlaceholder}
                    />
                  </div>

                  <div className="menu-dish-popup-allergens">
                    <span className="menu-dish-popup-alert" aria-hidden="true">
                      !
                    </span>
                    <div style={{ flex: 1 }}>
                      <strong>{copy.opsMenuAllergens}</strong>
                      <input
                        id="edit-dish-allergens"
                        className="cabinet-dish-allergens-input"
                        value={form.allergens}
                        onChange={(e) => setForm((f) => ({ ...f, allergens: e.target.value }))}
                        placeholder={copy.opsMenuAllergensPlaceholder}
                      />
                    </div>
                  </div>

                  {formError && (
                    <p className="cabinet-dish-form-error" role="alert">
                      {formError}
                    </p>
                  )}
                  <div className="cabinet-dish-actions-bar">
                    <div className="cabinet-dish-price-input-box">
                      <label htmlFor="edit-dish-price" className="sr-only">
                        {copy.opsMenuPricePlaceholder}
                      </label>
                      <span className="cabinet-dish-price-prefix">{copy.opsMenuPriceLabel}</span>
                      <input
                        id="edit-dish-price"
                        type="number"
                        min="0"
                        step="1"
                        required
                        value={form.price}
                        onChange={(e) => {
                          setFormError(null);
                          setForm((f) => ({ ...f, price: e.target.value }));
                        }}
                        placeholder="0"
                        aria-invalid={formError === ui.priceRequired ? true : undefined}
                      />
                      <span className="cabinet-dish-currency">MDL</span>
                    </div>

                    <button
                      type="submit"
                      className="cabinet-dish-save-cta"
                      disabled={busy || !form.name.trim()}
                    >
                      {form.id ? copy.opsMenuEditDish : copy.opsMenuAddDish}
                    </button>

                    <button
                      type="button"
                      className="cabinet-dish-cancel-btn"
                      onClick={() => setIsModalOpen(false)}
                      disabled={busy}
                    >
                      {copy.opsMenuCancel}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </section>
        </div>,
        document.body,
      )}

      <CabinetConfirmDialog
        open={!!deletingDish}
        title={copy.opsMenuDeleteConfirmTitle}
        text={copy.opsMenuDeleteConfirmText.replace("{name}", deletingDish ? dishName(deletingDish) : "")}
        confirmLabel={copy.opsMenuDeleteConfirmBtn}
        cancelLabel={copy.opsMenuCancel}
        busy={busy}
        onConfirm={() => void handleDeleteDish()}
        onCancel={() => setDeletingDish(null)}
      />
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
