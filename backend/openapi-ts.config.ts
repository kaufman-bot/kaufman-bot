import { defineConfig } from '@hey-api/openapi-ts';

/**
 * Генерирует типизированный SDK клиента для e2e-тестов (test/utils/activity-helper.ts).
 * Вход — ./swagger.json, который бэкенд перезаписывает при каждом старте (src/main.ts),
 * поэтому перед перегенерацией убедитесь, что бэкенд хотя бы раз запускался.
 */
export default defineConfig({
  input: './swagger.json',
  output: 'test/generated/client',
  plugins: [
    // baseUrl указывается здесь, но в тестах переопределяется через createClient(...)
    {
      name: '@hey-api/client-fetch',
      baseUrl: 'http://localhost:3000',
    },
    '@hey-api/typescript',
    {
      name: '@hey-api/sdk',
      operations: {
        strategy: 'single',
      },
    },
  ],
});
