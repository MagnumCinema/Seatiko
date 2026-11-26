"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
import { CabinetConfirmDialog } from "@/components/cabinet-confirm-dialog";
import { getSiteCopy } from "@/lib/site-copy";
import {
  listVenueQR,
  regenerateVenueQR,
  replaceVenueTables,
  type Table,
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
export function CabinetRulesPanel({
  venueId,
  published,
  hoursText,
}: Props & { published?: boolean; hoursText?: string }) {
  return (
    <div className="cabinet-ops">
      <BookingRulesForm key={venueId} venueId={venueId} published={published} hoursText={hoursText} />
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
