"use client";

import { useMemo, useState } from "react";
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

  return (
    <aside className={`discover-chat ${open ? "open" : ""}`}>
      <button
        type="button"
        className="discover-chat-toggle"
        onClick={() => setOpen((v) => !v)}
      >
        {copy.askHelp}
      </button>
      {open && (
        <div className="discover-chat-panel">
          <div className="discover-chat-log" aria-live="polite">
            {messages.map((msg, i) => (
              <p key={i} className={`discover-chat-msg ${msg.role}`}>
                {msg.text}
              </p>
            ))}
          </div>
          {dimension && (
            <div className="discover-chips">
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
          )}
        </div>
      )}
    </aside>
  );
}
