import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ActivityHelper } from './utils/activity-helper.js';
import { unwrap } from './utils/api-result.js';

/**
 * Integration scenario: full user↔bot dialogue workflow.
 *
 * This test validates the complete interaction flow:
 * 1. User registers and sends a message
 * 2. Operator (admin) sees the message in the conversation list with unread count
 * 3. Operator reads the conversation (marks messages as read)
 * 4. Operator replies as bot
 * 5. User sees the bot reply in their history
 */
describe('Integration: User ↔ Bot dialogue (e2e, running backend)', () => {
  const user = new ActivityHelper();
  const admin = new ActivityHelper();

  let userId: string;
  let userApiKey: string;

  beforeAll(async () => {
    await user.ensureBackendRunning();
    admin.loginAsAdmin();
  });

  afterAll(async () => {
    if (userId) {
      admin.loginAsAdmin();
      await admin.removeAccountAsAdmin(userId);
    }
  });

  it('completes a full dialogue workflow', async () => {
    // Step 1: Register a user
    const registered = await user.registerAccount(
      `test_${user.randomSha7}_integration@example.com`,
    );
    userId = registered.user.id;
    userApiKey = registered.apiKey.key;
    user.loginByApiKey(userApiKey);

    // Step 2: User sends a message
    const userMessage = unwrap(
      await user.sdk.chatControllerSendMessageV1({
        body: { content: 'Hello, bot! I have a question.' },
      }),
      'POST /chat/messages (user sends)',
    );

    expect(userMessage.id).toBeDefined();
    expect(userMessage.content).toBe('Hello, bot! I have a question.');
    expect(userMessage.senderRole).toBe('USER');

    // Step 3: Admin (operator) sees the conversation in the list
    admin.loginAsAdmin();
    const conversations = unwrap(
      await admin.sdk.mockBotControllerListConversationsV1({}),
      'GET /mock-bot/conversations',
    );

    const userConv = conversations.find((c) => c.userId === userId);
    expect(userConv).toBeDefined();
    expect(userConv!.lastMessage).toContain('Hello, bot!');
    expect(userConv!.unreadCount).toBeGreaterThanOrEqual(1);

    // Step 4: Admin reads the conversation (marks messages as read)
    const messages = unwrap(
      await admin.sdk.mockBotControllerGetConversationMessagesV1({
        path: { userId },
      }),
      'GET /mock-bot/conversations/:userId/messages',
    );

    expect(messages.length).toBeGreaterThanOrEqual(1);
    expect(messages[0].content).toBe('Hello, bot! I have a question.');

    // Verify unread count is now 0
    const conversationsAfterRead = unwrap(
      await admin.sdk.mockBotControllerListConversationsV1({}),
      'GET /mock-bot/conversations (after read)',
    );
    const userConvAfterRead = conversationsAfterRead.find(
      (c) => c.userId === userId,
    );
    expect(userConvAfterRead!.unreadCount).toBe(0);

    // Step 5: Admin replies as bot
    const botReply = unwrap(
      await admin.sdk.mockBotControllerReplyAsBotV1({
        path: { userId },
        body: { content: 'Hello! How can I help you today?' },
      }),
      'POST /mock-bot/conversations/:userId/messages (bot replies)',
    );

    expect(botReply.id).toBeDefined();
    expect(botReply.content).toBe('Hello! How can I help you today?');
    expect(botReply.senderRole).toBe('BOT');

    // Step 6: User sees the bot reply in their history
    user.loginByApiKey(userApiKey);
    const userHistory = unwrap(
      await user.sdk.chatControllerGetMessagesV1({}),
      'GET /chat/messages (user history)',
    );

    expect(userHistory.length).toBeGreaterThanOrEqual(2);

    const botMessage = userHistory.find((m) => m.senderRole === 'BOT');
    expect(botMessage).toBeDefined();
    expect(botMessage!.content).toBe('Hello! How can I help you today?');

    // Step 7: User sends another message
    const userFollowUp = unwrap(
      await user.sdk.chatControllerSendMessageV1({
        body: { content: 'What is the weather today?' },
      }),
      'POST /chat/messages (user follow-up)',
    );

    expect(userFollowUp.content).toBe('What is the weather today?');

    // Step 8: Admin sees the new message in the conversation
    admin.loginAsAdmin();
    const adminHistory = unwrap(
      await admin.sdk.mockBotControllerGetConversationMessagesV1({
        path: { userId },
      }),
      'GET /mock-bot/conversations/:userId/messages (admin view)',
    );

    expect(adminHistory.length).toBeGreaterThanOrEqual(3);
    const lastUserMessage = adminHistory
      .filter((m) => m.senderRole === 'USER')
      .pop();
    expect(lastUserMessage).toBeDefined();
    expect(lastUserMessage!.content).toBe('What is the weather today?');
  });

  it('maintains conversation isolation between users', async () => {
    // Register two users
    const user1 = await user.registerAccount(
      `test_${user.randomSha7}_iso1@example.com`,
    );
    const user2 = await user.registerAccount(
      `test_${user.randomSha7}_iso2@example.com`,
    );

    try {
      // User 1 sends a message
      user.loginByApiKey(user1.apiKey.key);
      await user.sdk.chatControllerSendMessageV1({
        body: { content: 'Message from user 1' },
      });

      // User 2 sends a message
      user.loginByApiKey(user2.apiKey.key);
      await user.sdk.chatControllerSendMessageV1({
        body: { content: 'Message from user 2' },
      });

      // Check user 1 history
      user.loginByApiKey(user1.apiKey.key);
      const history1 = unwrap(
        await user.sdk.chatControllerGetMessagesV1({}),
        'GET /chat/messages for user 1',
      );

      expect(history1.length).toBe(1);
      expect(history1[0].content).toBe('Message from user 1');

      // Check user 2 history
      user.loginByApiKey(user2.apiKey.key);
      const history2 = unwrap(
        await user.sdk.chatControllerGetMessagesV1({}),
        'GET /chat/messages for user 2',
      );

      expect(history2.length).toBe(1);
      expect(history2[0].content).toBe('Message from user 2');

      // Admin sees both conversations
      admin.loginAsAdmin();
      const conversations = unwrap(
        await admin.sdk.mockBotControllerListConversationsV1({}),
        'GET /mock-bot/conversations',
      );

      const conv1 = conversations.find((c) => c.userId === user1.user.id);
      const conv2 = conversations.find((c) => c.userId === user2.user.id);

      expect(conv1).toBeDefined();
      expect(conv2).toBeDefined();
      expect(conv1!.lastMessage).toContain('Message from user 1');
      expect(conv2!.lastMessage).toContain('Message from user 2');
    } finally {
      // Cleanup
      admin.loginAsAdmin();
      await admin.removeAccountAsAdmin(user1.user.id);
      await admin.removeAccountAsAdmin(user2.user.id);
    }
  });
});
