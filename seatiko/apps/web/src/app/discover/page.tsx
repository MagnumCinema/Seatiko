"use client";

import { Suspense } from "react";
import { DiscoverWizard } from "@/components/discover/discover-wizard";

export default function DiscoverPage() {
  return (
    <Suspense fallback={null}>
      <DiscoverWizard />
    </Suspense>
  );
}
