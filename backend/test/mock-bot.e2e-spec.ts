import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type {
  ChatMessageDto,
  ConversationSummaryDto,
} from './generated/client/types.gen.js';
import { ActivityHelper } from './utils/activity-helper.js';
import { messageOf } from './utils/api-result.js';

describe('Mock Bot Console endpoints (e2e, running backend)', () => {
  const admin = new ActivityHelper();
  const user1 = new ActivityHelper();
  const user2 = new ActivityHelper();

  const createdUsers: string[] = [];
  let user1Id: string;
  let user2Id: string;

  beforeAll(async () => {
    await admin.ensureBackendRunning();
    admin.loginAsAdmin();

    // Register two users and create conversations
    const reg1 = await user1.registerAccount(
      `test_${user1.randomSha7}_mockbot1@example.com`,
    );
    createdUsers.push(reg1.user.id);
    user1Id = reg1.user.id;
    user1.loginByApiKey(reg1.apiKey.key);

    // User 1 sends a message to create conversation
    await user1.sdk.chatControllerSendMessageV1({
      body: { content: 'Hello from user 1' },
    });

    const reg2 = await user2.registerAccount(
      `test_${user2.randomSha7}_mockbot2@example.com`,
    );
    createdUsers.push(reg2.user.id);
    user2Id = reg2.user.id;
    user2.loginByApiKey(reg2.apiKey.key);

    // User 2 sends a message to create conversation
    await user2.sdk.chatControllerSendMessageV1({
      body: { content: 'Hello from user 2' },
    });

    // Switch back to admin for mock-bot operations
    admin.loginAsAdmin();
  });

  afterAll(async () => {
    for (const id of createdUsers) {
      await admin.removeAccountAsAdmin(id);
    }
  });

  describe('Access control', () => {
    it('returns 401 without an API key', async () => {
      admin.logout();
      const result = await admin.sdk.mockBotControllerListConversationsV1({});

      expect(result.response?.status).toBe(401);
      expect(messageOf(result.error)).toMatch(/API key is required/i);
      admin.loginAsAdmin();
    });

    it('returns 403 for a USER API key', async () => {
      user1.loginByApiKey(user1.currentApiKey!);
      const result = await user1.sdk.mockBotControllerListConversationsV1({});

      expect(result.response?.status).toBe(403);
      expect(messageOf(result.error)).toMatch(/admin access required/i);
    });

    it('allows access with an ADMIN API key', async () => {
      admin.loginAsAdmin();
      const result = await admin.sdk.mockBotControllerListConversationsV1({});

      expect(result.response?.status).toBe(200);
    });
  });

  describe('GET /api/v1/mock-bot/conversations', () => {
    it('returns a list of conversations sorted by latest activity', async () => {
      const result = await admin.sdk.mockBotControllerListConversationsV1({});
      const conversations = result.data as ConversationSummaryDto[];

      expect(conversations.length).toBeGreaterThanOrEqual(2);

      // Find our test conversations
      const conv1 = conversations.find((c) => c.userId === user1Id);
      const conv2 = conversations.find((c) => c.userId === user2Id);

      expect(conv1).toBeDefined();
      expect(conv2).toBeDefined();

      // Both should have last message preview
      expect(conv1!.lastMessage).toBeDefined();
      expect(conv2!.lastMessage).toBeDefined();
    });

    it('includes unread count for each conversation', async () => {
      const result = await admin.sdk.mockBotControllerListConversationsV1({});
      const conversations = result.data as ConversationSummaryDto[];

      const conv1 = conversations.find((c) => c.userId === user1Id);
      expect(conv1).toBeDefined();
      expect(conv1!.unreadCount).toBeGreaterThanOrEqual(1);
    });
  });

  describe('GET /api/v1/mock-bot/conversations/:userId/messages', () => {
    it('returns 404 for a non-existent user', async () => {
      const result = await admin.sdk.mockBotControllerGetConversationMessagesV1(
        {
          path: { userId: 'non-existent-user-id' },
        },
      );

      expect(result.response?.status).toBe(404);
      expect(messageOf(result.error)).toMatch(/conversation not found/i);
    });

    it('returns messages for an existing conversation', async () => {
      const result = await admin.sdk.mockBotControllerGetConversationMessagesV1(
        {
          path: { userId: user1Id },
        },
      );

      expect(result.response?.status).toBe(200);
      const messages = result.data as ChatMessageDto[];
      expect(messages.length).toBeGreaterThanOrEqual(1);
      expect(messages[0].content).toBe('Hello from user 1');
    });

    it('marks user messages as read (unread count becomes 0)', async () => {
      // Send a new message from user 1 to ensure there's an unread message
      user1.loginByApiKey(user1.currentApiKey!);
      await user1.sdk.chatControllerSendMessageV1({
        body: { content: 'New message for unread test' },
      });
      admin.loginAsAdmin();

      // First, check unread count
      const before = await admin.sdk.mockBotControllerListConversationsV1({});
      const convBefore = (before.data as ConversationSummaryDto[]).find(
        (c) => c.userId === user1Id,
      );
      expect(convBefore!.unreadCount).toBeGreaterThanOrEqual(1);

      // Read the conversation
      await admin.sdk.mockBotControllerGetConversationMessagesV1({
        path: { userId: user1Id },
      });

      // Check unread count is now 0
      const after = await admin.sdk.mockBotControllerListConversationsV1({});
      const convAfter = (after.data as ConversationSummaryDto[]).find(
        (c) => c.userId === user1Id,
      );
      expect(convAfter!.unreadCount).toBe(0);
    });
  });

  describe('POST /api/v1/mock-bot/conversations/:userId/messages', () => {
    it('creates a bot reply and returns 201', async () => {
      const result = await admin.sdk.mockBotControllerReplyAsBotV1({
        path: { userId: user1Id },
        body: { content: 'Hello from bot!' },
      });

      expect(result.response?.status).toBe(201);
      const message = result.data as ChatMessageDto;
      expect(message.id).toBeDefined();
      expect(message.content).toBe('Hello from bot!');
      expect(message.senderRole).toBe('BOT');
    });

    it('rejects empty content with 400', async () => {
      const result = await admin.sdk.mockBotControllerReplyAsBotV1({
        path: { userId: user1Id },
        body: { content: '' },
      });

      expect(result.response?.status).toBe(400);
      expect(messageOf(result.error)).toMatch(/cannot be empty/i);
    });

    it('rejects content exceeding 4000 characters with 400', async () => {
      const result = await admin.sdk.mockBotControllerReplyAsBotV1({
        path: { userId: user1Id },
        body: { content: 'a'.repeat(4001) },
      });

      expect(result.response?.status).toBe(400);
      expect(messageOf(result.error)).toMatch(/exceeds maximum length/i);
    });

    it('adds the bot reply to the conversation history', async () => {
      // Send a bot reply
      await admin.sdk.mockBotControllerReplyAsBotV1({
        path: { userId: user2Id },
        body: { content: 'Bot reply for user 2' },
      });

      // Check history
      const result = await admin.sdk.mockBotControllerGetConversationMessagesV1(
        {
          path: { userId: user2Id },
        },
      );
      const messages = result.data as ChatMessageDto[];

      const botMessage = messages.find((m) => m.senderRole === 'BOT');
      expect(botMessage).toBeDefined();
      expect(botMessage!.content).toBe('Bot reply for user 2');
    });
  });
});
