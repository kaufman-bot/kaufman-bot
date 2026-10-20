import tsconfigPaths from 'vite-tsconfig-paths';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    root: './',
    setupFiles: ['test/setup-env.ts'],
    include: ['**/*.e2e-spec.ts'],
    passWithNoTests: true,
    // Отдельный JUnit-отчёт (юниты пишут test-results/junit.xml): CI публикует
    // его в чеки GitHub Actions через dorny/test-reporter.
    reporters: ['default', 'junit'],
    outputFile: {
      junit: './test-results/e2e-junit.xml',
    },
  },
});
