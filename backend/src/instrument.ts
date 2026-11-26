import * as Sentry from '@sentry/nestjs';

/**
 * Sentry error monitoring and tracing. Imported first in main.ts, before Nest and
 * everything else, so its instrumentation can wrap the modules they load.
 *
 * Off while SENTRY_DSN is empty: nothing is initialised and the app runs as without Sentry.
 */
const dsn = process.env.SENTRY_DSN?.trim();

if (dsn) {
  const environment = process.env.SENTRY_ENVIRONMENT?.trim() || process.env.APP_ENV?.trim() || 'development';
  Sentry.init({
    dsn,
    environment,
    // SENTRY_RELEASE, or the commit SHA the host sets (VERCEL_GIT_COMMIT_SHA, GIT_COMMIT…); none = no release.
    release: process.env.SENTRY_RELEASE?.trim() || undefined,
    tracesSampleRate: environment === 'production' ? 0.1 : 1.0,
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
  });
}
