import { expect, test, type Page } from '@playwright/test';

/**
 * e2e дашборда. Страница открывает три обращения к живому бэкенду:
 * GET /api/v1/health, GET /api/v1/time и EventSource на /api/v1/time/stream,
 * поэтому проверки опираются и на DOM, и на сами HTTP-ответы.
 */

/** Ждёт ответа API по точному пути (запросы идут на тот же origin, что и UI). */
function waitForApi(page: Page, pathname: string) {
  return page.waitForResponse(
    (response) => new URL(response.url()).pathname === pathname,
  );
}

test.describe('Дашборд серверного времени', () => {
  test('прод отдаёт собранный фронтенд и рисует статус бэкенда', async ({
    page,
  }) => {
    const health = waitForApi(page, '/api/v1/health');

    await page.goto('/');

    const response = await health;
    expect(response.ok()).toBeTruthy();

    await expect(page.locator('h1')).toContainText('Dashboard');
    // Карточки рендерятся после ответа /health — заглушка загрузки уходит.
    await expect(page.locator('.loading')).toHaveCount(0);
    await expect(
      page.getByRole('heading', { name: 'Общий статус' }),
    ).toBeVisible();
    await expect(page.getByText('Подключена')).toBeVisible();
    await expect(page.locator('.error-banner')).toHaveCount(0);
  });

  test('SSE-поток обновляет серверное время в UI', async ({ page }) => {
    const stream = waitForApi(page, '/api/v1/time/stream');

    await page.goto('/');
    const response = await stream;
    expect(response.ok()).toBeTruthy();

    const serverTime = page.locator('.time-display');
    // Значение появляется из EventSource: сначала «—», при ошибке «offline».
    await expect(serverTime).not.toHaveText('—', { timeout: 15_000 });
    await expect(serverTime).not.toHaveText('offline');
    // Сервер отдаёт кадр раз в секунду, поэтому в выводе обязаны быть секунды.
    await expect(serverTime).toContainText(/\d{1,2}:\d{2}:\d{2}/);

    // Дальше UI должен обновляться сам, без действий пользователя: следующий
    // кадр потока приходит не позднее чем через секунду после предыдущего.
    const firstFrame = await serverTime.innerText();
    await expect(serverTime).not.toHaveText(firstFrame, { timeout: 5_000 });

    const secondFrame = await serverTime.innerText();
    await expect(serverTime).not.toHaveText(secondFrame, { timeout: 5_000 });
    await expect(serverTime).not.toHaveText('offline');
  });

  test('кнопка «Обновить по REST» тянет свежий снимок времени', async ({
    page,
  }) => {
    await page.goto('/');

    const restTime = page
      .locator('.row', { hasText: 'REST /time (снимок)' })
      .locator('.value');
    await expect(restTime).not.toHaveText('—', { timeout: 15_000 });
    const before = await restTime.innerText();

    // Снимок выводится с точностью до секунды, поэтому перед кликом ждём больше
    // секунды — иначе «до» и «после» могут оказаться одним и тем же значением.
    await page.waitForTimeout(1_500);

    const snapshot = waitForApi(page, '/api/v1/time');
    await page.getByRole('button', { name: 'Обновить по REST' }).click();
    const response = await snapshot;

    expect(response.ok()).toBeTruthy();
    // Див должен показать именно новый ответ, а не прежний снимок.
    await expect(restTime).not.toHaveText(before);
    await expect(restTime).not.toHaveText('нет данных');
    await expect(restTime).toContainText(/\d{1,2}:\d{2}:\d{2}/);
  });

  test('статистика показывает seeded-аккаунты', async ({ page }) => {
    await page.goto('/');

    const users = page
      .locator('.row', { hasText: 'Пользователи' })
      .locator('.value');
    await expect(users).toHaveText(/\d+/, { timeout: 15_000 });

    const apiKeys = page
      .locator('.row', { hasText: 'API ключи' })
      .locator('.value');
    await expect(apiKeys).toHaveText(/\d+/);

    // Сид-сервис создаёт админа и его ключ при бутстрапе бэкенда.
    expect(Number(await users.innerText())).toBeGreaterThanOrEqual(1);
    expect(Number(await apiKeys.innerText())).toBeGreaterThanOrEqual(1);
  });
});
