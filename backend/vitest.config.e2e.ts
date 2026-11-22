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
    // Файлы идут строго друг за другом: все спеки бьют по одному живому бэкенду
    // и общей dev-БД, а домены пересекаются (например, авто-расчёт цен в
    // taxi-admin переписывает пары ВСЕХ городов, включая города e2e-визарда).
    // Дефолтный параллельный запуск файлов даёт недетерминированные
    // взаимные помехи (цена 800 вместо 5000, 404 в cleanup).
    fileParallelism: false,
    // Отдельный JUnit-отчёт (юниты пишут test-results/junit.xml): CI публикует
    // его в чеки GitHub Actions через dorny/test-reporter.
    reporters: ['default', 'junit'],
    outputFile: {
      junit: './test-results/e2e-junit.xml',
    },
  },
});
