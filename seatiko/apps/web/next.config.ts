import { execSync } from "node:child_process";
import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs/config";

const nextConfig: NextConfig = {
  env: {
    // Sentry environment for the browser bundle and the server (see src/sentry.options.ts).
    NEXT_PUBLIC_SENTRY_ENVIRONMENT: process.env.SENTRY_ENVIRONMENT || process.env.VERCEL_ENV || "development",
  },
  // Next.js 16.3+ with Turbopack skips next-server.js.nft.json when a build adapter
  // (Vercel's NEXT_ADAPTER_PATH) is active, so forcing standalone crashes post-build.
  // Keep standalone for Docker / self-hosted builds only.
  output: process.env.VERCEL || process.env.NEXT_ADAPTER_PATH ? undefined : "standalone",
  async rewrites() {
    // On Vercel Services, top-level rewrites in vercel.json route /api/*, /uploads/*, and /healthz directly.
    if (process.env.VERCEL) {
      return [];
    }
    const target = (process.env.API_INTERNAL_URL || "http://localhost:80").replace(/\/+$/, "");
    return [
      {
        source: "/api/:path*",
        destination: `${target}/api/:path*`,
      },
      {
        source: "/uploads/:path*",
        destination: `${target}/uploads/:path*`,
      },
      {
        source: "/healthz",
        destination: `${target}/healthz`,
      },
    ];
  },
};

// Sentry: build-time instrumentation, release injection (git commit SHA) and source map
// upload. Uploading needs SENTRY_AUTH_TOKEN; without it source maps are skipped silently.
const sentryAuthToken = process.env.SENTRY_AUTH_TOKEN || undefined;

/** Commit being built: Vercel's, else the local git HEAD; none in a Docker image (no .git). */
function buildCommitSha(): string | undefined {
  if (process.env.VERCEL_GIT_COMMIT_SHA) return process.env.VERCEL_GIT_COMMIT_SHA;
  try {
    return execSync("git rev-parse HEAD", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim() || undefined;
  } catch {
    return undefined;
  }
}
const commitSha = sentryAuthToken ? buildCommitSha() : undefined;

export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG || "magnum-ft",
  project: process.env.SENTRY_PROJECT || "seatiko-web",
  sentryUrl: process.env.SENTRY_URL || "https://de.sentry.io/",
  authToken: sentryAuthToken,
  sourcemaps: { disable: !sentryAuthToken },
  // Release = git commit SHA (or SENTRY_RELEASE), linked to its commits through Sentry's GitHub
  // integration (suspect commits). The commit is named explicitly: the plugin's `auto` mode links
  // none with this SDK. Without git (Docker image) commits are skipped.
  release: {
    setCommits: commitSha ? { repo: process.env.SENTRY_REPO || "MagnumCinema/Seatiko", commit: commitSha } : false,
  },
  // A Sentry hiccup (release, upload) warns instead of failing the build.
  errorHandler: (err) => console.warn("[sentry] build step skipped:", err.message),
  // Next.js internals and dependencies too, for readable client stack traces.
  widenClientFileUpload: true,
  silent: !process.env.CI,
  telemetry: false,
});
