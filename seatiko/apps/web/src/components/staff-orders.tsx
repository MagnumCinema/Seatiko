"use client";

import { useState } from "react";
import { CabinetConfirmDialog } from "@/components/cabinet-confirm-dialog";
import { clockOrDate, fill, StaffEmpty, waitText, type StaffCopy } from "@/components/staff-live";
import { pickLocale, type LocaleCode, type Order } from "@/lib/api";
import { formatClock } from "@/lib/cabinet-bookings";
import { pluralize } from "@/lib/cabinet-helpers";
import { formatPrice } from "@/lib/cabinet-menu";
import {
  NEXT_STATUS,
  needsAgeCheck,
  OPEN_STAGES,
  ORDER_DANGER_MIN,
  ORDER_WARN_MIN,
  orderLabel,
  orderStage,
  stageMinutes,
  waitTone,
  type OrderBoard,
  type OrderStage,
} from "@/lib/staff-floor";

export type OrderFilter = "active" | "new" | "preparing" | "ready" | "served" | "scheduled" | "closed";

/** "Все открытые" shows the stages in the order a waiter acts on them: ready food first. */
const SERVICE_ORDER = ["ready", "new", "preparing", "served"] as const;
const FILTERS: OrderFilter[] = ["active", "ready", "new", "preparing", "served", "scheduled", "closed"];

type Status = "PREPARING" | "READY" | "SERVED" | "PAID";

function ReceiptIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 2v20l3-2 3 2 2-2 2 2 3-2 3 2V2l-3 2-3-2-2 2-2-2-3 2z" />
      <path d="M8 9h8M8 13h6" />
    </svg>
  );
}

/** The order board: move each order one step on, check IDs for 18+ preorders, cancel. */
export function StaffOrdersTab({
  copy,
  locale,
  board,
  tablesOf,
  now,
  onAdvance,
  onCancel,
  onAgeCheck,
}: {
  copy: StaffCopy;
  locale: LocaleCode;
  board: OrderBoard;
  tablesOf: (order: Order) => number[];
  now: number;
  onAdvance: (order: Order, status: Status) => Promise<void>;
  onCancel: (order: Order) => Promise<void>;
  onAgeCheck: (order: Order, approved: boolean) => Promise<void>;
}) {
  const o = copy.orders;
  const [filter, setFilter] = useState<OrderFilter>("active");
  const [busy, setBusy] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ order: Order; kind: "cancel" | "refuse" } | null>(null);

  const run = async (id: string, action: () => Promise<void>) => {
    setBusy(id);
    try {
      await action();
    } finally {
      setBusy(null);
    }
  };

  const counts: Record<OrderFilter, number> = {
    active: OPEN_STAGES.reduce((n, s) => n + board[s].length, 0),
    new: board.new.length,
    preparing: board.preparing.length,
    ready: board.ready.length,
    served: board.served.length,
    scheduled: board.scheduled.length,
    closed: board.closedToday.length,
  };

  const tableText = (order: Order) => {
    const list = tablesOf(order);
    if (list.length > 1) return fill(copy.tablesN, { list: list.join(", ") });
    if (list.length === 1) return fill(copy.tableN, { n: list[0] });
    return o.tableUnknown;
  };

  const card = (order: Order) => {
    const stage = orderStage(order, now);
    const next = NEXT_STATUS[stage];
    const minutes = stageMinutes(order, now);
    const timed = stage === "new" || stage === "preparing" || stage === "ready";
    const tone = timed ? waitTone(minutes, ORDER_WARN_MIN, ORDER_DANGER_MIN) : "calm";
    const ageBlock = needsAgeCheck(order) && stage !== "scheduled" && stage !== "paid" && stage !== "cancelled";
    const blocked = ageBlock && (next === "SERVED" || next === "PAID");
    const canCancel = stage === "new" || stage === "preparing";
    const items = order.items.reduce((n, i) => n + i.qty, 0);
    const meta =
      stage === "scheduled" && order.kitchen_at
        ? fill(o.kitchenAt, { time: formatClock(Date.parse(order.kitchen_at)) })
        : stage === "paid" && order.paid_at
          ? fill(o.paidAt, { time: clockOrDate(Date.parse(order.paid_at), now, locale) })
          : stage === "cancelled"
            ? fill(o.cancelledAt, { time: clockOrDate(Date.parse(order.updated_at), now, locale) })
            : fill(o.sentAt, { time: clockOrDate(Date.parse(order.created_at), now, locale) });
    return (
      <li key={order.id} className={`sf-order stage-${stage} tone-${tone}`}>
        <div className="sf-order-head">
          <div className="sf-order-title">
            <strong>{tableText(order)}</strong>
            <small>
              {orderLabel(order)} · {meta}
            </small>
          </div>
          <span className={`sf-chip stage-${stage}`}>{o.stage[stage]}</span>
        </div>

        {(timed || order.preorder) && (
          <div className="sf-order-tags">
            {timed && (
              <span className={`sf-wait tone-${tone}`}>{minutes < 1 ? copy.justNow : fill(o.inStage, { time: waitText(minutes, copy) })}</span>
            )}
            {order.preorder && <span className="sf-tag">{o.preorder}</span>}
          </div>
        )}

        <ul className="sf-order-items">
          {order.items.map((item, index) => (
            <li key={`${item.menu_item_id}-${index}`} className={item.unavailable ? "is-off" : ""}>
              <b>{item.qty}×</b>
              <span>{pickLocale(item.name, locale)}</span>
              {(item.requires_age_18 || item.age_check) && <em className="sf-adult">{o.adult}</em>}
              {item.unavailable && <small>{o.unavailable}</small>}
            </li>
          ))}
        </ul>

        {ageBlock && (
          <div className="sf-age" role="note">
            <strong>{o.ageTitle}</strong>
            <p>{o.ageBody}</p>
            <div className="sf-age-actions">
              <button
                type="button"
                className="panel-btn sm"
                disabled={busy !== null}
                onClick={() => void run(order.id, () => onAgeCheck(order, true))}
              >
                {o.ageApprove}
              </button>
              <button
                type="button"
                className="panel-btn sm ghost"
                disabled={busy !== null}
                onClick={() => setConfirm({ order, kind: "refuse" })}
              >
                {o.ageRefuse}
              </button>
            </div>
          </div>
        )}

        <div className="sf-order-foot">
          <div className="sf-order-total">
            <small>
              {o.total} · {items} {pluralize(items, o.itemsForms, locale)}
            </small>
            <strong>{formatPrice(order.total, locale)}</strong>
          </div>
          <div className="sf-order-actions">
            {canCancel && (
              <button
                type="button"
                className="panel-btn sm ghost sf-btn-quiet"
                disabled={busy !== null}
                onClick={() => setConfirm({ order, kind: "cancel" })}
              >
                {o.cancel}
              </button>
            )}
            {next && (
              <button
                type="button"
                className="panel-btn sm"
                disabled={busy !== null || blocked}
                title={blocked ? copy.errors.ageCheckPending : o.nextHint[next]}
                onClick={() => void run(order.id, () => onAdvance(order, next))}
              >
                {o.next[next]}
              </button>
            )}
          </div>
        </div>
      </li>
    );
  };

  const grid = (list: Order[]) => <ul className="sf-order-grid">{list.map(card)}</ul>;

  const section = (stage: OrderStage, list: Order[]) =>
    list.length > 0 && (
      <section key={stage} className="sf-order-group" aria-labelledby={`sf-orders-${stage}`}>
        <h3 className="sf-group-title" id={`sf-orders-${stage}`}>
          {o.filter[stage as Exclude<OrderFilter, "active" | "closed">]}
          <b className={`sf-count ${stage === "ready" ? "tone-live" : ""}`}>{list.length}</b>
        </h3>
        {grid(list)}
      </section>
    );

  let body: React.ReactNode;
  if (filter === "active") {
    body =
      counts.active === 0 ? (
        <StaffEmpty
          icon={<ReceiptIcon />}
          title={o.emptyTitle}
          hint={o.emptyHint}
          action={
            counts.scheduled > 0 ? (
              <button type="button" className="panel-btn ghost" onClick={() => setFilter("scheduled")}>
                {o.filter.scheduled} · {counts.scheduled}
              </button>
            ) : undefined
          }
        />
      ) : (
        SERVICE_ORDER.map((stage) => section(stage, board[stage]))
      );
  } else {
    const list = filter === "closed" ? board.closedToday : board[filter];
    body = list.length ? (
      grid(list)
    ) : (
      <StaffEmpty
        icon={<ReceiptIcon />}
        title={o.emptyFiltered}
        action={
          <button type="button" className="panel-btn ghost" onClick={() => setFilter("active")}>
            {o.showAll}
          </button>
        }
      />
    );
  }

  const confirmOrder = confirm?.order;

  return (
    <div className="sf-stack">
      <div className="sf-filters" role="group" aria-label={o.filtersLabel}>
        {FILTERS.map((key) => (
          <button
            key={key}
            type="button"
            className={filter === key ? "active" : ""}
            aria-pressed={filter === key}
            onClick={() => setFilter(key)}
          >
            {o.filter[key]}
            <b>{counts[key]}</b>
          </button>
        ))}
      </div>

      {body}

      <CabinetConfirmDialog
        open={Boolean(confirm)}
        tone="danger"
        title={
          confirm?.kind === "refuse"
            ? o.ageRefuseTitle
            : fill(o.cancelTitle, { label: confirmOrder ? orderLabel(confirmOrder) : "" })
        }
        text={confirm?.kind === "refuse" ? o.ageRefuseBody : o.cancelBody}
        confirmLabel={confirm?.kind === "refuse" ? o.ageRefuseConfirm : o.cancelConfirm}
        cancelLabel={o.keep}
        busy={busy !== null}
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          if (!confirm) return;
          const { order, kind } = confirm;
          void run(order.id, async () => {
            if (kind === "refuse") await onAgeCheck(order, false);
            else await onCancel(order);
            setConfirm(null);
          });
        }}
      />
    </div>
  );
}
