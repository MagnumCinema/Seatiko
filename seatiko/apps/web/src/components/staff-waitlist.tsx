"use client";

import { useId, useState } from "react";
import { SelectMenu } from "@/components/ui/select-menu";
import { agoText, fill, StaffEmpty, waitText, type StaffCopy } from "@/components/staff-live";
import type { LocaleCode, Table, WaitlistEntry } from "@/lib/api";
import { formatClock } from "@/lib/cabinet-bookings";
import { pluralize, type PluralForms } from "@/lib/cabinet-helpers";
import { zoneLabel } from "@/lib/floor-zones";
import {
  CALLED_LATE_MIN,
  floorCount,
  minutesSince,
  phoneProblem,
  QUEUE_DANGER_MIN,
  QUEUE_WARN_MIN,
  queueBoard,
  tableChoices,
  telHref,
  waitTone,
  WAITLIST_MAX_GUESTS,
  WAITLIST_NAME_MAX,
  WAITLIST_NOTE_MAX,
} from "@/lib/staff-floor";

/** The API files every walk-in under "hall"; only a zone the guest asked for is worth showing. */
const hasZone = (entry: WaitlistEntry) => Boolean(entry.zone && entry.zone !== "hall");

export type NewWalkIn = { guest_name: string; guests: number; phone?: string; note?: string };

function QueueIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="9" cy="7" r="3" />
      <path d="M3 21v-1a6 6 0 0 1 12 0v1" />
      <path d="M17 11h4M17 15h4M19 7h2" />
    </svg>
  );
}

/** The host stand: add walk-ins, call them to a free table, seat them or close the entry. */
export function StaffWaitlistTab({
  copy,
  locale,
  seatsForms,
  entries,
  tables,
  now,
  onAdd,
  onNotify,
  onSeat,
  onClose,
}: {
  copy: StaffCopy;
  locale: LocaleCode;
  seatsForms: PluralForms;
  entries: WaitlistEntry[];
  tables: Table[];
  now: number;
  onAdd: (input: NewWalkIn) => Promise<boolean>;
  onNotify: (entry: WaitlistEntry, tableId: string) => Promise<void>;
  onSeat: (entry: WaitlistEntry, tableId?: string) => Promise<void>;
  onClose: (entry: WaitlistEntry, status: "LEFT" | "EXPIRED") => Promise<void>;
}) {
  const w = copy.waitlist;
  const board = queueBoard(entries);
  const floor = floorCount(tables);
  const [busy, setBusy] = useState<string | null>(null);
  const [picked, setPicked] = useState<Record<string, string>>({});
  const [showClosed, setShowClosed] = useState(false);

  const run = async (id: string, action: () => Promise<void>) => {
    setBusy(id);
    try {
      await action();
    } finally {
      setBusy(null);
    }
  };

  const guestsText = (n: number) => `${n} ${pluralize(n, copy.guestsForms, locale)}`;
  const sourceText = (entry: WaitlistEntry) => w.source[entry.source as keyof typeof w.source] ?? w.source.WEB;

  const details = (entry: WaitlistEntry) => (
    <>
      {(entry.note || hasZone(entry)) && (
        <p className="sf-q-note">
          {[hasZone(entry) ? zoneLabel(entry.zone, locale) : "", entry.note ?? ""].filter(Boolean).join(" · ")}
        </p>
      )}
      {entry.phone && (
        <a className="sf-q-phone" href={telHref(entry.phone)}>
          {entry.phone}
        </a>
      )}
    </>
  );

  const readyRow = (entry: WaitlistEntry) => {
    const minutes = minutesSince(entry.notified_at, now);
    const late = minutes >= CALLED_LATE_MIN;
    return (
      <li key={entry.id} className={`sf-q ${late ? "tone-warn" : "tone-live"}`}>
        <span className="sf-q-mark" aria-hidden="true">
          {entry.table_number ?? "•"}
        </span>
        <div className="sf-q-text">
          <strong>{entry.guest_name}</strong>
          <span>
            {guestsText(entry.guests)} · {sourceText(entry)}
          </span>
          <small className={late ? "is-warn" : ""}>
            {late && entry.table_number
              ? fill(w.calledLate, { n: entry.table_number, time: waitText(minutes, copy) })
              : entry.table_number
                ? fill(w.calledTo, { n: entry.table_number, ago: agoText(minutes, copy) })
                : agoText(minutes, copy)}
          </small>
          {details(entry)}
        </div>
        <div className="sf-q-actions">
          {entry.table_id ? (
            <button type="button" className="panel-btn sm" disabled={busy !== null} onClick={() => void run(entry.id, () => onSeat(entry))}>
              {w.seat}
            </button>
          ) : (
            <TablePick
              copy={copy}
              seatsForms={seatsForms}
              locale={locale}
              tables={tables}
              guests={entry.guests}
              value={picked[entry.id] ?? ""}
              disabled={busy !== null}
              onChange={(id) => setPicked((p) => ({ ...p, [entry.id]: id }))}
            />
          )}
          {!entry.table_id && (
            <button
              type="button"
              className="panel-btn sm"
              disabled={busy !== null || !picked[entry.id]}
              onClick={() => void run(entry.id, () => onSeat(entry, picked[entry.id]))}
            >
              {w.seat}
            </button>
          )}
          <button
            type="button"
            className="panel-btn sm ghost sf-btn-quiet"
            disabled={busy !== null}
            onClick={() => void run(entry.id, () => onClose(entry, "EXPIRED"))}
          >
            {w.noShow}
          </button>
        </div>
      </li>
    );
  };

  const waitingRow = (entry: WaitlistEntry, index: number) => {
    const minutes = minutesSince(entry.created_at, now);
    const tone = waitTone(minutes, QUEUE_WARN_MIN, QUEUE_DANGER_MIN);
    const table = picked[entry.id] ?? "";
    return (
      <li key={entry.id} className={`sf-q tone-${tone}`}>
        <span className="sf-q-mark sf-q-pos" aria-label={fill(w.position, { n: index + 1 })}>
          {index + 1}
        </span>
        <div className="sf-q-text">
          <strong>{entry.guest_name}</strong>
          <span>
            {guestsText(entry.guests)} · {sourceText(entry)}
          </span>
          <small>
            <b className={`sf-wait tone-${tone}`}>{minutes < 1 ? w.justJoined : fill(w.waits, { time: waitText(minutes, copy) })}</b>
            {entry.quoted_wait_min ? ` · ${fill(w.quoted, { time: waitText(entry.quoted_wait_min, copy) })}` : ""}
            {` · ${formatClock(Date.parse(entry.created_at))}`}
          </small>
          {details(entry)}
        </div>
        <div className="sf-q-actions">
          <TablePick
            copy={copy}
            seatsForms={seatsForms}
            locale={locale}
            tables={tables}
            guests={entry.guests}
            value={table}
            disabled={busy !== null}
            onChange={(id) => setPicked((p) => ({ ...p, [entry.id]: id }))}
          />
          <button
            type="button"
            className="panel-btn sm"
            disabled={busy !== null || !table}
            title={w.callTo}
            onClick={() => void run(entry.id, () => onNotify(entry, table))}
          >
            {w.call}
          </button>
          <button
            type="button"
            className="panel-btn sm ghost"
            disabled={busy !== null || !table}
            title={w.seatAt}
            onClick={() => void run(entry.id, () => onSeat(entry, table))}
          >
            {w.seat}
          </button>
          <button
            type="button"
            className="panel-btn sm ghost sf-btn-quiet"
            disabled={busy !== null}
            onClick={() => void run(entry.id, () => onClose(entry, "LEFT"))}
          >
            {w.left}
          </button>
        </div>
      </li>
    );
  };

  const open = board.ready.length + board.waiting.length;

  return (
    <div className="sf-stack">
      <AddWalkIn copy={copy} onAdd={onAdd} />

      <div className="sf-summary" role="status">
        <span>
          <b>{fill(w.summary, { n: open })}</b>
        </span>
        <span>{fill(w.freeTables, { free: floor.free, total: floor.total })}</span>
      </div>

      {open === 0 ? (
        <StaffEmpty icon={<QueueIcon />} title={w.emptyTitle} hint={w.emptyHint} />
      ) : (
        <>
          {board.ready.length > 0 && (
            <section className="owner-card sf-card" aria-labelledby="sf-q-ready">
              <h3 className="sf-group-title" id="sf-q-ready">
                {w.readyTitle}
                <b className="sf-count tone-live">{board.ready.length}</b>
              </h3>
              <ul className="sf-list">{board.ready.map(readyRow)}</ul>
            </section>
          )}
          {board.waiting.length > 0 && (
            <section className="owner-card sf-card" aria-labelledby="sf-q-waiting">
              <h3 className="sf-group-title" id="sf-q-waiting">
                {w.waitingTitle}
                <b className="sf-count">{board.waiting.length}</b>
              </h3>
              {floor.free === 0 && <p className="sf-hint">{w.noFreeTablesHint}</p>}
              <ul className="sf-list">{board.waiting.map(waitingRow)}</ul>
            </section>
          )}
        </>
      )}

      {board.closed.length > 0 && (
        <section className="owner-card sf-card sf-card-quiet">
          <button type="button" className="sf-toggle" aria-expanded={showClosed} onClick={() => setShowClosed((v) => !v)}>
            <span>{fill(w.closedTitle, { n: board.closed.length })}</span>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
          {showClosed && (
            <ul className="sf-closed">
              {board.closed.map((entry) => (
                <li key={entry.id}>
                  <span>
                    <strong>{entry.guest_name}</strong> · {guestsText(entry.guests)}
                  </span>
                  <span className={`sf-chip closed-${entry.status.toLowerCase()}`}>
                    {w.closed[entry.status as keyof typeof w.closed] ?? entry.status}
                    {entry.status === "SEATED" && entry.table_number ? ` · ${fill(copy.tableN, { n: entry.table_number })}` : ""}
                  </span>
                  <small>{formatClock(Date.parse(entry.closed_at || entry.created_at))}</small>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}

/** Free tables for a party, fitting ones first; too-small ones are marked. */
function TablePick({
  copy,
  seatsForms,
  locale,
  tables,
  guests,
  value,
  disabled,
  onChange,
}: {
  copy: StaffCopy;
  seatsForms: PluralForms;
  locale: LocaleCode;
  tables: Table[];
  guests: number;
  value: string;
  disabled: boolean;
  onChange: (tableId: string) => void;
}) {
  const w = copy.waitlist;
  const choices = tableChoices(tables, guests);
  // A table taken meanwhile drops out of the list; its choice is dropped with it.
  const current = choices.some((c) => c.table.id === value) ? value : "";
  return (
    <SelectMenu
      size="compact"
      fullWidth={false}
      className="sf-table-pick"
      value={current}
      placeholder={choices.length ? w.pickTable : w.noFreeTables}
      disabled={disabled || choices.length === 0}
      ariaLabel={w.pickTable}
      onChange={onChange}
      options={choices.map(({ table, fits }) => ({
        value: table.id,
        label: `${fill(w.tableOption, {
          n: table.number,
          seats: `${table.seats} ${pluralize(table.seats, seatsForms, locale)}`,
        })}${fits ? "" : ` · ${w.tooSmall}`}`,
      }))}
    />
  );
}

/** Walk-in form: name, party size, phone and a request; the phone is optional but checked. */
function AddWalkIn({ copy, onAdd }: { copy: StaffCopy; onAdd: (input: NewWalkIn) => Promise<boolean> }) {
  const w = copy.waitlist;
  const id = useId();
  const [name, setName] = useState("");
  const [guests, setGuests] = useState(2);
  const [phone, setPhone] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [touched, setTouched] = useState(false);
  const phoneBad = phoneProblem(phone) !== null;
  const ready = name.trim().length > 0 && !phoneBad;

  return (
    <form
      className="owner-card sf-card sf-add"
      onSubmit={async (event) => {
        event.preventDefault();
        setTouched(true);
        if (!ready || busy) return;
        setBusy(true);
        const ok = await onAdd({
          guest_name: name.trim(),
          guests,
          phone: phone.trim() || undefined,
          note: note.trim() || undefined,
        });
        setBusy(false);
        if (ok) {
          setName("");
          setPhone("");
          setNote("");
          setGuests(2);
          setTouched(false);
        }
      }}
    >
      <div className="sf-add-head">
        <h3>{w.addTitle}</h3>
        <p>{w.addHint}</p>
      </div>
      <div className="sf-add-fields">
        <label className="sf-field sf-field-name" htmlFor={`${id}-name`}>
          <span>{w.name}</span>
          <input
            id={`${id}-name`}
            value={name}
            maxLength={WAITLIST_NAME_MAX}
            autoComplete="off"
            placeholder={w.namePlaceholder}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <div className="sf-field sf-field-guests">
          <span id={`${id}-guests`}>{w.guests}</span>
          <div className="sf-stepper" role="group" aria-labelledby={`${id}-guests`}>
            <button type="button" aria-label={w.fewer} disabled={guests <= 1} onClick={() => setGuests((g) => Math.max(1, g - 1))}>
              −
            </button>
            <output aria-live="polite">{guests}</output>
            <button
              type="button"
              aria-label={w.more}
              disabled={guests >= WAITLIST_MAX_GUESTS}
              onClick={() => setGuests((g) => Math.min(WAITLIST_MAX_GUESTS, g + 1))}
            >
              +
            </button>
          </div>
        </div>
        <label className="sf-field sf-field-phone" htmlFor={`${id}-phone`}>
          <span>
            {w.phone} <i>{w.optional}</i>
          </span>
          <input
            id={`${id}-phone`}
            type="tel"
            inputMode="tel"
            value={phone}
            maxLength={24}
            autoComplete="off"
            placeholder={w.phonePlaceholder}
            aria-invalid={touched && phoneBad}
            aria-describedby={touched && phoneBad ? `${id}-phone-error` : undefined}
            onBlur={() => setTouched(true)}
            onChange={(e) => setPhone(e.target.value)}
          />
          {touched && phoneBad && (
            <small className="sf-field-error" id={`${id}-phone-error`}>
              {w.phoneInvalid}
            </small>
          )}
        </label>
        <label className="sf-field sf-field-note" htmlFor={`${id}-note`}>
          <span>
            {w.note} <i>{w.optional}</i>
          </span>
          <input
            id={`${id}-note`}
            value={note}
            maxLength={WAITLIST_NOTE_MAX}
            autoComplete="off"
            placeholder={w.notePlaceholder}
            onChange={(e) => setNote(e.target.value)}
          />
        </label>
        <button type="submit" className="panel-btn sf-add-submit" disabled={!ready || busy}>
          {w.add}
        </button>
      </div>
    </form>
  );
}
