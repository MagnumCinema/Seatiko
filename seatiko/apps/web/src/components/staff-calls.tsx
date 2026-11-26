"use client";

import { useState } from "react";
import type { WaiterCall } from "@/lib/api";
import {
  CALL_DANGER_MIN,
  CALL_WARN_MIN,
  callBoard,
  isCallReason,
  minutesSince,
  waitTone,
} from "@/lib/staff-floor";
import { clockOrDate, fill, StaffEmpty, waitText, type StaffCopy } from "@/components/staff-live";

function BellIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
  );
}

/** Waiter calls of the venue: answer the new ones, finish the taken ones, see today's done ones. */
export function StaffCallsTab({
  copy,
  locale,
  calls,
  tableNumbers,
  fresh,
  now,
  onAccept,
  onDone,
}: {
  copy: StaffCopy;
  locale: string;
  calls: WaiterCall[];
  tableNumbers: Map<string, number>;
  fresh: Set<string>;
  now: number;
  onAccept: (call: WaiterCall) => Promise<void>;
  onDone: (call: WaiterCall) => Promise<void>;
}) {
  const c = copy.calls;
  const board = callBoard(calls, now);
  const [busy, setBusy] = useState<string | null>(null);
  const [showDone, setShowDone] = useState(false);

  const run = async (id: string, action: () => Promise<void>) => {
    setBusy(id);
    try {
      await action();
    } finally {
      setBusy(null);
    }
  };

  const tableLabel = (call: WaiterCall) => {
    const n = tableNumbers.get(call.table_id);
    return n ? fill(copy.tableN, { n }) : c.tableUnknown;
  };
  const reasonLabel = (call: WaiterCall) => (isCallReason(call.reason) ? c.reason[call.reason] : c.reason.other);
  const at = (call: WaiterCall) => (call.created_at ? fill(c.at, { time: clockOrDate(Date.parse(call.created_at), now, locale) }) : "");

  const row = (call: WaiterCall) => {
    const minutes = minutesSince(call.created_at, now);
    const tone = call.status === "DONE" ? "calm" : waitTone(minutes, CALL_WARN_MIN, CALL_DANGER_MIN);
    const number = tableNumbers.get(call.table_id);
    return (
      <li key={call.id} className={`sf-call tone-${tone} ${fresh.has(call.id) ? "is-fresh" : ""} status-${call.status.toLowerCase()}`}>
        <span className="sf-call-table" aria-hidden="true">
          {number ?? "?"}
        </span>
        <div className="sf-call-text">
          <strong>
            {tableLabel(call)}
            {fresh.has(call.id) && <em className="sf-chip tone-live">{c.newBadge}</em>}
          </strong>
          <span>{reasonLabel(call)}</span>
          <small>
            {call.status === "DONE"
              ? at(call)
              : [minutes < 1 ? copy.justNow : fill(c.waiting, { time: waitText(minutes, copy) }), at(call)].filter(Boolean).join(" · ")}
          </small>
        </div>
        {call.status !== "DONE" && (
          <div className="sf-call-actions">
            {call.status === "PENDING" && (
              <button
                type="button"
                className="panel-btn sm"
                disabled={busy !== null}
                onClick={() => void run(call.id, () => onAccept(call))}
              >
                {c.accept}
              </button>
            )}
            <button
              type="button"
              className={`panel-btn sm ${call.status === "PENDING" ? "ghost" : ""}`}
              disabled={busy !== null}
              onClick={() => void run(call.id, () => onDone(call))}
            >
              {c.done}
            </button>
          </div>
        )}
      </li>
    );
  };

  const open = board.pending.length + board.accepted.length;

  return (
    <div className="sf-stack">
      {open === 0 ? (
        <StaffEmpty icon={<BellIcon />} title={c.emptyTitle} hint={c.emptyHint} />
      ) : (
        <>
          {board.pending.length > 0 && (
            <section className="owner-card sf-card" aria-labelledby="sf-calls-pending">
              <h3 className="sf-group-title" id="sf-calls-pending">
                {c.pending}
                <b className="sf-count tone-danger">{board.pending.length}</b>
              </h3>
              <ul className="sf-list">{board.pending.map(row)}</ul>
            </section>
          )}
          {board.accepted.length > 0 && (
            <section className="owner-card sf-card" aria-labelledby="sf-calls-accepted">
              <h3 className="sf-group-title" id="sf-calls-accepted">
                {c.accepted}
                <b className="sf-count">{board.accepted.length}</b>
              </h3>
              <ul className="sf-list">{board.accepted.map(row)}</ul>
            </section>
          )}
        </>
      )}

      {board.doneToday.length > 0 && (
        <section className="owner-card sf-card sf-card-quiet">
          <button type="button" className="sf-toggle" aria-expanded={showDone} onClick={() => setShowDone((v) => !v)}>
            <span>{fill(c.doneToday, { n: board.doneToday.length })}</span>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
          {showDone && <ul className="sf-list sf-list-quiet">{board.doneToday.map(row)}</ul>}
        </section>
      )}
    </div>
  );
}
