import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

if (!process.env.VERCEL) {
  process.exit(0);
}

function collectFiles(rootDir, prefix = '') {
  const out = {};
  if (!existsSync(rootDir)) return out;
  for (const entry of readdirSync(rootDir)) {
    const abs = join(rootDir, entry);
    const rel = prefix ? `${prefix}/${entry}` : entry;
    if (statSync(abs).isDirectory()) {
      Object.assign(out, collectFiles(abs, rel));
    } else {
      out[rel] = readFileSync(abs, 'utf8');
    }
  }
  return out;
}

const migrations = collectFiles(join(process.cwd(), 'src/database/migrations'));
const demoPath = join(process.cwd(), 'src/database/seed/demo-state.json');
const openapiPath = join(process.cwd(), 'contract/openapi.yaml');

const bundledAssets = {
  migrations,
  demoState: existsSync(demoPath) ? JSON.parse(readFileSync(demoPath, 'utf8')) : undefined,
  openapiYaml: existsSync(openapiPath) ? readFileSync(openapiPath, 'utf8') : undefined,
};

const { build } = await import('esbuild');
await build({
  entryPoints: [join(process.cwd(), 'dist/main.js')],
  outfile: join(process.cwd(), 'dist/main.js'),
  allowOverwrite: true,
  bundle: true,
  platform: 'node',
  format: 'cjs',
  packages: 'external',
  define: {
    'import.meta.dirname': '__dirname',
  },
  banner: {
    js: `globalThis.__SEATIKO_BUNDLED_ASSETS__ = ${JSON.stringify(bundledAssets)};`,
  },
});

console.log('Vercel CommonJS bundle built: dist/main.js');
