// Sentry on the Edge runtime (middleware, proxy, edge routes); loaded by instrumentation.ts.
import * as Sentry from "@sentry/nextjs";
import { sharedSentryOptions } from "./sentry.options";

// NEXT_PUBLIC_SENTRY_DSN (built in), not SENTRY_DSN: on Vercel the site and the API share one
// project's env vars, and SENTRY_DSN there is the API's (seatiko-api).
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN?.trim();

if (dsn) {
  Sentry.init({ ...sharedSentryOptions, dsn });
}
