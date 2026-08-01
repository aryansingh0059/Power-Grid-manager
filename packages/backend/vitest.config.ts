import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // No global DB setup — tests must be self-contained.
    // Mongoose readyState will be 0 (disconnected), which is expected.
  },
});
