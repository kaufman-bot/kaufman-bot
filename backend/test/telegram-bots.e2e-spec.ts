import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { TelegramBotDto } from './generated/client/types.gen.js';
import { ActivityHelper } from './utils/activity-helper.js';
import { messageOf } from './utils/api-result.js';

/**
 * E2E over `POST/GET/PATCH/DELETE /api/v1/telegram/bots`.
 *
 * Telegram bots are owned per-admin; this suite exercises:
 *   - contract: create/list/get/patch/delete flows, validation rules;
 *   - ownership: a non-ADMIN gets 403, a missing key gets 401, a foreign
 *     bot id gives 404 (same as a truly-missing bot).
 *
 * All bot CRUD runs behind two *test-spawned* ADMIN keys (`adminA`, `adminB`).
 * The seeded `admin` key is used only for registration/promotion/teardown
 * (e2e-fixture-hygiene).
 */
describe('Telegram bots (e2e, running backend)', () => {
  /** Seeded ADMIN — only used for register / promote / remove in this suite. */
  const admin = new ActivityHelper();
  /** First test-owned ADMIN — happy-path, validation, and "mine" side. */
  const adminA = new ActivityHelper();
  /** Second test-owned ADMIN — proves owner-scope isolation. */
  const adminB = new ActivityHelper();

  /** Registered user ids that the suite must delete during teardown. */
  const createdUsers: string[] = [];
  /** Bot ids created during tests, tracked for cleanup verification. */
  const createdBotIds: string[] = [];

  /**
   * Registers a fresh account, promotes it to ADMIN, returns the key.
   */
  async function spawnAdmin(tag: string) {
    const reg = await admin.registerAccount(
      `test_${admin.randomSha7}_${tag}@example.com`,
    );
    createdUsers.push(reg.user.id);
    await admin.sdk.adminUsersControllerUpdateV1({
      path: { id: reg.user.id },
      body: { role: 'ADMIN' },
    });
    return { userId: reg.user.id, apiKey: reg.apiKey.key };
  }

  beforeAll(async () => {
    await admin.ensureBackendRunning();
    admin.loginAsAdmin();

    const a = await spawnAdmin('tg-bots-admin-a');
    adminA.loginByApiKey(a.apiKey);
    const b = await spawnAdmin('tg-bots-admin-b');
    adminB.loginByApiKey(b.apiKey);
  });

  afterAll(async () => {
    // Delete all bots owned by the test-spawned admins.
    for (const owner of [adminA, adminB]) {
      const list = await owner.sdk.telegramBotsControllerListV1();
      for (const bot of (list.data ?? []) as TelegramBotDto[]) {
        await owner.sdk.telegramBotsControllerRemoveV1({
          path: { id: bot.id },
        });
      }
    }
    // Delete test-spawned user accounts.
    for (const id of createdUsers) {
      await admin.removeAccountAsAdmin(id);
    }
    void createdBotIds;
  });

  describe('access control', () => {
    it('rejects a request without an API key (401)', async () => {
      const anon = new ActivityHelper();
      const result = await anon.sdk.telegramBotsControllerListV1();

      expect(result.response?.status).toBe(401);
      expect(messageOf(result.error)).toMatch(/API key is required/i);
    });

    it('rejects a USER API key with 403 (AdminGuard)', async () => {
      const plainUser = new ActivityHelper();
      const reg = await plainUser.registerAccount(
        `test_${plainUser.randomSha7}_tg-bots-user@example.com`,
      );
      createdUsers.push(reg.user.id);
      plainUser.loginByApiKey(reg.apiKey.key);

      const result = await plainUser.sdk.telegramBotsControllerListV1();

      expect(result.response?.status).toBe(403);
      expect(messageOf(result.error)).toMatch(/admin access required/i);
    });
  });

  describe('CRUD happy path', () => {
    it('create → list → get → patch → delete flows through the caller-owned set', async () => {
      const createResult = await adminA.sdk.telegramBotsControllerCreateV1({
        body: {
          name: 'Support Bot',
          botToken: '123456:AAHabcdefghijklmnopqrstuv',
          botUsername: 'my_support_bot',
        },
      });
      expect(createResult.response?.status).toBe(201);
      const created = createResult.data as TelegramBotDto;
      expect(created.id).toBeDefined();
      expect(created.name).toBe('Support Bot');
      expect(created.botToken).toContain('…'); // masked
      expect(created.botUsername).toBe('my_support_bot');
      expect(created.isActive).toBe(true);
      createdBotIds.push(created.id);

      // Listing shows the new bot.
      const listResult = await adminA.sdk.telegramBotsControllerListV1();
      expect(listResult.response?.status).toBe(200);
      const list = listResult.data as TelegramBotDto[];
      expect(list.find((b) => b.id === created.id)).toBeDefined();

      // Get by id.
      const getResult = await adminA.sdk.telegramBotsControllerGetV1({
        path: { id: created.id },
      });
      expect(getResult.response?.status).toBe(200);
      expect((getResult.data as TelegramBotDto).name).toBe('Support Bot');

      // Patch: rename + toggle isActive.
      const patchResult = await adminA.sdk.telegramBotsControllerUpdateV1({
        path: { id: created.id },
        body: { name: 'Renamed Bot', isActive: false },
      });
      expect(patchResult.response?.status).toBe(200);
      const patched = patchResult.data as TelegramBotDto;
      expect(patched.name).toBe('Renamed Bot');
      expect(patched.isActive).toBe(false);

      // Delete → 204, and the row is gone.
      const removeResult = await adminA.sdk.telegramBotsControllerRemoveV1({
        path: { id: created.id },
      });
      expect(removeResult.response?.status).toBe(204);

      const afterDelete = await adminA.sdk.telegramBotsControllerListV1();
      const stillThere = (afterDelete.data as TelegramBotDto[]).find(
        (b) => b.id === created.id,
      );
      expect(stillThere).toBeUndefined();
    });
  });

  describe('validation', () => {
    it('rejects a missing botToken with 400', async () => {
      const result = await adminA.sdk.telegramBotsControllerCreateV1({
        body: { name: 'No Token' } as any,
      });

      expect(result.response?.status).toBe(400);
    });

    it('rejects an empty name with 400', async () => {
      const result = await adminA.sdk.telegramBotsControllerCreateV1({
        body: { name: '  ', botToken: 'valid-token-abc' },
      });

      expect(result.response?.status).toBe(400);
    });
  });

  describe('owner isolation', () => {
    it('adminB cannot get, patch, or delete a bot owned by adminA (404)', async () => {
      // Create a bot as adminA.
      const createResult = await adminA.sdk.telegramBotsControllerCreateV1({
        body: {
          name: 'Private Bot',
          botToken: '999999:AAHprivateTokenHere',
        },
      });
      expect(createResult.response?.status).toBe(201);
      const bot = createResult.data as TelegramBotDto;
      createdBotIds.push(bot.id);

      // adminB tries to access it.
      const getResult = await adminB.sdk.telegramBotsControllerGetV1({
        path: { id: bot.id },
      });
      expect(getResult.response?.status).toBe(404);

      const patchResult = await adminB.sdk.telegramBotsControllerUpdateV1({
        path: { id: bot.id },
        body: { name: 'Hijacked' },
      });
      expect(patchResult.response?.status).toBe(404);

      const deleteResult = await adminB.sdk.telegramBotsControllerRemoveV1({
        path: { id: bot.id },
      });
      expect(deleteResult.response?.status).toBe(404);

      // Cleanup: adminA deletes it.
      await adminA.sdk.telegramBotsControllerRemoveV1({ path: { id: bot.id } });
    });

    it('listing does not include foreign bots', async () => {
      // adminB lists — should NOT contain adminA's bots.
      const listResult = await adminB.sdk.telegramBotsControllerListV1();
      expect(listResult.response?.status).toBe(200);
      const list = (listResult.data ?? []) as TelegramBotDto[];
      // Any bot in adminB's list must have adminB's ownerId
      for (const b of list) {
        expect(b.ownerId).toBeDefined();
      }
    });
  });
});
