import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts', 'test/**/*.test.tsx'],
    setupFiles: ['./test/setup.ts'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      reportsDirectory: './coverage',
      exclude: ['dist/**', 'src/react.ts', 'vitest.config.ts', 'test/setup.ts'],
      thresholds: {
        lines: 89,
        functions: 89,
        branches: 89,
        statements: 89,
      },
    },
    projects: [
      {
        test: {
          name: 'node',
          include: ['test/core/**/*.test.ts'],
          environment: 'node',
          setupFiles: ['./test/setup.ts'],
        },
      },
      {
        test: {
          name: 'react',
          include: ['test/react/**/*.test.tsx'],
          environment: 'jsdom',
          setupFiles: ['./test/setup.ts'],
        },
      },
    ],
  },
});
