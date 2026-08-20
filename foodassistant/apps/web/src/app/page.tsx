"use client";

import { useEffect, useState } from "react";
import { fetchVenues, pickLocale, type Venue } from "@/lib/api";
import { useLocale, type Locale } from "@/components/locale-provider";

export default function HomePage() {
  const { locale, setLocale, t } = useLocale();
  const [venues, setVenues] = useState<Venue[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchVenues()
      .then((list) => {
        if (!cancelled) {
          setVenues(list);
          setError(null);
        }
      })
      .catch(() => {
        if (!cancelled) setError("API offline — start Go server on :8080");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="relative min-h-screen overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_20%_10%,#2d5a3d55,transparent_50%),radial-gradient(ellipse_at_80%_0%,#c4a57433,transparent_40%),linear-gradient(180deg,#0f1410_0%,#1a2218_100%)]"
      />

      <header className="relative z-10 flex items-center justify-between px-6 py-5 md:px-10">
        <div>
          <p className="font-[family-name:var(--font-display)] text-2xl tracking-tight text-[#f3efe6] md:text-3xl">
            {t("brand.name")}
          </p>
          <p className="mt-1 text-sm text-[#a8b5a0]">
            {t("map.title")} · Moldova pilot
          </p>
        </div>
        <div className="flex items-center gap-2">
          {(["ru", "en", "ro"] as Locale[]).map((l) => (
            <button
              key={l}
              type="button"
              onClick={() => setLocale(l)}
              className={`rounded-md px-2.5 py-1 text-xs uppercase tracking-wide transition ${
                locale === l
                  ? "bg-[#c4a574] text-[#1a1510]"
                  : "bg-white/5 text-[#c8d0c2] hover:bg-white/10"
              }`}
            >
              {l}
            </button>
          ))}
        </div>
      </header>

      <main className="relative z-10 mx-auto grid w-full max-w-6xl gap-8 px-6 pb-16 pt-4 md:grid-cols-[1.1fr_0.9fr] md:px-10">
        <section className="flex min-h-[420px] flex-col justify-end rounded-2xl border border-white/10 bg-[linear-gradient(160deg,#1f2a22_0%,#121812_55%,#0c100c_100%)] p-8 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
          <p className="mb-3 text-sm uppercase tracking-[0.2em] text-[#c4a574]">
            {t("map.title")}
          </p>
          <h1 className="font-[family-name:var(--font-display)] text-4xl leading-tight text-[#f7f2e8] md:text-5xl">
            {t("brand.name")}
          </h1>
          <p className="mt-4 max-w-md text-base leading-relaxed text-[#b7c2b0]">
            {t("map.search")}
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <a
              href="#venues"
              className="rounded-lg bg-[#c4a574] px-5 py-2.5 text-sm font-semibold text-[#1a1510] transition hover:bg-[#d4b888]"
            >
              {t("nav.map")}
            </a>
            <button
              type="button"
              className="rounded-lg border border-white/15 bg-white/5 px-5 py-2.5 text-sm text-[#e8e4db] transition hover:bg-white/10"
            >
              {t("auth.login")}
            </button>
          </div>
        </section>

        <section id="venues" className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-[#f3efe6]">
              {t("nav.map")}
            </h2>
            <span className="text-xs text-[#8f9b88]">{t("map.change_city")}</span>
          </div>

          {loading && (
            <p className="text-sm text-[#9aa690]">{t("common.loading")}</p>
          )}
          {error && (
            <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
              {error}
            </p>
          )}

          <ul className="space-y-3">
            {venues.map((v) => (
              <li
                key={v.id}
                className="rounded-xl border border-white/10 bg-white/[0.03] p-4 transition hover:border-[#c4a574]/40 hover:bg-white/[0.05]"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-[#f3efe6]">
                      {pickLocale(v.name, locale)}
                    </p>
                    <p className="mt-1 text-sm text-[#9aa690]">
                      {pickLocale(v.address, locale)}
                    </p>
                  </div>
                  <span className="text-sm text-[#c4a574]">★ {v.rating}</span>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-[#a8b5a0]">
                  <span>
                    {v.open_now ? t("venue.open") : t("venue.closed")}
                  </span>
                  <span>
                    {t("map.free_tables", { count: v.free_tables })}
                  </span>
                  <span>{"€".repeat(v.price_level)}</span>
                </div>
              </li>
            ))}
          </ul>
        </section>
      </main>
    </div>
  );
}
