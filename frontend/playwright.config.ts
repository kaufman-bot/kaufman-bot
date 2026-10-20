import { defineConfig, devices } from '@playwright/test';

/**
 * e2e фронтенда: реальный Chromium против живого стека (спеки в каталоге e2e/).
 *
 * По умолчанию тесты идут на http://localhost:3000 — туда `npm run start:prod`
 * поднимает бэкенд, который в prod раздаёт собранный Angular-фронт
 * (ServeStaticModule) и обслуживает /api/v1/*. Сам набор ничего не запускает:
 * инфраструктура и приложение — ответственность start-prod.sh (в CI — шаг
 * «Start production stack»). Для локального dev-цикла подходит и ng serve с
 * прокси /api: `E2E_BASE_URL=http://localhost:4200 npm run test:e2e`.
 */
const baseURL = process.env['E2E_BASE_URL'] ?? 'http://localhost:3000';

export default defineConfig({
  testDir: './e2e',
  // Тесты пишут в одну живую БД через UI → последовательно, один воркер.
  fullyParallel: false,
  workers: 1,
  retries: process.env['CI'] ? 1 : 0,
  reporter: [
    ['list'],
    // JUnit-отчёт для dorny/test-reporter (чеки в GitHub Actions).
    ['junit', { outputFile: 'test-results/e2e-junit.xml' }],
    ['html', { outputFolder: 'test-results/playwright-report', open: 'never' }],
  ],
  // Скриншоты/трейсы провалившихся тестов — рядом с отчётами (в gitignore).
  outputDir: 'test-results/e2e-artifacts',
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
