import { BadRequestException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MockBotStreamEventDto } from '../dto/mock-bot.dto.js';
import { MessageKind, MessageSenderRole } from '../generated/prisma/enums.js';
import { ChatEventsService } from './chat-events.service.js';
import type { MessageChannelService } from './message-channel.service.js';
import { MockBotService } from './mock-bot.service.js';

const makePrismaMock = () => {
  const conversationFindMany = vi.fn();
  const conversationFindUnique = vi.fn();
  const conversationUpsert = vi.fn();
  const messageCount = vi.fn();
  const messageCreate = vi.fn();
  const messageUpdateMany = vi.fn();
  const messageFindUnique = vi.fn();
  const messageFindFirst = vi.fn();
  const userFindUnique = vi.fn();

  return {
    instance: {
      conversation: {
        findMany: conversationFindMany,
        findUnique: conversationFindUnique,
        upsert: conversationUpsert,
      },
      message: {
        count: messageCount,
        create: messageCreate,
        updateMany: messageUpdateMany,
        findUnique: messageFindUnique,
        findFirst: messageFindFirst,
      },
      user: { findUnique: userFindUnique },
    },
    conversationFindMany,
    conversationFindUnique,
    conversationUpsert,
    messageCount,
    messageCreate,
    messageUpdateMany,
    messageFindUnique,
    messageFindFirst,
    userFindUnique,
  };
};

const makeChatEventsMock = () => {
  const publish = vi.fn();
  const streamAll = vi.fn().mockReturnValue({ subscribe: vi.fn() });

  return {
    publish,
    streamAll,
    instance: {
      publish,
      streamAll,
    } as unknown as ChatEventsService,
  };
};

const makeMessageChannelMock = () => {
  const resolveDelivery = vi
    .fn()
    .mockResolvedValue({ channel: 'WEB', botName: null });
  return {
    resolveDelivery,
    instance: { resolveDelivery } as unknown as MessageChannelService,
  };
};

describe('MockBotService', () => {
  let prismaMock: ReturnType<typeof makePrismaMock>;
  let chatEventsMock: ReturnType<typeof makeChatEventsMock>;
  let messageChannelMock: ReturnType<typeof makeMessageChannelMock>;
  let service: MockBotService;

  beforeEach(() => {
    prismaMock = makePrismaMock();
    chatEventsMock = makeChatEventsMock();
    messageChannelMock = makeMessageChannelMock();
    prismaMock.userFindUnique.mockResolvedValue({
      telegramBotId: null,
      telegramChatId: null,
    });
    service = new MockBotService(
      prismaMock.instance as any,
      chatEventsMock.instance,
      messageChannelMock.instance,
    );
  });

  describe('listConversations', () => {
    it('should return empty array when no conversations exist', async () => {
      prismaMock.conversationFindMany.mockResolvedValue([]);

      const result = await service.listConversations();

      expect(result).toEqual([]);
    });

    it('should return conversations sorted by latest activity', async () => {
      const conversations = [
        {
          id: 'conv-1',
          userId: 'user-1',
          user: { id: 'user-1', email: 'user1@example.com' },
          messages: [
            {
              id: 'msg-1',
              content: 'Hello',
              senderRole: MessageSenderRole.USER,
              channel: 'TELEGRAM',
              createdAt: new Date('2024-01-02'),
            },
          ],
          createdAt: new Date('2024-01-01'),
          updatedAt: new Date('2024-01-02'),
        },
        {
          id: 'conv-2',
          userId: 'user-2',
          user: { id: 'user-2', email: 'user2@example.com' },
          messages: [
            {
              id: 'msg-2',
              content: 'Hi there',
              senderRole: MessageSenderRole.BOT,
              createdAt: new Date('2024-01-03'),
            },
          ],
          createdAt: new Date('2024-01-01'),
          updatedAt: new Date('2024-01-03'),
        },
      ];

      prismaMock.conversationFindMany.mockResolvedValue(conversations);
      prismaMock.messageCount.mockResolvedValue(0);

      const result = await service.listConversations();

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('conv-1');
      expect(result[0].lastMessageChannel).toBe('TELEGRAM');
      expect(result[1].id).toBe('conv-2');
      expect(result[1].lastMessageChannel).toBeNull();
    });

    it('should include unread count for each conversation', async () => {
      prismaMock.conversationFindMany.mockResolvedValue([
        {
          id: 'conv-1',
          userId: 'user-1',
          user: { id: 'user-1', email: 'user1@example.com' },
          messages: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);
      prismaMock.messageCount.mockResolvedValue(5);

      const result = await service.listConversations();

      expect(result[0].unreadCount).toBe(5);
    });
  });

  describe('getConversationMessages', () => {
    it('should throw NotFoundException when conversation does not exist', async () => {
      prismaMock.conversationFindUnique.mockResolvedValue(null);

      await expect(
        service.getConversationMessages('unknown-user'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should return messages ordered by createdAt ascending', async () => {
      const messages = [
        {
          id: 'msg-1',
          conversationId: 'conv-1',
          senderRole: MessageSenderRole.USER,
          kind: MessageKind.TEXT,
          content: 'First',
          buttons: null,
          channel: 'TELEGRAM',
          botName: 'Kaufman Bot',
          operatorEmail: null,
          readAt: null,
          createdAt: new Date('2024-01-01'),
        },
        {
          id: 'msg-2',
          conversationId: 'conv-1',
          senderRole: MessageSenderRole.BOT,
          kind: MessageKind.TEXT,
          content: 'Second',
          buttons: [{ title: 'Да', callbackData: 'yes' }],
          readAt: null,
          createdAt: new Date('2024-01-02'),
        },
      ];

      prismaMock.conversationFindUnique.mockResolvedValue({
        id: 'conv-1',
        userId: 'user-1',
        messages,
      });
      prismaMock.messageUpdateMany.mockResolvedValue({ count: 1 });

      const result = await service.getConversationMessages('user-1');

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('msg-1');
      expect(result[0].buttons).toBeNull();
      expect(result[0].channel).toBe('TELEGRAM');
      expect(result[0].botName).toBe('Kaufman Bot');
      expect(result[0].operatorEmail).toBeNull();
      expect(result[1].id).toBe('msg-2');
      expect(result[1].buttons).toEqual([{ title: 'Да', callbackData: 'yes' }]);
      expect(result[1].channel).toBeNull();
    });

    it('should mark user messages as read', async () => {
      prismaMock.conversationFindUnique.mockResolvedValue({
        id: 'conv-1',
        userId: 'user-1',
        messages: [],
      });
      prismaMock.messageUpdateMany.mockResolvedValue({ count: 0 });

      await service.getConversationMessages('user-1');

      expect(prismaMock.messageUpdateMany).toHaveBeenCalledWith({
        where: {
          conversationId: 'conv-1',
          senderRole: MessageSenderRole.USER,
          readAt: null,
        },
        data: { readAt: expect.any(Date) },
      });
    });

    it('does not filter out user callback (kind=BUTTON) rows — operator sees everything', async () => {
      prismaMock.conversationFindUnique.mockResolvedValue({
        id: 'conv-1',
        userId: 'user-1',
        messages: [
          {
            id: 'msg-cb',
            conversationId: 'conv-1',
            senderRole: MessageSenderRole.USER,
            kind: MessageKind.BUTTON,
            content: 'ping',
            buttons: null,
            readAt: null,
            createdAt: new Date('2024-01-01'),
          },
        ],
      });
      prismaMock.messageUpdateMany.mockResolvedValue({ count: 1 });

      const result = await service.getConversationMessages('user-1');

      expect(result).toHaveLength(1);
      expect(result[0].content).toBe('ping');
    });

    it('maps replyTo and deliveredTo from the joined rows and channel snapshot', async () => {
      prismaMock.conversationFindUnique.mockResolvedValue({
        id: 'conv-1',
        userId: 'user-1',
        messages: [
          {
            id: 'msg-1',
            conversationId: 'conv-1',
            senderRole: MessageSenderRole.USER,
            kind: MessageKind.TEXT,
            content: 'question',
            buttons: null,
            channel: 'TELEGRAM',
            botName: 'Kaufman Bot',
            operatorEmail: null,
            readAt: null,
            createdAt: new Date('2024-01-01'),
          },
          {
            id: 'msg-2',
            conversationId: 'conv-1',
            senderRole: MessageSenderRole.BOT,
            kind: MessageKind.TEXT,
            content: 'answer',
            buttons: null,
            channel: 'TELEGRAM',
            botName: 'Kaufman Bot',
            operatorEmail: null,
            readAt: null,
            createdAt: new Date('2024-01-02'),
            replyTo: {
              id: 'msg-1',
              senderRole: MessageSenderRole.USER,
              content: 'question',
            },
          },
        ],
      });
      prismaMock.messageUpdateMany.mockResolvedValue({ count: 1 });

      const result = await service.getConversationMessages('user-1');

      // USER message: single channel it was written from
      expect(result[0].deliveredTo).toEqual(['TELEGRAM']);
      expect(result[0].replyTo).toBeNull();
      // BOT reply snapshot TELEGRAM means dual delivery + quote subset
      expect(result[1].deliveredTo).toEqual(['WEB', 'TELEGRAM']);
      expect(result[1].replyTo).toEqual({
        id: 'msg-1',
        senderRole: 'USER',
        content: 'question',
      });
    });
  });

  describe('replyAsBot', () => {
    it('should throw BadRequestException when content is empty AND no buttons', async () => {
      await expect(service.replyAsBot('user-1', '')).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.replyAsBot('user-1', '   ')).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.replyAsBot('user-1', undefined, [])).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException when content exceeds max length', async () => {
      const longContent = 'a'.repeat(4001);

      await expect(service.replyAsBot('user-1', longContent)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException when buttons fail validation', async () => {
      await expect(
        service.replyAsBot('user-1', 'ok', [
          { title: '', callbackData: 'cb' } as any,
        ]),
      ).rejects.toThrow(BadRequestException);
    });

    it('should accept reply with only buttons (no text)', async () => {
      const createdAt = new Date('2024-01-01T00:00:00Z');
      prismaMock.conversationUpsert.mockResolvedValue({
        id: 'conv-1',
        userId: 'user-1',
      });
      prismaMock.messageCreate.mockResolvedValue({
        id: 'msg-1',
        conversationId: 'conv-1',
        senderRole: MessageSenderRole.BOT,
        kind: MessageKind.TEXT,
        content: '',
        buttons: [{ title: 'Да', callbackData: 'yes' }],
        readAt: null,
        createdAt,
      });

      const result = await service.replyAsBot('user-1', undefined, [
        { title: 'Да', callbackData: 'yes' },
      ]);

      expect(result.id).toBe('msg-1');
      expect(result.buttons).toEqual([{ title: 'Да', callbackData: 'yes' }]);
      expect(prismaMock.messageCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          senderRole: MessageSenderRole.BOT,
          kind: MessageKind.TEXT,
          content: '',
          buttons: [{ title: 'Да', callbackData: 'yes' }],
        }),
      });
      expect(chatEventsMock.publish).toHaveBeenCalledWith({
        conversationId: 'conv-1',
        messageId: 'msg-1',
        senderRole: MessageSenderRole.BOT,
        content: '',
        createdAt: createdAt.toISOString(),
        kind: 'TEXT',
        buttons: [{ title: 'Да', callbackData: 'yes' }],
        channel: null,
        botName: null,
        operatorEmail: null,
        replyTo: null,
      });
    });

    it('should accept reply with both text and buttons', async () => {
      prismaMock.conversationUpsert.mockResolvedValue({
        id: 'conv-1',
        userId: 'user-1',
      });
      prismaMock.messageCreate.mockResolvedValue({
        id: 'msg-1',
        conversationId: 'conv-1',
        senderRole: MessageSenderRole.BOT,
        kind: MessageKind.TEXT,
        content: 'Hello',
        buttons: [{ title: 'Ok', callbackData: 'ok' }],
        readAt: null,
        createdAt: new Date(),
      });

      const result = await service.replyAsBot('user-1', 'Hello', [
        { title: 'Ok', callbackData: 'ok' },
      ]);

      expect(result.content).toBe('Hello');
      expect(result.buttons).toEqual([{ title: 'Ok', callbackData: 'ok' }]);
    });

    it('should create conversation lazily if it does not exist', async () => {
      prismaMock.conversationUpsert.mockResolvedValue({
        id: 'conv-1',
        userId: 'user-1',
      });
      prismaMock.messageCreate.mockResolvedValue({
        id: 'msg-1',
        conversationId: 'conv-1',
        senderRole: MessageSenderRole.BOT,
        kind: MessageKind.TEXT,
        content: 'Hello',
        buttons: null,
        readAt: null,
        createdAt: new Date('2024-01-01'),
      });

      await service.replyAsBot('user-1', 'Hello');

      expect(prismaMock.conversationUpsert).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        update: {},
        create: { userId: 'user-1' },
      });
    });

    it('should persist the message (no buttons) and publish an event with kind=TEXT', async () => {
      const createdAt = new Date('2024-01-01T00:00:00Z');
      prismaMock.conversationUpsert.mockResolvedValue({
        id: 'conv-1',
        userId: 'user-1',
      });
      prismaMock.messageCreate.mockResolvedValue({
        id: 'msg-1',
        conversationId: 'conv-1',
        senderRole: MessageSenderRole.BOT,
        kind: MessageKind.TEXT,
        content: 'Hello',
        buttons: null,
        readAt: null,
        createdAt,
      });

      const result = await service.replyAsBot('user-1', 'Hello');

      expect(result.id).toBe('msg-1');
      expect(result.senderRole).toBe('BOT');
      expect(result.content).toBe('Hello');
      expect(result.buttons).toBeNull();

      expect(chatEventsMock.publish).toHaveBeenCalledWith({
        conversationId: 'conv-1',
        messageId: 'msg-1',
        senderRole: MessageSenderRole.BOT,
        content: 'Hello',
        createdAt: createdAt.toISOString(),
        kind: 'TEXT',
        buttons: null,
        channel: null,
        botName: null,
        operatorEmail: null,
        replyTo: null,
      });
    });

    it('should trim whitespace from content and buttons', async () => {
      prismaMock.conversationUpsert.mockResolvedValue({
        id: 'conv-1',
        userId: 'user-1',
      });
      prismaMock.messageCreate.mockResolvedValue({
        id: 'msg-1',
        conversationId: 'conv-1',
        senderRole: MessageSenderRole.BOT,
        kind: MessageKind.TEXT,
        content: 'Hello',
        buttons: [{ title: 'Да', callbackData: 'yes' }],
        readAt: null,
        createdAt: new Date(),
      });

      await service.replyAsBot('user-1', '  Hello  ', [
        { title: '  Да  ', callbackData: '  yes  ' },
      ]);

      expect(prismaMock.messageCreate).toHaveBeenCalledWith({
        data: {
          conversationId: 'conv-1',
          senderRole: MessageSenderRole.BOT,
          kind: MessageKind.TEXT,
          content: 'Hello',
          buttons: [{ title: 'Да', callbackData: 'yes' }],
          channel: 'WEB',
          botName: null,
          operatorEmail: null,
        },
      });
    });

    it('should snapshot the operator email and the Telegram delivery channel', async () => {
      prismaMock.conversationUpsert.mockResolvedValue({
        id: 'conv-1',
        userId: 'user-1',
      });
      prismaMock.userFindUnique.mockResolvedValue({
        telegramBotId: 'bot-1',
        telegramChatId: '999',
      });
      messageChannelMock.resolveDelivery.mockResolvedValue({
        channel: 'TELEGRAM',
        botName: 'Kaufman Bot',
      });
      prismaMock.messageCreate.mockResolvedValue({
        id: 'msg-1',
        conversationId: 'conv-1',
        senderRole: MessageSenderRole.BOT,
        kind: MessageKind.TEXT,
        content: 'Hello',
        buttons: null,
        channel: 'TELEGRAM',
        botName: 'Kaufman Bot',
        operatorEmail: 'admin@kaufman.bot',
        readAt: null,
        createdAt: new Date('2024-01-01'),
      });

      const result = await service.replyAsBot(
        'user-1',
        'Hello',
        undefined,
        'admin@kaufman.bot',
      );

      expect(messageChannelMock.resolveDelivery).toHaveBeenCalledWith(null, {
        telegramBotId: 'bot-1',
        telegramChatId: '999',
      });
      expect(prismaMock.messageCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          channel: 'TELEGRAM',
          botName: 'Kaufman Bot',
          operatorEmail: 'admin@kaufman.bot',
        }),
      });
      expect(result.channel).toBe('TELEGRAM');
      expect(result.botName).toBe('Kaufman Bot');
      expect(result.operatorEmail).toBe('admin@kaufman.bot');
    });

    it('keeps deliveredTo web-only and replyTo null for a plain reply', async () => {
      prismaMock.conversationFindUnique.mockResolvedValue(null);
      prismaMock.conversationUpsert.mockResolvedValue({
        id: 'conv-1',
        userId: 'user-1',
      });
      prismaMock.messageCreate.mockResolvedValue({
        id: 'msg-1',
        conversationId: 'conv-1',
        senderRole: MessageSenderRole.BOT,
        kind: MessageKind.TEXT,
        content: 'Hello',
        buttons: null,
        channel: 'WEB',
        botName: null,
        operatorEmail: null,
        readAt: null,
        createdAt: new Date('2024-01-01'),
      });

      const result = await service.replyAsBot('user-1', 'Hello');

      expect(result.deliveredTo).toEqual(['WEB']);
      expect(result.replyTo).toBeNull();
    });

    describe('quoted replies (replyToMessageId)', () => {
      const telegramTarget = {
        id: 'msg-u1',
        conversationId: 'conv-1',
        senderRole: MessageSenderRole.USER,
        kind: MessageKind.TEXT,
        content: 'user question',
        channel: 'TELEGRAM',
        botName: 'Kaufman Bot',
        operatorEmail: null,
        readAt: null,
        createdAt: new Date('2024-01-01'),
        telegramMessageId: 42,
      };

      const prepareValidTarget = () => {
        prismaMock.conversationFindUnique.mockResolvedValue({
          id: 'conv-1',
          userId: 'user-1',
        });
        prismaMock.messageFindUnique.mockResolvedValue(telegramTarget);
      };

      it('links the reply to the target and carries the quote snapshot in DTO and event', async () => {
        prepareValidTarget();
        messageChannelMock.resolveDelivery.mockResolvedValue({
          channel: 'TELEGRAM',
          botName: 'Kaufman Bot',
        });
        prismaMock.messageCreate.mockResolvedValue({
          id: 'msg-bot',
          conversationId: 'conv-1',
          senderRole: MessageSenderRole.BOT,
          kind: MessageKind.TEXT,
          content: 'answer',
          buttons: null,
          channel: 'TELEGRAM',
          botName: 'Kaufman Bot',
          operatorEmail: 'op@kaufman.bot',
          readAt: null,
          createdAt: new Date('2024-01-02'),
        });

        const result = await service.replyAsBot(
          'user-1',
          'answer',
          undefined,
          'op@kaufman.bot',
          'msg-u1',
        );

        // Context is the target's channel (design D3)
        expect(messageChannelMock.resolveDelivery).toHaveBeenCalledWith(
          'TELEGRAM',
          { telegramBotId: null, telegramChatId: null },
        );
        // Link persisted
        expect(prismaMock.messageCreate).toHaveBeenCalledWith({
          data: expect.objectContaining({ replyToId: 'msg-u1' }),
        });
        // DTO exposes the quote subset
        expect(result.replyTo).toEqual({
          id: 'msg-u1',
          senderRole: 'USER',
          content: 'user question',
        });
        // Dual delivery is explicit
        expect(result.deliveredTo).toEqual(['WEB', 'TELEGRAM']);
        // Event carries the FULL snapshot incl. the Telegram message_id
        expect(chatEventsMock.publish).toHaveBeenCalledWith(
          expect.objectContaining({
            replyTo: {
              id: 'msg-u1',
              senderRole: 'USER',
              content: 'user question',
              channel: 'TELEGRAM',
              telegramMessageId: 42,
            },
          }),
        );
      });

      it('rejects a missing target with 400 and writes nothing', async () => {
        prismaMock.conversationFindUnique.mockResolvedValue({
          id: 'conv-1',
          userId: 'user-1',
        });
        prismaMock.messageFindUnique.mockResolvedValue(null);

        await expect(
          service.replyAsBot('user-1', 'answer', undefined, null, 'msg-nope'),
        ).rejects.toThrow(BadRequestException);
        expect(prismaMock.messageCreate).not.toHaveBeenCalled();
        expect(prismaMock.conversationUpsert).not.toHaveBeenCalled();
        expect(chatEventsMock.publish).not.toHaveBeenCalled();
      });

      it('rejects a target from another conversation with 400', async () => {
        prismaMock.conversationFindUnique.mockResolvedValue({
          id: 'conv-1',
          userId: 'user-1',
        });
        prismaMock.messageFindUnique.mockResolvedValue({
          ...telegramTarget,
          conversationId: 'conv-other',
        });

        await expect(
          service.replyAsBot('user-1', 'answer', undefined, null, 'msg-u1'),
        ).rejects.toThrow(BadRequestException);
        expect(prismaMock.messageCreate).not.toHaveBeenCalled();
      });

      it('rejects a BOT target with 400', async () => {
        prismaMock.conversationFindUnique.mockResolvedValue({
          id: 'conv-1',
          userId: 'user-1',
        });
        prismaMock.messageFindUnique.mockResolvedValue({
          ...telegramTarget,
          senderRole: MessageSenderRole.BOT,
        });

        await expect(
          service.replyAsBot('user-1', 'answer', undefined, null, 'msg-u1'),
        ).rejects.toThrow(BadRequestException);
        expect(prismaMock.messageCreate).not.toHaveBeenCalled();
      });

      it('rejects a target when the conversation does not exist yet', async () => {
        prismaMock.conversationFindUnique.mockResolvedValue(null);
        prismaMock.messageFindUnique.mockResolvedValue(telegramTarget);

        await expect(
          service.replyAsBot('user-1', 'answer', undefined, null, 'msg-u1'),
        ).rejects.toThrow(BadRequestException);
        expect(prismaMock.messageCreate).not.toHaveBeenCalled();
      });

      it('routes a quoted reply on a WEB target to WEB context even when bound', async () => {
        prismaMock.conversationFindUnique.mockResolvedValue({
          id: 'conv-1',
          userId: 'user-1',
        });
        prismaMock.messageFindUnique.mockResolvedValue({
          ...telegramTarget,
          channel: 'WEB',
          botName: null,
          telegramMessageId: null,
        });
        prismaMock.userFindUnique.mockResolvedValue({
          telegramBotId: 'bot-1',
          telegramChatId: '999',
        });
        prismaMock.messageCreate.mockResolvedValue({
          id: 'msg-bot',
          conversationId: 'conv-1',
          senderRole: MessageSenderRole.BOT,
          kind: MessageKind.TEXT,
          content: 'answer',
          buttons: null,
          channel: 'WEB',
          botName: null,
          operatorEmail: null,
          readAt: null,
          createdAt: new Date('2024-01-02'),
        });

        await service.replyAsBot('user-1', 'answer', undefined, null, 'msg-u1');

        expect(messageChannelMock.resolveDelivery).toHaveBeenCalledWith('WEB', {
          telegramBotId: 'bot-1',
          telegramChatId: '999',
        });
      });
    });

    describe('plain reply routing (last USER message channel)', () => {
      const preparePlainReply = () => {
        prismaMock.conversationFindUnique.mockResolvedValue({
          id: 'conv-1',
          userId: 'user-1',
        });
        prismaMock.userFindUnique.mockResolvedValue({
          telegramBotId: 'bot-1',
          telegramChatId: '999',
        });
        prismaMock.messageCreate.mockResolvedValue({
          id: 'msg-bot',
          conversationId: 'conv-1',
          senderRole: MessageSenderRole.BOT,
          kind: MessageKind.TEXT,
          content: 'answer',
          buttons: null,
          channel: 'WEB',
          botName: null,
          operatorEmail: null,
          readAt: null,
          createdAt: new Date('2024-01-02'),
        });
      };

      it('uses the WEB context of the last user message even when bound', async () => {
        preparePlainReply();
        prismaMock.messageFindFirst.mockResolvedValue({ channel: 'WEB' });

        await service.replyAsBot('user-1', 'answer');

        expect(messageChannelMock.resolveDelivery).toHaveBeenCalledWith('WEB', {
          telegramBotId: 'bot-1',
          telegramChatId: '999',
        });
      });

      it('uses the TELEGRAM context of the last user message', async () => {
        preparePlainReply();
        prismaMock.messageFindFirst.mockResolvedValue({
          channel: 'TELEGRAM',
        });

        await service.replyAsBot('user-1', 'answer');

        expect(messageChannelMock.resolveDelivery).toHaveBeenCalledWith(
          'TELEGRAM',
          { telegramBotId: 'bot-1', telegramChatId: '999' },
        );
      });

      it('falls back to the binding context when the dialogue has no user messages', async () => {
        preparePlainReply();
        prismaMock.messageFindFirst.mockResolvedValue(null);

        await service.replyAsBot('user-1', 'answer');

        expect(messageChannelMock.resolveDelivery).toHaveBeenCalledWith(null, {
          telegramBotId: 'bot-1',
          telegramChatId: '999',
        });
      });
    });
  });

  describe('enrichStreamEventWithUserId', () => {
    it('should add userId to the event from conversation', async () => {
      prismaMock.conversationFindUnique.mockResolvedValue({
        id: 'conv-1',
        userId: 'user-1',
      });

      const event: MockBotStreamEventDto = {
        messageId: 'msg-1',
        conversationId: 'conv-1',
        userId: '',
        senderRole: 'USER' as const,
        content: 'Hello',
        buttons: null,
        channel: 'WEB' as const,
        botName: null,
        operatorEmail: null,
        replyTo: null,
        deliveredTo: ['WEB'],
        createdAt: new Date().toISOString(),
      };

      const result = await service.enrichStreamEventWithUserId(event);

      expect(result.userId).toBe('user-1');
    });

    it('should leave userId empty when conversation not found', async () => {
      prismaMock.conversationFindUnique.mockResolvedValue(null);

      const event: MockBotStreamEventDto = {
        messageId: 'msg-1',
        conversationId: 'conv-1',
        userId: '',
        senderRole: 'USER' as const,
        content: 'Hello',
        buttons: null,
        channel: 'WEB' as const,
        botName: null,
        operatorEmail: null,
        replyTo: null,
        deliveredTo: ['WEB'],
        createdAt: new Date().toISOString(),
      };

      const result = await service.enrichStreamEventWithUserId(event);

      expect(result.userId).toBe('');
    });
  });
});
