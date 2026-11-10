import { Subject } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TelegramSender } from '../interfaces/telegram-sender.interface.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { ChatEvent, ChatEventsService } from './chat-events.service.js';
import type { ChatService } from './chat.service.js';
import type { TelegramBindingService } from './telegram-binding.service.js';
import { TelegramBridgeService } from './telegram-bridge.service.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const makePrismaMock = () => ({
  conversation: {
    findUnique: vi.fn(),
  },
  telegramBot: {
    findUnique: vi.fn(),
  },
  user: {
    findFirst: vi.fn(),
  },
});

const makeSenderMock = (): TelegramSender => ({
  sendMessage: vi.fn().mockResolvedValue(undefined),
  answerCallbackQuery: vi.fn().mockResolvedValue(undefined),
});

const makeChatEvent = (overrides: Partial<ChatEvent> = {}): ChatEvent => ({
  conversationId: 'conv-1',
  messageId: 'msg-1',
  senderRole: 'BOT',
  content: 'Hello from bot',
  createdAt: new Date().toISOString(),
  kind: 'TEXT',
  buttons: null,
  ...overrides,
});

// ─── Test suite ───────────────────────────────────────────────────────────────

describe('TelegramBridgeService', () => {
  let prismaMock: ReturnType<typeof makePrismaMock>;
  let subject: Subject<ChatEvent>;
  let chatEventsMock: { streamAll: ReturnType<typeof vi.fn> };
  let chatServiceMock: {
    sendMessage: ReturnType<typeof vi.fn>;
    submitButtonCallback: ReturnType<typeof vi.fn>;
  };
  let bindingMock: { consumeToken: ReturnType<typeof vi.fn> };
  let senderMock: TelegramSender;
  let service: TelegramBridgeService;

  beforeEach(() => {
    prismaMock = makePrismaMock();
    subject = new Subject<ChatEvent>();
    chatEventsMock = { streamAll: vi.fn(() => subject.asObservable()) };
    chatServiceMock = {
      sendMessage: vi.fn().mockResolvedValue({ id: 'msg-x' }),
      submitButtonCallback: vi.fn().mockResolvedValue({ id: 'msg-y' }),
    };
    bindingMock = { consumeToken: vi.fn().mockResolvedValue(true) };
    senderMock = makeSenderMock();

    service = new TelegramBridgeService(
      prismaMock as unknown as PrismaService,
      chatEventsMock as unknown as ChatEventsService,
      chatServiceMock as unknown as ChatService,
      bindingMock as unknown as TelegramBindingService,
    );

    // Spy on createSender to avoid real grammy instantiation.
    vi.spyOn(service as any, 'createSender').mockReturnValue(senderMock);

    // Trigger bootstrap to set up the outgoing subscription.
    service.onApplicationBootstrap();
  });

  // ─── Outgoing ─────────────────────────────────────────────────────────────

  describe('outgoing (BOT → Telegram)', () => {
    beforeEach(() => {
      prismaMock.conversation.findUnique.mockResolvedValue({
        user: { id: 'user-1', telegramBotId: 'bot-1', telegramChatId: '999' },
      });
      prismaMock.telegramBot.findUnique.mockResolvedValue({
        id: 'bot-1',
        isActive: true,
        botToken: 'fake-token',
      });
    });

    it('forwards BOT message to Telegram when user is bound and bot is active', async () => {
      subject.next(makeChatEvent({ content: 'Hi there' }));
      // Allow microtask to resolve.
      await new Promise((r) => setImmediate(r));

      expect(senderMock.sendMessage).toHaveBeenCalledWith(
        '999',
        'Hi there',
        undefined,
      );
    });

    it('does NOT forward when telegramBotId is null (mock target)', async () => {
      prismaMock.conversation.findUnique.mockResolvedValue({
        user: { id: 'user-1', telegramBotId: null, telegramChatId: null },
      });

      subject.next(makeChatEvent());
      await new Promise((r) => setImmediate(r));

      expect(senderMock.sendMessage).not.toHaveBeenCalled();
    });

    it('does NOT forward when bot is inactive', async () => {
      prismaMock.telegramBot.findUnique.mockResolvedValue({
        id: 'bot-1',
        isActive: false,
        botToken: 'fake-token',
      });

      subject.next(makeChatEvent());
      await new Promise((r) => setImmediate(r));

      expect(senderMock.sendMessage).not.toHaveBeenCalled();
    });

    it('does NOT forward when telegramChatId is empty', async () => {
      prismaMock.conversation.findUnique.mockResolvedValue({
        user: { id: 'user-1', telegramBotId: 'bot-1', telegramChatId: null },
      });

      subject.next(makeChatEvent());
      await new Promise((r) => setImmediate(r));

      expect(senderMock.sendMessage).not.toHaveBeenCalled();
    });

    it('does NOT forward USER messages (only BOT)', async () => {
      subject.next(makeChatEvent({ senderRole: 'USER' }));
      await new Promise((r) => setImmediate(r));

      expect(senderMock.sendMessage).not.toHaveBeenCalled();
    });

    it('filters out buttons with callbackData exceeding 64 bytes', async () => {
      const shortBtn = { title: 'OK', callbackData: 'short' };
      const longBtn = { title: 'Long', callbackData: 'x'.repeat(65) };

      prismaMock.conversation.findUnique.mockResolvedValue({
        user: { id: 'user-1', telegramBotId: 'bot-1', telegramChatId: '999' },
      });

      subject.next(makeChatEvent({ buttons: [shortBtn, longBtn] }));
      await new Promise((r) => setImmediate(r));

      expect(senderMock.sendMessage).toHaveBeenCalledWith(
        '999',
        'Hello from bot',
        [shortBtn],
      );
    });

    it('sends without keyboard when all buttons exceed 64 bytes', async () => {
      const longBtn = { title: 'Long', callbackData: 'x'.repeat(65) };

      prismaMock.conversation.findUnique.mockResolvedValue({
        user: { id: 'user-1', telegramBotId: 'bot-1', telegramChatId: '999' },
      });

      subject.next(makeChatEvent({ buttons: [longBtn] }));
      await new Promise((r) => setImmediate(r));

      // Empty array after filter → undefined passed (falsy length check).
      expect(senderMock.sendMessage).toHaveBeenCalledWith(
        '999',
        'Hello from bot',
        undefined,
      );
    });
  });

  // ─── Incoming ─────────────────────────────────────────────────────────────

  describe('incoming (Telegram → internal)', () => {
    const validSecret = 'webhook-secret-abc';

    beforeEach(() => {
      prismaMock.telegramBot.findUnique.mockResolvedValue({
        id: 'bot-1',
        webhookSecret: validSecret,
        isActive: true,
        botToken: 'fake-token',
      });
    });

    it('returns false when secret does not match', async () => {
      const result = await service.handleUpdate(
        'bot-1',
        { message: { text: 'hi', chat: { id: 1 } } } as any,
        'wrong',
      );
      expect(result).toBe(false);
    });

    it('returns false when bot not found', async () => {
      prismaMock.telegramBot.findUnique.mockResolvedValue(null);
      const result = await service.handleUpdate(
        'missing',
        {} as any,
        validSecret,
      );
      expect(result).toBe(false);
    });

    it('ignores update when bot is inactive', async () => {
      prismaMock.telegramBot.findUnique.mockResolvedValue({
        id: 'bot-1',
        webhookSecret: validSecret,
        isActive: false,
        botToken: 'fake-token',
      });

      const result = await service.handleUpdate(
        'bot-1',
        { message: { text: 'hello', chat: { id: 123 } } } as any,
        validSecret,
      );
      expect(result).toBe(true); // handled (by ignoring)
      expect(chatServiceMock.sendMessage).not.toHaveBeenCalled();
    });

    describe('/start <token>', () => {
      it('consumes the binding token and replies', async () => {
        const update = {
          message: { text: '/start abc123', chat: { id: 500 } },
        } as any;

        await service.handleUpdate('bot-1', update, validSecret);

        expect(bindingMock.consumeToken).toHaveBeenCalledWith('abc123', '500');
        expect(senderMock.sendMessage).toHaveBeenCalledWith(
          '500',
          '✅ Chat linked successfully!',
        );
      });

      it('replies with error message when token is invalid', async () => {
        bindingMock.consumeToken.mockResolvedValue(false);
        const update = {
          message: { text: '/start expired-token', chat: { id: 600 } },
        } as any;

        await service.handleUpdate('bot-1', update, validSecret);

        expect(senderMock.sendMessage).toHaveBeenCalledWith(
          '600',
          '⚠️ Invalid or expired token.',
        );
      });
    });

    describe('text message from bound user', () => {
      const mockUser = {
        id: 'user-1',
        telegramBotId: 'bot-1',
        telegramChatId: '12345',
      };

      beforeEach(() => {
        prismaMock.user.findFirst.mockResolvedValue(mockUser);
      });

      it('delegates to ChatService.sendMessage', async () => {
        const update = {
          message: { text: 'hello world', chat: { id: 12345 } },
        } as any;

        await service.handleUpdate('bot-1', update, validSecret);

        expect(chatServiceMock.sendMessage).toHaveBeenCalledWith(
          mockUser,
          'hello world',
        );
      });

      it('ignores message from unbound chatId', async () => {
        prismaMock.user.findFirst.mockResolvedValue(null);
        const update = {
          message: { text: 'orphan', chat: { id: 99999 } },
        } as any;

        await service.handleUpdate('bot-1', update, validSecret);

        expect(chatServiceMock.sendMessage).not.toHaveBeenCalled();
      });
    });

    describe('callback_query from bound user', () => {
      const mockUser = {
        id: 'user-1',
        telegramBotId: 'bot-1',
        telegramChatId: '12345',
      };

      beforeEach(() => {
        prismaMock.user.findFirst.mockResolvedValue(mockUser);
      });

      it('answers callback and delegates to submitButtonCallback', async () => {
        const update = {
          callback_query: {
            id: 'cq-1',
            data: 'settings:language:ru',
            message: { chat: { id: 12345 } },
            from: { id: 12345 },
          },
        } as any;

        await service.handleUpdate('bot-1', update, validSecret);

        expect(senderMock.answerCallbackQuery).toHaveBeenCalledWith('cq-1');
        expect(chatServiceMock.submitButtonCallback).toHaveBeenCalledWith(
          mockUser,
          {
            callbackData: 'settings:language:ru',
          },
        );
      });

      it('ignores callback from unbound chatId', async () => {
        prismaMock.user.findFirst.mockResolvedValue(null);
        const update = {
          callback_query: {
            id: 'cq-2',
            data: 'ping',
            message: { chat: { id: 77777 } },
            from: { id: 77777 },
          },
        } as any;

        await service.handleUpdate('bot-1', update, validSecret);

        expect(chatServiceMock.submitButtonCallback).not.toHaveBeenCalled();
      });
    });
  });
});
