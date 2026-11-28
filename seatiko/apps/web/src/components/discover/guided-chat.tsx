"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type AnimationEvent } from "react";
import { discoverAi, pickLocale, type DiscoverResult } from "@/lib/api";
import { getSiteCopy } from "@/lib/site-copy";
import { useLocale } from "@/components/locale-provider";

type Msg = {
  role: "assistant" | "user";
  text: string;
  venues?: { id: string; name: string }[];
  mapHref?: string;
  pending?: boolean;
};

/** Human summary of the understood filters, from the same chip labels as the stepper. */
function summarize(
  result: DiscoverResult,
  chips: Record<string, string>,
  budgetLabel: (min: number, max: number) => string,
): string {
  const p = result.prefs;
  if (!p) return "";
  const ids = [...p.cuisine, ...p.restaurant_type, ...p.occasion, ...p.practical];
  const parts = ids.map((id) => chips[id] ?? id);
  if (p.budget) parts.push(budgetLabel(p.budget.min, p.budget.max));
  return parts.join(", ");
}

type Props = {
  /** Prefer true to avoid SSR/client matchMedia mismatches; expand via toggle or CSS. */
  collapsedDefault?: boolean;
};

type BlurbIconId = "personal" | "faster" | "easy" | "map";

function BlurbIcon({ id }: { id: BlurbIconId }) {
  const common = {
    width: 18,
    height: 18,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.9,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true as const,
  };

  switch (id) {
    case "personal":
      return (
        <svg {...common}>
          <circle cx="12" cy="8" r="3.2" />
          <path d="M5.5 19.2c1.4-3.1 3.6-4.6 6.5-4.6s5.1 1.5 6.5 4.6" />
        </svg>
      );
    case "faster":
      return (
        <svg {...common}>
          <path d="M13 2 4.5 13.5H12l-1 8.5L19.5 10.5H12L13 2z" />
        </svg>
      );
    case "easy":
      return (
        <svg {...common}>
          <path d="M20 7.5 10.2 17.3 4.5 11.6" />
        </svg>
      );
    case "map":
      return (
        <svg {...common}>
          <path d="M12 21s6-5.2 6-10a6 6 0 1 0-12 0c0 4.8 6 10 6 10z" />
          <circle cx="12" cy="11" r="2.2" />
        </svg>
      );
  }
}

function scrollToFilters() {
  document.getElementById("discover-top")?.scrollIntoView({
    behavior: "smooth",
    block: "start",
  });
}

export function GuidedChat({ collapsedDefault = true }: Props) {
  const { locale, t } = useLocale();
  const copy = getSiteCopy(locale).discover;
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(!collapsedDefault);
  const [closing, setClosing] = useState(false);
  const [draft, setDraft] = useState("");
  const [examplesVisible, setExamplesVisible] = useState(true);
  const [messages, setMessages] = useState<Msg[]>(() => [
    { role: "assistant", text: copy.chatStubIntro },
  ]);
  const logRef = useRef<HTMLDivElement | null>(null);
  const shellVisible = open || closing;

  useEffect(() => {
    const el = logRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, open]);

  function openChat() {
    setClosing(false);
    setOpen(true);
  }

  function closeChat() {
    if (!open || closing) return;
    setOpen(false);
    setClosing(true);
  }

  function onShellAnimationEnd(event: AnimationEvent<HTMLDivElement>) {
    if (event.target !== event.currentTarget) return;
    if (!closing) return;
    setClosing(false);
  }

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    setDraft("");
    setMessages((m) => [
      ...m,
      { role: "user", text: trimmed },
      { role: "assistant", text: t("discover_ai.thinking"), pending: true },
    ]);
    let reply: Msg;
    try {
      const result = await discoverAi({ query: trimmed, locale, city_id: "city-balti" });
      const summary = summarize(result, copy.chips as Record<string, string>, (min, max) =>
        t("discover_ai.budget", { min, max }),
      );
      if (!summary) {
        reply = { role: "assistant", text: t("discover_ai.not_understood") };
      } else {
        const explanation =
          typeof result.explanation === "string" && result.explanation
            ? result.explanation
            : t("discover_ai.understood", { filters: summary });
        reply = {
          role: "assistant",
          text: result.exact === false ? `${explanation} ${t("discover_ai.approx")}` : explanation,
          venues: result.venues.slice(0, 3).map((v) => ({ id: v.id, name: pickLocale(v.name, locale) })),
          mapHref: result.query_string ? `/?${result.query_string}#map` : "/#map",
        };
      }
    } catch {
      reply = { role: "assistant", text: t("discover_ai.error") };
    }
    setMessages((m) => [...m.filter((msg) => !msg.pending), reply]);
    setBusy(false);
  }

  return (
    <aside className={`discover-chat${shellVisible ? " open" : ""}`}>
      <div className="discover-chat-idle">
        <button
          type="button"
          className="discover-chat-launcher"
          onClick={openChat}
          aria-expanded={open}
        >
          <span className="discover-chat-launcher-dot" aria-hidden />
          <span>
            <strong>{copy.askHelp}</strong>
            <small>{copy.chatTeaser}</small>
          </span>
        </button>
        <div className="discover-chat-blurb">
          <p className="discover-chat-blurb-title">{copy.chatBlurbTitle}</p>
          <ul className="discover-chat-blurb-list">
            {copy.chatBlurbPoints.map((point) => (
              <li key={point.id}>
                <span className="discover-chat-blurb-icon" aria-hidden>
                  <BlurbIcon id={point.id as BlurbIconId} />
                </span>
                <div className="discover-chat-blurb-copy">
                  <strong>{point.title}</strong>
                  <span>{point.body}</span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {shellVisible ? (
        <div
          className={`discover-chat-shell${closing ? " closing" : ""}`}
          onAnimationEnd={onShellAnimationEnd}
        >
          <header className="discover-chat-head">
            <div className="discover-chat-head-copy">
              <span className="discover-chat-avatar" aria-hidden>
                A
              </span>
              <div>
                <strong>{copy.chatTitle}</strong>
                <small>{copy.chatSubtitle}</small>
              </div>
            </div>
            <button
              type="button"
              className="btn btn--ghost btn--sm btn--icon discover-chat-close"
              onClick={closeChat}
              aria-label={copy.chatClose}
            >
              ×
            </button>
          </header>

          <div className="discover-chat-log" ref={logRef} aria-live="polite">
            {messages.map((msg, i) => (
              <div key={i} className={`discover-chat-row ${msg.role}`}>
                {msg.role === "assistant" ? (
                  <span className="discover-chat-avatar sm" aria-hidden>
                    A
                  </span>
                ) : null}
                <div className={`discover-chat-msg ${msg.role}${msg.pending ? " pending" : ""}`}>
                  <p>{msg.text}</p>
                  {msg.venues?.length ? (
                    <>
                      <span className="discover-chat-top">{t("discover_ai.top")}</span>
                      <ul className="discover-chat-venues">
                        {msg.venues.map((v) => (
                          <li key={v.id}>
                            <Link href={`/venues/${encodeURIComponent(v.id)}`}>{v.name}</Link>
                          </li>
                        ))}
                      </ul>
                    </>
                  ) : null}
                  {msg.mapHref ? (
                    <Link className="btn btn--link discover-chat-map-link" href={msg.mapHref}>
                      {t("discover_ai.show_map")} →
                    </Link>
                  ) : null}
                </div>
              </div>
            ))}
          </div>

          <div className="discover-chat-composer">
            <div className="discover-chat-hints">
              <button
                type="button"
                className="btn btn--link discover-chat-hints-toggle"
                aria-expanded={examplesVisible}
                onClick={() => setExamplesVisible((v) => !v)}
              >
                {examplesVisible ? copy.chatExamplesHide : copy.chatExamplesShow}
              </button>
              {examplesVisible ? (
                <div
                  className="discover-chat-examples"
                  role="group"
                  aria-label={copy.chatExamplesLabel}
                >
                  {copy.chatExamples.map((example) => (
                    <button
                      key={example}
                      type="button"
                      className="chip discover-chip"
                      onClick={() => setDraft(example)}
                    >
                      {example}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
            <form
              className="discover-chat-form"
              onSubmit={(e) => {
                e.preventDefault();
                void send(draft);
              }}
            >
              <input
                type="text"
                className="discover-chat-input"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder={copy.chatPlaceholder}
                aria-label={copy.chatPlaceholder}
              />
              <button type="submit" className="btn btn--primary btn--md discover-chat-send" disabled={busy}>
                {copy.chatSend}
              </button>
            </form>
            <button
              type="button"
              className="btn btn--link discover-chat-to-filters"
              onClick={scrollToFilters}
            >
              {copy.chatToFilters}
            </button>
          </div>
        </div>
      ) : null}
    </aside>
  );
}
