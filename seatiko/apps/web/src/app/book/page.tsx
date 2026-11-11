"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { QuickBookSearch } from "@/components/quick-book-search";
import { useLocale } from "@/components/locale-provider";
import { venueBookingHref } from "@/lib/booking-link";

/** Old `/book?venue=<id>` links open quick booking on the venue page instead. */
function BookInner() {
  const params = useSearchParams();
  const router = useRouter();
  const venueId = params.get("venue")?.trim() || "";

  useEffect(() => {
    if (venueId) router.replace(venueBookingHref(venueId, { time: params.get("time") ?? undefined }));
  }, [venueId, params, router]);

  if (venueId) return null;
  return <QuickBookSearch />;
}

export default function BookPage() {
  const { t } = useLocale();
  return (
    <div className="venue-page book-page">
      <SiteHeader variant="solid" />
      <main className="book-main-content">
        <Suspense fallback={<div className="venue-page-loading">{t("venue.loading")}</div>}>
          <BookInner />
        </Suspense>
      </main>
      <SiteFooter />
    </div>
  );
}
