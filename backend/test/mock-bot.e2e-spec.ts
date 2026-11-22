import { lastValueFrom, take, toArray } from 'rxjs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type {
  ChatControllerStreamEventsV1Data,
  ChatMessageDto,
  ChatStreamEventDto,
  ConversationSummaryDto,
} from './generated/client/types.gen.js';
import { ActivityHelper } from './utils/activity-helper.js';
import { messageOf, unwrap } from './utils/api-result.js';

/** Chat SSE endpoint (authenticated with the presented key like REST). */
const CHAT_STREAM_URL: ChatControllerStreamEventsV1Data['url'] =
  '/api/v1/chat/stream';

/** Lets an SSE subscription reach the server before events are triggered. */
const sleep = (ms: number): Promise<void> =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

describe('Mock Bot Console endpoints (e2e, running backend)', () => {
  const admin = new ActivityHelper();
  const user1 = new ActivityHelper();
  const user2 = new ActivityHelper();

  const createdUsers: string[] = [];
  let user1Id: string;
  let user2Id: string;
  let adminEmail: string;

  beforeAll(async () => {
    await admin.ensureBackendRunning();
    admin.loginAsAdmin();
    adminEmail = unwrap(
      await admin.sdk.authControllerMeV1(),
      'GET /auth/me (admin)',
    ).user.email;

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
      // Both test users write from the web chat.
      expect(conv1!.lastMessageChannel).toBe('WEB');
      expect(conv2!.lastMessageChannel).toBe('WEB');
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
      // Console reply: signed by the admin who sent it, delivered to the
      // mock (web-only) target of an unbound test user.
      expect(message.channel).toBe('WEB');
      expect(message.botName).toBeNull();
      expect(message.operatorEmail).toBe(adminEmail);
    });

    it('rejects empty content with 400', async () => {
      const result = await admin.sdk.mockBotControllerReplyAsBotV1({
        path: { userId: user1Id },
        body: { content: '' },
      });

      expect(result.response?.status).toBe(400);
      expect(messageOf(result.error)).toMatch(
        /must contain text or at least one button/i,
      );
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
      expect(botMessage!.channel).toBe('WEB');
      expect(botMessage!.operatorEmail).toBe(adminEmail);
    });

    describe('with inline keyboard buttons', () => {
      it('persists text + buttons and preserves the caller order', async () => {
        const result = await admin.sdk.mockBotControllerReplyAsBotV1({
          path: { userId: user1Id },
          body: {
            content: 'Please choose',
            buttons: [
              { title: 'Yes', callbackData: 'yes' },
              { title: 'No', callbackData: 'no' },
              { title: 'Maybe', callbackData: 'maybe' },
            ],
          },
        });

        expect(result.response?.status).toBe(201);
        const message = result.data as ChatMessageDto;
        expect(message.content).toBe('Please choose');
        expect(message.buttons).toEqual([
          { title: 'Yes', callbackData: 'yes' },
          { title: 'No', callbackData: 'no' },
          { title: 'Maybe', callbackData: 'maybe' },
        ]);

        // History must expose the same buttons on the same row.
        const history =
          await admin.sdk.mockBotControllerGetConversationMessagesV1({
            path: { userId: user1Id },
          });
        const inHistory = (history.data as ChatMessageDto[]).find(
          (m) => m.id === message.id,
        );
        expect(inHistory).toBeDefined();
        expect(inHistory!.buttons).toEqual(message.buttons);
      });

      it('accepts a buttons-only reply (content omitted)', async () => {
        const result = await admin.sdk.mockBotControllerReplyAsBotV1({
          path: { userId: user1Id },
          body: {
            buttons: [{ title: 'Confirm', callbackData: 'confirm' }],
          },
        });

        expect(result.response?.status).toBe(201);
        const message = result.data as ChatMessageDto;
        expect(message.content).toBe('');
        expect(message.buttons).toEqual([
          { title: 'Confirm', callbackData: 'confirm' },
        ]);
      });

      it('rejects a reply with neither text nor buttons (400)', async () => {
        const result = await admin.sdk.mockBotControllerReplyAsBotV1({
          path: { userId: user1Id },
          body: { content: '   ', buttons: [] },
        });

        expect(result.response?.status).toBe(400);
        expect(messageOf(result.error)).toMatch(
          /must contain text or at least one button/i,
        );
      });

      it('rejects invalid buttons (blank callbackData) with 400', async () => {
        const result = await admin.sdk.mockBotControllerReplyAsBotV1({
          path: { userId: user1Id },
          body: {
            content: 'hi',
            buttons: [{ title: 'Ok', callbackData: '   ' }],
          },
        });

        expect(result.response?.status).toBe(400);
        expect(messageOf(result.error)).toMatch(/callbackData/i);
      });

      it('rejects too many buttons (13) with 400', async () => {
        const buttons = Array.from({ length: 13 }, (_, i) => ({
          title: `b${i}`,
          callbackData: `cb-${i}`,
        }));
        const result = await admin.sdk.mockBotControllerReplyAsBotV1({
          path: { userId: user1Id },
          body: { content: 'too many', buttons },
        });

        expect(result.response?.status).toBe(400);
        expect(messageOf(result.error)).toMatch(/too many buttons/i);
      });
    });

    describe('with a reply target (replyToMessageId)', () => {
      let userQuestionId: string;
      let botReplyId: string;

      beforeAll(async () => {
        // A fresh USER message from user 1 becomes the quote target; a plain
        // bot reply doubles as the forbidden BOT target.
        user1.loginByApiKey(user1.currentApiKey!);
        userQuestionId = unwrap(
          await user1.sdk.chatControllerSendMessageV1({
            body: { content: 'Question about the order' },
          }),
          'POST /chat/messages (quote target)',
        ).id;
        admin.loginAsAdmin();
        botReplyId = unwrap(
          await admin.sdk.mockBotControllerReplyAsBotV1({
            path: { userId: user1Id },
            body: { content: 'Plain bot reply' },
          }),
          'POST /mock-bot/conversations/:userId/messages (plain)',
        ).id;
      });

      it('creates a quoted reply (201) with the relation, snapshot and deliveredTo in history', async () => {
        const result = await admin.sdk.mockBotControllerReplyAsBotV1({
          path: { userId: user1Id },
          body: {
            content: 'The order is confirmed',
            replyToMessageId: userQuestionId,
          },
        });

        expect(result.response?.status).toBe(201);
        const message = result.data as ChatMessageDto;
        expect(message.replyTo).toEqual({
          id: userQuestionId,
          senderRole: 'USER',
          content: 'Question about the order',
        });
        // Unbound test user writing from the web: the reply stays web-only.
        expect(message.channel).toBe('WEB');
        expect(message.deliveredTo).toEqual(['WEB']);

        const history =
          await admin.sdk.mockBotControllerGetConversationMessagesV1({
            path: { userId: user1Id },
          });
        const inHistory = (history.data as ChatMessageDto[]).find(
          (m) => m.id === message.id,
        );
        expect(inHistory).toBeDefined();
        expect(inHistory!.replyTo).toEqual(message.replyTo);
        expect(inHistory!.deliveredTo).toEqual(['WEB']);
      });

      it('delivers the quoted reply over the chat SSE stream with the quote', async () => {
        user1.loginByApiKey(user1.currentApiKey!);
        const eventsPromise = lastValueFrom(
          user1
            .sse<ChatStreamEventDto>({ url: CHAT_STREAM_URL })
            .pipe(take(2), toArray()),
        );
        // The event bus is hot: let the subscription reach the server first.
        await sleep(500);

        const sent = unwrap(
          await user1.sdk.chatControllerSendMessageV1({
            body: { content: 'Second question via SSE' },
          }),
          'POST /chat/messages (sse quote)',
        );
        const reply = await admin.sdk.mockBotControllerReplyAsBotV1({
          path: { userId: user1Id },
          body: { content: 'Answer via SSE', replyToMessageId: sent.id },
        });
        expect(reply.response?.status).toBe(201);

        const events = await eventsPromise;
        expect(events.map((e) => `${e.senderRole}:${e.content}`)).toEqual([
          'USER:Second question via SSE',
          'BOT:Answer via SSE',
        ]);
        expect(events[1].replyTo).toEqual({
          id: sent.id,
          senderRole: 'USER',
          content: 'Second question via SSE',
        });
        expect(events[1].deliveredTo).toEqual(['WEB']);
        admin.loginAsAdmin();
      });

      it('rejects a nonexistent target with 400', async () => {
        const result = await admin.sdk.mockBotControllerReplyAsBotV1({
          path: { userId: user1Id },
          body: {
            content: 'nope',
            replyToMessageId: `missing-${admin.randomSha7}`,
          },
        });

        expect(result.response?.status).toBe(400);
        expect(messageOf(result.error)).toMatch(
          /must be an existing USER message of this conversation/i,
        );
      });

      it('rejects a target from another conversation with 400', async () => {
        user2.loginByApiKey(user2.currentApiKey!);
        const foreign = unwrap(
          await user2.sdk.chatControllerSendMessageV1({
            body: { content: 'Foreign conversation message' },
          }),
          'POST /chat/messages (foreign target)',
        );
        admin.loginAsAdmin();

        const result = await admin.sdk.mockBotControllerReplyAsBotV1({
          path: { userId: user1Id },
          body: { content: 'nope', replyToMessageId: foreign.id },
        });

        expect(result.response?.status).toBe(400);
        expect(messageOf(result.error)).toMatch(
          /must be an existing USER message of this conversation/i,
        );
      });

      it('rejects a BOT message as the target with 400', async () => {
        const result = await admin.sdk.mockBotControllerReplyAsBotV1({
          path: { userId: user1Id },
          body: { content: 'nope', replyToMessageId: botReplyId },
        });

        expect(result.response?.status).toBe(400);
        expect(messageOf(result.error)).toMatch(
          /must be an existing USER message of this conversation/i,
        );
      });
    });
  });
});
