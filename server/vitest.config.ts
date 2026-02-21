import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/__tests__/**/*.test.ts'],
    environment: 'node',
    globals: true,
    coverage: {
      provider: 'v8',
      include: ['src/services/**'],
      exclude: ['src/services/config.ts', 'src/services/logger.ts'],
    },
  },
});
