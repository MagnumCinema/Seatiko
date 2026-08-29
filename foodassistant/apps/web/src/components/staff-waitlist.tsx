"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  fetchTables,
  staffAddWaitlist,
  staffCloseWaitlist,
  staffListWaitlist,
  staffNotifyWaitlist,
  staffSeatWaitlist,
  type Table,
  type WaitlistEntry,
} from "@/lib/api";
import { zoneLabel } from "@/lib/floor-zones";

const POLL_MS = 15000;

function since(iso: string): string {
  const minutes = Math.max(
    0,
    Math.round((Date.now() - new Date(iso).getTime()) / 60000),
  );
  if (minutes < 60) return `${minutes} мин`;
  return `${Math.floor(minutes / 60)} ч ${minutes % 60} мин`;
}

export function StaffWaitlist({ venueId }: { venueId: string }) {
  const [entries, setEntries] = useState<WaitlistEntry[]>([]);
  const [tables, setTables] = useState<Table[]>([]);
  const [name, setName] = useState("");
  const [guests, setGuests] = useState(2);
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!venueId) return;
    try {
      const [queue, tableList] = await Promise.all([
        staffListWaitlist(venueId),
        fetchTables(venueId),
      ]);
      setEntries(queue);
      setTables(tableList);
      setError(null);
    } catch {
      setError("Нет доступа к очереди этого заведения");
    }
  }, [venueId]);

  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), POLL_MS);
    return () => clearInterval(timer);
  }, [refresh]);

  const freeTables = useMemo(
    () => tables.filter((t) => t.status === "FREE"),
    [tables],
  );

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      await refresh();
    } catch {
      setError("Действие не выполнено — обновите очередь");
    } finally {
      setBusy(false);
    }
  }

  const active = entries.filter(
    (e) => e.status === "WAITING" || e.status === "READY",
  );
  const closed = entries.filter(
    (e) => e.status !== "WAITING" && e.status !== "READY",
  );

  return (
    <section className="host-waitlist">
      <div className="host-waitlist-head">
        <h2>Очередь</h2>
        <span>
          {active.length} в очереди · {freeTables.length} столов свободно
        </span>
      </div>

      <form
        className="host-waitlist-add"
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim()) return;
          void run(async () => {
            await staffAddWaitlist({
              venue_id: venueId,
              guest_name: name.trim(),
              guests,
              phone: phone.trim() || undefined,
            });
            setName("");
            setPhone("");
            setGuests(2);
          });
        }}
      >
        <input
          placeholder="Имя гостя (walk-in)"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <input
          type="number"
          min={1}
          max={30}
          value={guests}
          onChange={(e) => setGuests(Number(e.target.value) || 1)}
        />
        <input
          type="tel"
          placeholder="Телефон"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
        />
        <button type="submit" disabled={busy || !name.trim()}>
          В очередь
        </button>
      </form>

      {error && <p className="host-waitlist-error">{error}</p>}

      {active.length === 0 ? (
        <p className="host-waitlist-empty">Очередь пуста.</p>
      ) : (
        <ul className="host-waitlist-list">
          {active.map((entry, index) => (
            <li key={entry.id} className={entry.status === "READY" ? "ready" : ""}>
              <div className="host-waitlist-main">
                <strong>
                  {entry.status === "READY" ? "Готов" : `№${index + 1}`} ·{" "}
                  {entry.guest_name}
                </strong>
                <span>
                  {entry.guests} гост. · ждёт {since(entry.created_at)}
                  {entry.zone ? ` · ${zoneLabel(entry.zone)}` : ""}
                  {entry.phone ? ` · ${entry.phone}` : ""}
                  {entry.table_number ? ` · стол №${entry.table_number}` : ""}
                </span>
              </div>
              <div className="host-waitlist-actions">
                {entry.status === "WAITING" && (
                  <select
                    defaultValue=""
                    disabled={busy}
                    onChange={(e) => {
                      const tableId = e.target.value;
                      if (!tableId) return;
                      void run(() => staffNotifyWaitlist(entry.id, tableId));
                    }}
                  >
                    <option value="">Позвать на стол…</option>
                    {freeTables.map((table) => (
                      <option key={table.id} value={table.id}>
                        №{table.number} · {table.seats} мест
                      </option>
                    ))}
                  </select>
                )}
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void run(() => staffSeatWaitlist(entry.id))}
                >
                  Усадить
                </button>
                <button
                  type="button"
                  className="ghost"
                  disabled={busy}
                  onClick={() =>
                    void run(() => staffCloseWaitlist(entry.id, "LEFT"))
                  }
                >
                  Ушёл
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {closed.length > 0 && (
        <details className="host-waitlist-closed">
          <summary>Закрытые за смену ({closed.length})</summary>
          <ul>
            {closed.map((entry) => (
              <li key={entry.id}>
                {entry.guest_name} · {entry.guests} гост. · {entry.status}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
