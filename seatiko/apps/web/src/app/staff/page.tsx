"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { PanelShell } from "@/components/panel-shell";
import { StaffWaitlist } from "@/components/staff-waitlist";
import { RoleBadge } from "@/components/cabinet-roles";
import { shiftRoleLabel } from "@/lib/venue-roles";
import { useLocale } from "@/components/locale-provider";
import { useDialogFocus } from "@/lib/use-dialog-focus";
import { getSiteCopy } from "@/lib/site-copy";
import {
  fetchMe,
  fetchVenues,
  getToken,
  listMyStaffShifts,
  respondStaffShift,
  staffCompleteWaiterCall,
  staffListOrders,
  staffListWaiterCalls,
  staffUpdateOrder,
  type Order,
  type Venue,
  type WorkShift,
} from "@/lib/api";

type WaiterCall = {
  id: string;
  table_id: string;
  reason: string;
  status: string;
};

function formatStaffShiftDate(dateStr: string, locale: "ru" | "ro" | "en"): string {
  const d = new Date();
  const today = d.toISOString().slice(0, 10);
  d.setDate(d.getDate() + 1);
  const tomorrow = d.toISOString().slice(0, 10);

  if (dateStr === today) {
    return locale === "ro" ? "Astăzi" : locale === "en" ? "Today" : "Сегодня";
  }
  if (dateStr === tomorrow) {
    return locale === "ro" ? "Mâine" : locale === "en" ? "Tomorrow" : "Завтра";
  }
  try {
    const dt = new Date(dateStr + "T00:00:00");
    const lang = locale === "ro" ? "ro-RO" : locale === "en" ? "en-US" : "ru-RU";
    return dt.toLocaleDateString(lang, { day: "numeric", month: "short", weekday: "short" });
  } catch {
    return dateStr;
  }
}

export default function StaffPage() {
  const router = useRouter();
  const { locale } = useLocale();
  const copy = getSiteCopy(locale).cabinet;
  const presetNames = copy.roles.presets as Record<string, string>;
  const [venues, setVenues] = useState<Venue[]>([]);
  const [venueId, setVenueId] = useState("");
  const [calls, setCalls] = useState<WaiterCall[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [myShifts, setMyShifts] = useState<WorkShift[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Swap Request Modal State
  const [swapModalShift, setSwapModalShift] = useState<WorkShift | null>(null);
  const [swapReason, setSwapReason] = useState("");
  const swapModalRef = useRef<HTMLElement>(null);
  useDialogFocus(!!swapModalShift, swapModalRef, () => setSwapModalShift(null));

  useEffect(() => {
    if (!getToken()) {
      router.replace("/login");
      return;
    }
    fetchMe()
      .then(async (user) => {
        if (!["staff", "restaurant", "admin"].includes(String(user.role))) {
          router.replace("/");
          return;
        }
        const [venueList, shiftsList] = await Promise.all([
          fetchVenues(),
          listMyStaffShifts().catch(() => []),
        ]);
        setVenues(venueList);
        setMyShifts(shiftsList);
        if (venueList[0]) setVenueId(venueList[0].id);
      })
      .catch(() => router.replace("/login"));
  }, [router]);

  useEffect(() => {
    if (!venueId) return;
    let cancelled = false;
    Promise.all([staffListWaiterCalls(venueId), staffListOrders(venueId)])
      .then(([callsRes, orderList]) => {
        if (cancelled) return;
        setCalls(callsRes.waiter_calls ?? []);
        setOrders(orderList);
      })
      .catch(() => {
        if (!cancelled) setError("Нет доступа к очереди этого заведения");
      });
    return () => {
      cancelled = true;
    };
  }, [venueId]);

  const pendingShifts = myShifts.filter((s) => s.status === "PENDING");

  return (
    <PanelShell title="Staff" subtitle="Очередь вызовов, заказов и график смен">
      {/* Pending Shift Confirmation Notification Banner */}
      {pendingShifts.length > 0 && (
        <section className="owner-card staff-shifts-alert-card" role="alert">
          <div className="staff-shifts-alert-icon" aria-hidden="true">
            🔔
          </div>
          <div className="staff-shifts-alert-content">
            <h4>{copy.staffShiftsPendingAlert}</h4>
            <div className="staff-pending-shifts-list">
              {pendingShifts.map((shift) => (
                <div key={shift.id} className="staff-pending-shift-row">
                  <div className="staff-pending-shift-info">
                    <strong className="staff-pending-shift-time">
                      {formatStaffShiftDate(shift.date, locale)} · {shift.start_time} – {shift.end_time}
                    </strong>
                    <RoleBadge label={shiftRoleLabel(shift, presetNames)} color={shift.role_color} />
                    {shift.note && (
                      <span className="staff-pending-shift-note">
                        📍 {shift.note}
                      </span>
                    )}
                  </div>
                  <div className="staff-pending-shift-actions">
                    <button
                      type="button"
                      className="panel-btn primary sm staff-shift-accept-btn"
                      onClick={async () => {
                        await respondStaffShift(shift.id, "CONFIRMED");
                        const refreshed = await listMyStaffShifts();
                        setMyShifts(refreshed);
                      }}
                    >
                      {copy.staffShiftsAccept}
                    </button>
                    <button
                      type="button"
                      className="panel-btn ghost sm danger staff-shift-decline-btn"
                      onClick={async () => {
                        await respondStaffShift(shift.id, "DECLINED");
                        const refreshed = await listMyStaffShifts();
                        setMyShifts(refreshed);
                      }}
                    >
                      {copy.staffShiftsDecline}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Staff Work Shifts Schedule */}
      <section className="owner-card staff-shifts-section">
        <div className="owner-card-head">
          <div>
            <span className="owner-kicker">{copy.staff}</span>
            <h3>{copy.staffShiftsTitle}</h3>
          </div>
        </div>

        {myShifts.length === 0 ? (
          <p className="cabinet-ops-empty">{copy.staffShiftsEmpty}</p>
        ) : (
          <ul className="cabinet-schedule-list">
            {myShifts.map((shift) => (
              <li key={shift.id} className={`cabinet-schedule-item status-${shift.status.toLowerCase()}`}>
                <div className="cabinet-schedule-item-time">
                  <span className="cabinet-schedule-date-pill">
                    {formatStaffShiftDate(shift.date, locale)}
                  </span>
                  <strong className="cabinet-schedule-hours">
                    {shift.start_time} – {shift.end_time}
                  </strong>
                </div>

                <div className="cabinet-schedule-item-staff">
                  <div>
                    <div className="cabinet-schedule-staff-name-row">
                      <RoleBadge label={shiftRoleLabel(shift, presetNames)} color={shift.role_color} />
                    </div>
                    {shift.note && (
                      <p className="cabinet-schedule-item-note">
                        <span>📍</span> {shift.note}
                      </p>
                    )}
                  </div>
                </div>

                <div className="cabinet-schedule-item-right">
                  <span className={`cabinet-shift-status-badge ${shift.status.toLowerCase()}`}>
                    {shift.status === "CONFIRMED" && <span className="shift-badge-icon">✓</span>}
                    {shift.status === "PENDING" && <span className="shift-badge-icon">⏳</span>}
                    {shift.status === "SWAP_REQUESTED" && <span className="shift-badge-icon">⚠️</span>}
                    {shift.status === "DECLINED" && <span className="shift-badge-icon">✕</span>}
                    {shift.status === "CONFIRMED"
                      ? copy.opsScheduleConfirmed
                      : shift.status === "SWAP_REQUESTED"
                      ? copy.staffSwapStatusBadge
                      : shift.status === "DECLINED"
                      ? copy.opsScheduleDeclined
                      : copy.opsSchedulePending}
                  </span>

                  {shift.status === "CONFIRMED" && (
                    <button
                      type="button"
                      className="panel-btn ghost sm danger"
                      onClick={() => {
                        setSwapModalShift(shift);
                        setSwapReason("");
                      }}
                      title={copy.staffSwapRequestBtn}
                    >
                      ⚠️ {copy.staffSwapRequestBtn}
                    </button>
                  )}

                  {shift.status === "PENDING" && (
                    <div className="staff-pending-shift-actions inline">
                      <button
                        type="button"
                        className="panel-btn primary sm staff-shift-accept-btn"
                        onClick={async () => {
                          await respondStaffShift(shift.id, "CONFIRMED");
                          const refreshed = await listMyStaffShifts();
                          setMyShifts(refreshed);
                        }}
                      >
                        {copy.staffShiftsAccept}
                      </button>
                      <button
                        type="button"
                        className="panel-btn ghost sm danger staff-shift-decline-btn"
                        onClick={async () => {
                          await respondStaffShift(shift.id, "DECLINED");
                          const refreshed = await listMyStaffShifts();
                          setMyShifts(refreshed);
                        }}
                      >
                        {copy.staffShiftsDecline}
                      </button>
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="owner-card staff-venue-bar">
        <label className="staff-venue-label">
          <span>{locale === "ro" ? "Restaurant" : locale === "en" ? "Venue" : "Заведение"}</span>
          <select value={venueId} onChange={(e) => setVenueId(e.target.value)}>
            {venues.map((venue) => (
              <option key={venue.id} value={venue.id}>
                {venue.name.ru || venue.name.en || venue.id}
              </option>
            ))}
          </select>
        </label>
        {error && <p className="owner-notice error">{error}</p>}
      </section>

      {venueId && <StaffWaitlist venueId={venueId} />}

      <div className="staff-ops-grid">
        <section className="owner-card staff-queue-card">
          <div className="owner-card-head">
            <div>
              <span className="owner-kicker">{locale === "ro" ? "Sală" : locale === "en" ? "Hall" : "Зал"}</span>
              <h3>{locale === "ro" ? "Apeluri ospătar" : locale === "en" ? "Waiter calls" : "Вызовы официанта"} ({calls.length})</h3>
            </div>
          </div>
          {calls.length === 0 ? (
            <p className="cabinet-ops-empty">{locale === "ro" ? "Niciun apel activ" : locale === "en" ? "No active calls" : "Активных вызовов нет"}</p>
          ) : (
            <ul className="staff-queue-list">
              {calls.map((call) => (
                <li key={call.id} className="staff-queue-item">
                  <div>
                    <strong>{locale === "ro" ? "Masa" : locale === "en" ? "Table" : "Стол"} {call.table_id}</strong>
                    <small>{call.reason} · {call.status}</small>
                  </div>
                  {call.status !== "DONE" && (
                    <button
                      type="button"
                      className="panel-btn primary sm"
                      onClick={async () => {
                        await staffCompleteWaiterCall(call.id);
                        const refreshed = await staffListWaiterCalls(venueId);
                        setCalls(refreshed.waiter_calls ?? []);
                      }}
                    >
                      {locale === "ro" ? "Finalizat" : locale === "en" ? "Done" : "Выполнено"}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="owner-card staff-queue-card">
          <div className="owner-card-head">
            <div>
              <span className="owner-kicker">{locale === "ro" ? "Bucătărie" : locale === "en" ? "Kitchen" : "Кухня"}</span>
              <h3>{locale === "ro" ? "Comenzi" : locale === "en" ? "Orders" : "Заказы"} ({orders.length})</h3>
            </div>
          </div>
          {orders.length === 0 ? (
            <p className="cabinet-ops-empty">{locale === "ro" ? "Nicio comandă activă" : locale === "en" ? "No active orders" : "Активных заказов нет"}</p>
          ) : (
            <ul className="staff-queue-list">
              {orders.map((order) => (
                <li key={order.id} className="staff-queue-item">
                  <div>
                    <strong>#{order.id.slice(0, 8)} · {order.total} MDL</strong>
                    <small>{order.status}</small>
                  </div>
                  <div className="staff-queue-actions">
                    <button
                      type="button"
                      className="panel-btn ghost sm"
                      onClick={async () => {
                        await staffUpdateOrder(order.id, venueId, "PREPARING");
                        setOrders(await staffListOrders(venueId));
                      }}
                    >
                      Preparing
                    </button>
                    <button
                      type="button"
                      className="panel-btn primary sm"
                      onClick={async () => {
                        await staffUpdateOrder(order.id, venueId, "READY");
                        setOrders(await staffListOrders(venueId));
                      }}
                    >
                      Ready
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* Staff Shift Swap Request Modal */}
      {swapModalShift && typeof document !== "undefined" && createPortal(
        <div className="booking-popup-root cabinet-shift-modal-root" role="presentation">
          <button
            type="button"
            className="booking-popup-backdrop"
            aria-label={copy.opsMenuCancel}
            onClick={() => setSwapModalShift(null)}
          />
          <section
            ref={swapModalRef}
            className="booking-popup cabinet-shift-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="staff-swap-title"
          >
            <div className="booking-popup-card cabinet-shift-card">
              <button
                type="button"
                className="booking-popup-x"
                onClick={() => setSwapModalShift(null)}
                aria-label={copy.opsMenuCancel}
              >
                ×
              </button>

              <h3 id="staff-swap-title">{copy.staffSwapModalTitle}</h3>
              <p className="cabinet-shift-dialog-sub">
                {formatStaffShiftDate(swapModalShift.date, locale)} · {swapModalShift.start_time} – {swapModalShift.end_time}
              </p>

              <form
                className="cabinet-shift-form"
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (!swapReason.trim()) return;
                  await respondStaffShift(swapModalShift.id, "SWAP_REQUESTED", swapReason.trim());
                  const refreshed = await listMyStaffShifts();
                  setMyShifts(refreshed);
                  setSwapModalShift(null);
                }}
              >
                <div className="cabinet-shift-field-group">
                  <label htmlFor="staff-swap-reason-input">
                    {locale === "ro" ? "Motivul absenței" : locale === "en" ? "Absence reason" : "Причина отсутствия"}
                  </label>
                  <textarea
                    id="staff-swap-reason-input"
                    required
                    rows={3}
                    value={swapReason}
                    onChange={(e) => setSwapReason(e.target.value)}
                    placeholder={copy.staffSwapReasonPlaceholder}
                    className="cabinet-shift-input"
                    style={{ height: "auto", resize: "vertical" }}
                  />
                </div>

                <div className="cabinet-shift-actions">
                  <button
                    type="submit"
                    className="panel-btn primary danger"
                    disabled={!swapReason.trim()}
                  >
                    {copy.staffSwapSendBtn}
                  </button>
                  <button
                    type="button"
                    className="panel-btn ghost"
                    onClick={() => setSwapModalShift(null)}
                  >
                    {copy.opsMenuCancel}
                  </button>
                </div>
              </form>
            </div>
          </section>
        </div>,
        document.body,
      )}
    </PanelShell>
  );
}
