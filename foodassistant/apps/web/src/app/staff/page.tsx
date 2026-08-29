"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PanelShell } from "@/components/panel-shell";
import { StaffWaitlist } from "@/components/staff-waitlist";
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
        const list = await fetchVenues();
        setVenues(list);
        if (list[0]) setVenueId(list[0].id);
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
    <PanelShell title="Staff" subtitle="Очередь вызовов и заказов">
      <label>
        Заведение
        <select value={venueId} onChange={(e) => setVenueId(e.target.value)}>
          {venues.map((venue) => (
            <option key={venue.id} value={venue.id}>
              {venue.name.ru || venue.name.en || venue.id}
            </option>
          ))}
        </select>
      </label>
      {error && <p>{error}</p>}

      {venueId && <StaffWaitlist venueId={venueId} />}

      <h2>Вызовы официанта</h2>
      <ul>
        {calls.map((call) => (
          <li key={call.id}>
            {call.reason} · {call.status} · table {call.table_id}
            {call.status !== "DONE" && (
              <button
                type="button"
                onClick={async () => {
                  await staffCompleteWaiterCall(call.id);
                  const refreshed = await staffListWaiterCalls(venueId);
                  setCalls(refreshed.waiter_calls ?? []);
                }}
              >
                Done
              </button>
            )}
          </li>
        ))}
      </ul>

      <h2>Заказы</h2>
      <ul>
        {orders.map((order) => (
          <li key={order.id}>
            {order.id.slice(0, 8)} · {order.status} · {order.total} MDL
            <button
              type="button"
              onClick={async () => {
                await staffUpdateOrder(order.id, venueId, "PREPARING");
                setOrders(await staffListOrders(venueId));
              }}
            >
              Preparing
            </button>
            <button
              type="button"
              onClick={async () => {
                await staffUpdateOrder(order.id, venueId, "READY");
                setOrders(await staffListOrders(venueId));
              }}
            >
              Ready
            </button>
          </li>
        ))}
      </ul>
    </PanelShell>
  );
}
