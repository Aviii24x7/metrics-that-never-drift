import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // Each integration/property/guard test spins up an isolated Postgres schema on
    // the configured database. Running test files sequentially keeps the number of
    // concurrent connections low (important against a pooled cloud database like Neon).
    fileParallelism: false,
    hookTimeout: 60_000,
    testTimeout: 60_000,
  },
});
