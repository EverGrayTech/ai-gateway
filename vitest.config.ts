import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      reportsDirectory: './coverage',
      exclude: ['dist/**', 'vitest.config.ts'],
      thresholds: {
        lines: 89,
        functions: 89,
        branches: 89,
        statements: 89,
      },
    },
  },
});
