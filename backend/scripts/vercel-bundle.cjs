const path = require('node:path');

if (!process.env.VERCEL) {
  process.exit(0);
}

const esbuild = require('esbuild');

esbuild.buildSync({
  entryPoints: [path.join(process.cwd(), 'dist/main.js')],
  outfile: path.join(process.cwd(), 'dist/main.js'),
  allowOverwrite: true,
  bundle: true,
  platform: 'node',
  format: 'cjs',
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
