"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PanelShell } from "@/components/panel-shell";
import { StaffWaitlist } from "@/components/staff-waitlist";
import { SelectMenu } from "@/components/ui/select-menu";
import { StaffShiftsPanel } from "@/components/staff-shifts";
import { useLocale } from "@/components/locale-provider";
import { getSiteCopy } from "@/lib/site-copy";
import {
  fetchMe,
  fetchVenues,
  getToken,
  staffCompleteWaiterCall,
  staffListOrders,
  staffListWaiterCalls,
  staffUpdateOrder,
  type Order,
  type Venue,
} from "@/lib/api";

type WaiterCall = {
  id: string;
  table_id: string;
  reason: string;
  status: string;
};

export default function StaffPage() {
  const router = useRouter();
  const { locale } = useLocale();
  const copy = getSiteCopy(locale).cabinet;
  const [venues, setVenues] = useState<Venue[]>([]);
  const [venueId, setVenueId] = useState("");
  const [calls, setCalls] = useState<WaiterCall[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [error, setError] = useState<string | null>(null);

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
        const venueList = await fetchVenues();
        setVenues(venueList);
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

  return (
    <PanelShell title={copy.shiftPlan.staffTitle} subtitle={copy.shiftPlan.staffSub}>
      <StaffShiftsPanel venues={venues} />

      <section className="owner-card staff-venue-bar">
        <label className="staff-venue-label">
          <span>{locale === "ro" ? "Restaurant" : locale === "en" ? "Venue" : "Заведение"}</span>
          <SelectMenu
            className="staff-venue-select"
            value={venueId}
            onChange={setVenueId}
            options={venues.map((venue) => ({
              value: venue.id,
              label: venue.name.ru || venue.name.en || venue.id,
            }))}
          />
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

    </PanelShell>
  );
}
