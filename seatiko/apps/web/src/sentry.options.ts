import type * as Sentry from "@sentry/nextjs";

/**
 * Settings shared by the browser, Node.js and Edge Sentry SDKs.
 *
 * One DSN for the browser, server and edge: NEXT_PUBLIC_SENTRY_DSN (seatiko-web), built in.
 * SENTRY_DSN is the API's and is never read here (on Vercel both apps share the env vars).
 * Sentry stays off while it is empty: Sentry.init is not called and the site runs as without it.
 */

/** Set at build time by next.config.ts from SENTRY_ENVIRONMENT (or VERCEL_ENV); "development" by default. */
export const sentryEnvironment = process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT || "development";

type SharedOptions = Pick<Sentry.BrowserOptions, "environment" | "tracesSampleRate" | "dataCollection">;

export const sharedSentryOptions: SharedOptions = {
  environment: sentryEnvironment,
  // The release (git commit SHA) is injected at build time by withSentryConfig.
  tracesSampleRate: sentryEnvironment === "production" ? 0.1 : 1.0,
  // Guests' names, emails and phones travel in bodies, headers and queries: none of it is sent.
  // (SDK v11 replaced sendDefaultPii with these switches; its defaults would collect them.)
  dataCollection: {
    userInfo: false,
    cookies: false,
    httpHeaders: false,
    httpBodies: [],
    urlQueryParams: false,
    databaseQueryData: false,
    queues: false,
    genAI: { inputs: false, outputs: false },
    mcp: { inputs: false, outputs: false },
    stackFrameVariables: false,
  },
};
