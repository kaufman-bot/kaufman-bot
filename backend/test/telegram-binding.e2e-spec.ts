import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { TelegramBotDto } from './generated/client/types.gen.js';
import { ActivityHelper } from './utils/activity-helper.js';
import { messageOf } from './utils/api-result.js';

/**
 * E2E over target assignment, launch deep-link, and the 409 transport gate.
 *
 * Verifies:
 *   - PUT /admin/users/:id/telegram-target (200 own bot, 404 foreign/missing);
 *   - POST /telegram/launch (returns url+token for bot target, 400 for mock);
 *   - POST /chat/messages → 409 when bound bot is disabled, 201 when active.
 *
 * All mutating calls run behind test-spawned ADMIN keys (e2e-fixture-hygiene).
 */
describe('Telegram binding & transport gate (e2e, running backend)', () => {
  /** Seeded ADMIN — only for register / promote / remove. */
  const admin = new ActivityHelper();
  /** Test-owned ADMIN — creates bots, assigns targets. */
  const adminA = new ActivityHelper();
  /** Second test-owned ADMIN — proves cross-owner isolation. */
  const adminB = new ActivityHelper();
  /** Plain user — used for launch and chat gate tests. */
  const user1 = new ActivityHelper();

  const createdUsers: string[] = [];
  const createdBotIds: string[] = [];

  let botAId: string; // adminA's bot
  let botBId: string; // adminB's bot
  let user1Id: string;

  async function spawnAdmin(tag: string): Promise<string> {
    const reg = await admin.registerAccount(
      `test_${admin.randomSha7}_${tag}@example.com`,
    );
    createdUsers.push(reg.user.id);
    await admin.sdk.adminUsersControllerUpdateV1({
      path: { id: reg.user.id },
      body: { role: 'ADMIN' },
    });
    return reg.apiKey.key;
  }

  beforeAll(async () => {
    await admin.ensureBackendRunning();
    admin.loginAsAdmin();

    const keyA = await spawnAdmin('bind-admin-a');
    adminA.loginByApiKey(keyA);
    const keyB = await spawnAdmin('bind-admin-b');
    adminB.loginByApiKey(keyB);

    // Plain USER for target/launch/gate tests.
    const reg = await admin.registerAccount(
      `test_${admin.randomSha7}_bind-user@example.com`,
    );
    createdUsers.push(reg.user.id);
    user1Id = reg.user.id;
    user1.loginByApiKey(reg.apiKey.key);

    // Create bots owned by each admin.
    const botA = await adminA.sdk.telegramBotsControllerCreateV1({
      body: {
        name: 'Binding Test Bot A',
        botToken: '111111:AAHbindTestA',
        botUsername: 'bind_test_a_bot',
      },
    });
    botAId = (botA.data as TelegramBotDto).id;
    createdBotIds.push(botAId);

    const botB = await adminB.sdk.telegramBotsControllerCreateV1({
      body: {
        name: 'Binding Test Bot B',
        botToken: '222222:AAHbindTestB',
        botUsername: 'bind_test_b_bot',
      },
    });
    botBId = (botB.data as TelegramBotDto).id;
    createdBotIds.push(botBId);
  });

  afterAll(async () => {
    // Reset user target to mock before deleting (avoids FK issues).
    await adminA.sdk.adminUsersControllerSetTelegramTargetV1({
      path: { id: user1Id },
      body: { telegramBotId: null },
    });

    // Delete test bots.
    for (const id of createdBotIds) {
      await adminA.sdk.telegramBotsControllerRemoveV1({ path: { id } });
      await adminB.sdk.telegramBotsControllerRemoveV1({ path: { id } });
    }
    // Delete test-spawned user accounts.
    for (const id of createdUsers) {
      await admin.removeAccountAsAdmin(id);
    }
  });

  // ─── Target assignment ──────────────────────────────────────────────────────

  describe('PUT /admin/users/:id/telegram-target', () => {
    it('returns 200 when assigning own bot as target', async () => {
      const result = await adminA.sdk.adminUsersControllerSetTelegramTargetV1({
        path: { id: user1Id },
        body: { telegramBotId: botAId },
      });

      expect(result.response?.status).toBe(200);
    });

    it('returns 200 when resetting target to mock-server', async () => {
      const result = await adminA.sdk.adminUsersControllerSetTelegramTargetV1({
        path: { id: user1Id },
        body: { telegramBotId: null },
      });

      expect(result.response?.status).toBe(200);
    });

    it('returns 404 when bot belongs to a different admin', async () => {
      const result = await adminA.sdk.adminUsersControllerSetTelegramTargetV1({
        path: { id: user1Id },
        body: { telegramBotId: botBId },
      });

      expect(result.response?.status).toBe(404);
      expect(messageOf(result.error)).toMatch(/not found/i);
    });

    it('returns 404 for a nonexistent bot id', async () => {
      const result = await adminA.sdk.adminUsersControllerSetTelegramTargetV1({
        path: { id: user1Id },
        body: { telegramBotId: `missing-${adminA.randomSha7}` },
      });

      expect(result.response?.status).toBe(404);
      expect(messageOf(result.error)).toMatch(/not found/i);
    });

    it('returns 403 for a non-ADMIN caller', async () => {
      const result = await user1.sdk.adminUsersControllerSetTelegramTargetV1({
        path: { id: user1Id },
        body: { telegramBotId: botAId },
      });

      expect(result.response?.status).toBe(403);
    });
  });

  // ─── Launch ─────────────────────────────────────────────────────────────────

  describe('POST /telegram/launch', () => {
    it('returns url and token when target is a bot', async () => {
      // Assign bot target first.
      await adminA.sdk.adminUsersControllerSetTelegramTargetV1({
        path: { id: user1Id },
        body: { telegramBotId: botAId },
      });

      const result = await user1.sdk.telegramLaunchControllerLaunchV1();

      expect(result.response?.status).toBe(201);
      expect(result.data?.url).toContain('t.me/bind_test_a_bot?start=');
      expect(result.data?.token).toBeDefined();
      expect(typeof result.data?.token).toBe('string');
    });

    it('returns 400 when target is mock-server', async () => {
      // Reset to mock.
      await adminA.sdk.adminUsersControllerSetTelegramTargetV1({
        path: { id: user1Id },
        body: { telegramBotId: null },
      });

      const result = await user1.sdk.telegramLaunchControllerLaunchV1();

      expect(result.response?.status).toBe(400);
      expect(messageOf(result.error)).toMatch(/mock-server/i);
    });
  });

  // ─── Transport gate (409) ───────────────────────────────────────────────────

  describe('POST /chat/messages — transport gate', () => {
    it('returns 409 when bound bot is disabled', async () => {
      // Assign and then disable the bot.
      await adminA.sdk.adminUsersControllerSetTelegramTargetV1({
        path: { id: user1Id },
        body: { telegramBotId: botAId },
      });
      await adminA.sdk.telegramBotsControllerUpdateV1({
        path: { id: botAId },
        body: { isActive: false },
      });

      const result = await user1.sdk.chatControllerSendMessageV1({
        body: { content: 'should be blocked' },
      });

      expect(result.response?.status).toBe(409);
      expect(messageOf(result.error)).toMatch(/disabled/i);

      // Re-enable for subsequent tests.
      await adminA.sdk.telegramBotsControllerUpdateV1({
        path: { id: botAId },
        body: { isActive: true },
      });
    });

    it('returns 201 when bound bot is active', async () => {
      // Ensure bot is active and target is assigned.
      await adminA.sdk.telegramBotsControllerUpdateV1({
        path: { id: botAId },
        body: { isActive: true },
      });
      await adminA.sdk.adminUsersControllerSetTelegramTargetV1({
        path: { id: user1Id },
        body: { telegramBotId: botAId },
      });

      const result = await user1.sdk.chatControllerSendMessageV1({
        body: { content: `active-bot-${user1.randomSha7}` },
      });

      expect(result.response?.status).toBe(201);
      expect(result.data?.content).toContain('active-bot-');
    });

    it('returns 201 when target is mock-server (no gate)', async () => {
      await adminA.sdk.adminUsersControllerSetTelegramTargetV1({
        path: { id: user1Id },
        body: { telegramBotId: null },
      });

      const result = await user1.sdk.chatControllerSendMessageV1({
        body: { content: `mock-target-${user1.randomSha7}` },
      });

      expect(result.response?.status).toBe(201);
    });
  });
});
