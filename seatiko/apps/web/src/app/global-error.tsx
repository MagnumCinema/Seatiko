"use client";

import * as Sentry from "@sentry/nextjs";
import NextError from "next/error";
import { useEffect } from "react";

/** Last-resort error page of the App Router (errors in the root layout); reports to Sentry. */
export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="ru">
      <body>
        {/* The App Router exposes no status code for errors, so 0 shows the generic message. */}
        <NextError statusCode={0} />
      </body>
    </html>
  );
}
