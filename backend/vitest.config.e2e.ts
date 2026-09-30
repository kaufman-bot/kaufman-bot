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
  },
});
