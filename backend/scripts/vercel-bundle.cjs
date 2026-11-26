const path = require('node:path');
const { execSync } = require('node:child_process');

if (!process.env.VERCEL) {
  process.exit(0);
}

const esbuild = require('esbuild');

/** Commit being built: Vercel's, else the local git HEAD. */
function buildCommitSha() {
  if (process.env.VERCEL_GIT_COMMIT_SHA) return process.env.VERCEL_GIT_COMMIT_SHA;
  try {
    return execSync('git rev-parse HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() || undefined;
  } catch {
    return undefined;
  }
}

/**
 * Sentry: with SENTRY_AUTH_TOKEN the bundle gets a source map (chained through tsc's maps, so
 * frames resolve to src/*.ts), which is uploaded to the seatiko-api project with the release and
 * its commits, then deleted. Without the token nothing changes.
 */
function sentryPlugins() {
  const authToken = process.env.SENTRY_AUTH_TOKEN || undefined;
  if (!authToken) return [];
  const { sentryEsbuildPlugin } = require('@sentry/esbuild-plugin');
  const commit = buildCommitSha();
  return [
    sentryEsbuildPlugin({
      org: process.env.SENTRY_ORG || 'magnum-ft',
      // Fixed on purpose: web and API share the Vercel project's env (and SENTRY_AUTH_TOKEN).
      project: 'seatiko-api',
      url: process.env.SENTRY_URL || 'https://de.sentry.io/',
      authToken,
      release: {
        setCommits: commit ? { repo: process.env.SENTRY_REPO || 'MagnumCinema/Seatiko', commit } : false,
      },
      sourcemaps: { filesToDeleteAfterUpload: ['dist/main.js.map'] },
      // A Sentry hiccup (release, upload) warns instead of failing the deploy.
      errorHandler: (err) => console.warn('[sentry] build step skipped:', err.message),
      telemetry: false,
    }),
  ];
}

async function main() {
  const plugins = sentryPlugins();
  await esbuild.build({
    entryPoints: [path.join(process.cwd(), 'dist/main.js')],
    outfile: path.join(process.cwd(), 'dist/main.js'),
    allowOverwrite: true,
    bundle: true,
    platform: 'node',
    format: 'cjs',
    sourcemap: plugins.length > 0,
    plugins,
    banner: {
      js: 'const __importMetaUrl = require("node:url").pathToFileURL(__filename).href;',
    },
    define: {
      'import.meta.url': '__importMetaUrl',
    },
    external: [
      'sharp',
      '@duckdb/node-api',
      '@nestjs/swagger',
      '@nestjs/microservices',
      '@nestjs/websockets',
      '@nestjs/websockets/socket-module',
      '@nestjs/microservices/microservices-module',
      '@fastify/*',
      'class-transformer',
      'class-validator',
      'pg-native',
      'ts-morph',
      '@mikro-orm/core',
      '@nestjs/mongoose',
      '@nestjs/typeorm',
      '@nestjs/sequelize',
      'cache-manager',
    ],
  });
  console.log('Bundled self-contained dist/main.js for Vercel');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
