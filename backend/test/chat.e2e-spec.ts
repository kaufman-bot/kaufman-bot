import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ChatMessageDto } from './generated/client/types.gen.js';
import { ActivityHelper } from './utils/activity-helper.js';
import { messageOf, unwrap } from './utils/api-result.js';

describe('Chat endpoints (e2e, running backend)', () => {
  const user1 = new ActivityHelper();
  const user2 = new ActivityHelper();
  const admin = new ActivityHelper();

  const createdUsers: string[] = [];

  beforeAll(async () => {
    await user1.ensureBackendRunning();
    admin.loginAsAdmin();
  });

  afterAll(async () => {
    for (const id of createdUsers) {
      await admin.removeAccountAsAdmin(id);
    }
  });

  describe('GET /api/v1/chat/messages', () => {
    it('returns an empty array for a user with no conversation yet', async () => {
      const registered = await user1.registerAccount(
        `test_${user1.randomSha7}_empty@example.com`,
      );
      createdUsers.push(registered.user.id);
      user1.loginByApiKey(registered.apiKey.key);

      const result = await user1.sdk.chatControllerGetMessagesV1({});

      expect(result.response?.status).toBe(200);
      expect(result.data).toEqual([]);
    });

    it('returns 401 without an API key', async () => {
      user1.logout();
      const result = await user1.sdk.chatControllerGetMessagesV1({});

      expect(result.response?.status).toBe(401);
      expect(messageOf(result.error)).toMatch(/API key is required/i);
    });
  });

  describe('POST /api/v1/chat/messages', () => {
    it('creates a message and returns it with 201', async () => {
      const registered = await user1.registerAccount(
        `test_${user1.randomSha7}_send@example.com`,
      );
      createdUsers.push(registered.user.id);
      user1.loginByApiKey(registered.apiKey.key);

      const result = await user1.sdk.chatControllerSendMessageV1({
        body: { content: 'Hello, bot!' },
      });

      expect(result.response?.status).toBe(201);
      const message = result.data as ChatMessageDto;
      expect(message.id).toBeDefined();
      expect(message.content).toBe('Hello, bot!');
      expect(message.senderRole).toBe('USER');
      expect(message.conversationId).toBeDefined();
    });

    it('adds the message to the conversation history', async () => {
      const registered = await user1.registerAccount(
        `test_${user1.randomSha7}_history@example.com`,
      );
      createdUsers.push(registered.user.id);
      user1.loginByApiKey(registered.apiKey.key);

      await user1.sdk.chatControllerSendMessageV1({
        body: { content: 'First message' },
      });
      await user1.sdk.chatControllerSendMessageV1({
        body: { content: 'Second message' },
      });

      const history = unwrap(
        await user1.sdk.chatControllerGetMessagesV1({}),
        'GET /chat/messages',
      );

      expect(history).toHaveLength(2);
      expect(history[0].content).toBe('First message');
      expect(history[1].content).toBe('Second message');
    });

    it('rejects empty content with 400', async () => {
      const registered = await user1.registerAccount(
        `test_${user1.randomSha7}_empty_content@example.com`,
      );
      createdUsers.push(registered.user.id);
      user1.loginByApiKey(registered.apiKey.key);

      const result = await user1.sdk.chatControllerSendMessageV1({
        body: { content: '' },
      });

      expect(result.response?.status).toBe(400);
      expect(messageOf(result.error)).toMatch(/cannot be empty/i);
    });

    it('rejects whitespace-only content with 400', async () => {
      const registered = await user1.registerAccount(
        `test_${user1.randomSha7}_whitespace@example.com`,
      );
      createdUsers.push(registered.user.id);
      user1.loginByApiKey(registered.apiKey.key);

      const result = await user1.sdk.chatControllerSendMessageV1({
        body: { content: '   ' },
      });

      expect(result.response?.status).toBe(400);
      expect(messageOf(result.error)).toMatch(/cannot be empty/i);
    });

    it('rejects content exceeding 4000 characters with 400', async () => {
      const registered = await user1.registerAccount(
        `test_${user1.randomSha7}_long@example.com`,
      );
      createdUsers.push(registered.user.id);
      user1.loginByApiKey(registered.apiKey.key);

      const result = await user1.sdk.chatControllerSendMessageV1({
        body: { content: 'a'.repeat(4001) },
      });

      expect(result.response?.status).toBe(400);
      expect(messageOf(result.error)).toMatch(/exceeds maximum length/i);
    });

    it('returns 401 without an API key', async () => {
      user1.logout();
      const result = await user1.sdk.chatControllerSendMessageV1({
        body: { content: 'Test' },
      });

      expect(result.response?.status).toBe(401);
      expect(messageOf(result.error)).toMatch(/API key is required/i);
    });
  });

  describe('Conversation isolation', () => {
    it('user A history does not contain messages from user B', async () => {
      // Register user A
      const userA = await user1.registerAccount(
        `test_${user1.randomSha7}_userA@example.com`,
      );
      createdUsers.push(userA.user.id);
      user1.loginByApiKey(userA.apiKey.key);

      // User A sends a message
      await user1.sdk.chatControllerSendMessageV1({
        body: { content: 'Message from user A' },
      });

      // Register user B
      const userB = await user2.registerAccount(
        `test_${user2.randomSha7}_userB@example.com`,
      );
      createdUsers.push(userB.user.id);
      user2.loginByApiKey(userB.apiKey.key);

      // User B sends a message
      await user2.sdk.chatControllerSendMessageV1({
        body: { content: 'Message from user B' },
      });

      // User A history should only contain user A's message
      user1.loginByApiKey(userA.apiKey.key);
      const historyA = unwrap(
        await user1.sdk.chatControllerGetMessagesV1({}),
        'GET /chat/messages for user A',
      );

      expect(historyA).toHaveLength(1);
      expect(historyA[0].content).toBe('Message from user A');

      // User B history should only contain user B's message
      user2.loginByApiKey(userB.apiKey.key);
      const historyB = unwrap(
        await user2.sdk.chatControllerGetMessagesV1({}),
        'GET /chat/messages for user B',
      );

      expect(historyB).toHaveLength(1);
      expect(historyB[0].content).toBe('Message from user B');
    });
  });
});
