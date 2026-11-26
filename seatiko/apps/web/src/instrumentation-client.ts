// Sentry in the browser: runs before the app becomes interactive.
import * as Sentry from "@sentry/nextjs";
import { sharedSentryOptions } from "./sentry.options";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN?.trim();

if (dsn) {
  Sentry.init({
    ...sharedSentryOptions,
    dsn,
    integrations: [
      // Personal data on screen (guests' names, emails, phones): every text, input and
      // image is masked or blocked in replays.
      Sentry.replayIntegration({ maskAllText: true, maskAllInputs: true, blockAllMedia: true }),
    ],
    // Replays only of sessions that hit an error.
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 1.0,
  });
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
