"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  BUDGET_LEVELS,
  CUISINE_IDS,
  OCCASION_IDS,
  PRACTICAL_IDS,
  RESTAURANT_TYPE_IDS,
  type DiscoverPreferences,
} from "@/lib/discover-preferences";
import {
  CHAT_STEPS,
  applyChatAnswer,
  isChatComplete,
  nextChatStepIndex,
  type ChatDimension,
} from "@/lib/guided-chat-script";
import { getSiteCopy } from "@/lib/site-copy";
import { useLocale } from "@/components/locale-provider";

type BudgetChipKey = "budget1" | "budget2" | "budget3";

type Props = {
  prefs: DiscoverPreferences;
  onPrefsChange: (prefs: DiscoverPreferences) => void;
  /** Prefer true to avoid SSR/client matchMedia mismatches; expand via toggle or CSS. */
  collapsedDefault?: boolean;
};

type Msg = { role: "assistant" | "user"; text: string };

export function GuidedChat({
  prefs,
  onPrefsChange,
  collapsedDefault = true,
}: Props) {
  const { locale } = useLocale();
  const copy = getSiteCopy(locale).discover;
  const [open, setOpen] = useState(!collapsedDefault);
  const [stepIndex, setStepIndex] = useState(0);
  const [messages, setMessages] = useState<Msg[]>(() => [
    { role: "assistant", text: copy.chatQuestions.cuisine },
  ]);
  const logRef = useRef<HTMLDivElement | null>(null);

  const dimension: ChatDimension | null = isChatComplete(stepIndex)
    ? null
    : CHAT_STEPS[stepIndex].dimension;

  const options = useMemo(() => {
    if (!dimension) return [];
    switch (dimension) {
      case "cuisine":
        return CUISINE_IDS.map((id) => ({ id, label: copy.chips[id] }));
      case "restaurantType":
        return RESTAURANT_TYPE_IDS.map((id) => ({
          id,
          label: copy.chips[id],
        }));
      case "budget":
        return BUDGET_LEVELS.map((b) => {
          const key = `budget${b}` as BudgetChipKey;
          return { id: String(b), label: copy.chips[key] };
        });
      case "occasion":
        return OCCASION_IDS.map((id) => ({ id, label: copy.chips[id] }));
      case "practical":
        return PRACTICAL_IDS.map((id) => ({ id, label: copy.chips[id] }));
    }
  }, [dimension, copy]);

  useEffect(() => {
    const el = logRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, open]);

  function finishAnswer(ids: string[], label: string) {
    if (!dimension) return;
    const nextPrefs = applyChatAnswer(prefs, dimension, ids);
    onPrefsChange(nextPrefs);
    const next = nextChatStepIndex(stepIndex, false);
    setMessages((m) => [
      ...m,
      { role: "user", text: label },
      {
        role: "assistant",
        text: isChatComplete(next)
          ? copy.chatDone
          : `${copy.chatAck} ${copy.chatQuestions[CHAT_STEPS[next].questionKey]}`,
      },
    ]);
    setStepIndex(next);
  }

  function skip() {
    const next = nextChatStepIndex(stepIndex, true);
    setMessages((m) => [
      ...m,
      { role: "user", text: copy.chatSkip },
      {
        role: "assistant",
        text: isChatComplete(next)
          ? copy.chatDone
          : copy.chatQuestions[CHAT_STEPS[next].questionKey],
      },
    ]);
    setStepIndex(next);
  }

  if (!open) {
    return (
      <aside className="discover-chat">
        <button
          type="button"
          className="discover-chat-launcher"
          onClick={() => setOpen(true)}
        >
          <span className="discover-chat-launcher-dot" aria-hidden />
          <span>
            <strong>{copy.askHelp}</strong>
            <small>{copy.chatTeaser}</small>
          </span>
        </button>
      </aside>
    );
  }

  return (
    <aside className="discover-chat open">
      <div className="discover-chat-shell">
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
            className="discover-chat-close"
            onClick={() => setOpen(false)}
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
              <p className={`discover-chat-msg ${msg.role}`}>{msg.text}</p>
            </div>
          ))}
        </div>

        <div className="discover-chat-composer">
          {dimension ? (
            <>
              <p className="discover-chat-composer-label">{copy.chatReplyHint}</p>
              <div className="discover-chat-replies">
                {options.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    className="discover-chip"
                    onClick={() => finishAnswer([opt.id], opt.label)}
                  >
                    {opt.label}
                  </button>
                ))}
                <button type="button" className="discover-chip" onClick={skip}>
                  {copy.chatSkip}
                </button>
              </div>
            </>
          ) : (
            <p className="discover-chat-composer-done">{copy.chatDone}</p>
          )}
        </div>
      </div>
    </aside>
  );
}
