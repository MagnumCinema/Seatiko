"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useLocale, type Locale } from "@/components/locale-provider";
import { getSiteCopy } from "@/lib/site-copy";

type Props = {
  variant?: "transparent" | "solid";
};

function scrollToId(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

export function SiteHeader({ variant = "solid" }: Props) {
  const { locale, setLocale } = useLocale();
  const copy = getSiteCopy(locale).header;
  const pathname = usePathname();
  const router = useRouter();

  function goHomeSection(sectionId: "map" | "how") {
    if (pathname === "/") {
      scrollToId(sectionId);
      window.history.replaceState(null, "", `/#${sectionId}`);
      return;
    }
    router.push(`/#${sectionId}`);
  }

  return (
    <header className={`site-header ${variant}`}>
      <div className="site-header-inner">
        <Link href="/" className="site-brand">
          <span className="site-brand-mark" aria-hidden>F</span>
          <span>FoodAssistant</span>
        </Link>
        <nav className="site-nav" aria-label={copy.nav}>
          <a
            href="/#map"
            onClick={(event) => {
              event.preventDefault();
              goHomeSection("map");
            }}
          >
            {copy.map}
          </a>
          <a
            href="/#how"
            onClick={(event) => {
              event.preventDefault();
              goHomeSection("how");
            }}
          >
            {copy.how}
          </a>
          <Link href="/business">{copy.business}</Link>
          <Link href="/book">{copy.book}</Link>
          <div className="site-lang" role="group" aria-label={copy.language}>
            {(["ru", "en", "ro"] as Locale[]).map((l) => (
              <button
                key={l}
                type="button"
                className={locale === l ? "on" : ""}
                onClick={() => setLocale(l)}
              >
                {l.toUpperCase()}
              </button>
            ))}
          </div>
          <Link href="/login" className="site-nav-login">{copy.login}</Link>
          <Link href="/register" className="site-nav-cta">{copy.connect}</Link>
        </nav>
      </div>
    </header>
  );
}
