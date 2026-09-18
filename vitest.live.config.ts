/**
 * Config for the live model evaluation (`npm run eval:live`).
 * Kept separate so the default `npm test` can never make a network call.
 */
import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      'server-only': fileURLToPath(new URL('./tests/stubs/server-only.ts', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/live-eval.test.ts'],
    testTimeout: 90_000,
  },
});
