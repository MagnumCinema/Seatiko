import { defineConfig } from 'vitest/config';

// Contract suite: black-box HTTP tests against a running API (Go or Nest).
//   CONTRACT_BASE_URL=http://127.0.0.1:18090 npm run test:contract
// Files run one after another: they share one server and its data.
export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    include: ['test/contract/**/*.contract-spec.ts'],
    fileParallelism: false,
    testTimeout: 120_000,
    globalSetup: ['test/contract/coverage.global.ts'],
  },
});
