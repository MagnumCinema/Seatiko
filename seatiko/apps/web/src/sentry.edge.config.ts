// Sentry on the Edge runtime (middleware, proxy, edge routes); loaded by instrumentation.ts.
import * as Sentry from "@sentry/nextjs";
import { sharedSentryOptions } from "./sentry.options";

const dsn = process.env.SENTRY_DSN?.trim();

if (dsn) {
  Sentry.init({ ...sharedSentryOptions, dsn });
}
