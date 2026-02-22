import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    include: ['src/__tests__/**/*.test.ts'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      include: ['src/services/**'],
      exclude: ['src/services/config.ts', 'src/services/logger.ts'],
    },
  },
});
