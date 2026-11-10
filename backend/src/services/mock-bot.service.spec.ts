import { BadRequestException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MessageKind, MessageSenderRole } from '../generated/prisma/enums.js';
import { ChatEventsService } from './chat-events.service.js';
import { MockBotService } from './mock-bot.service.js';

const makePrismaMock = () => {
  const conversationFindMany = vi.fn();
  const conversationFindUnique = vi.fn();
  const conversationUpsert = vi.fn();
  const messageCount = vi.fn();
  const messageCreate = vi.fn();
  const messageUpdateMany = vi.fn();

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
      },
    },
    conversationFindMany,
    conversationFindUnique,
    conversationUpsert,
    messageCount,
    messageCreate,
    messageUpdateMany,
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

describe('MockBotService', () => {
  let prismaMock: ReturnType<typeof makePrismaMock>;
  let chatEventsMock: ReturnType<typeof makeChatEventsMock>;
  let service: MockBotService;

  beforeEach(() => {
    prismaMock = makePrismaMock();
    chatEventsMock = makeChatEventsMock();
    service = new MockBotService(
      prismaMock.instance as any,
      chatEventsMock.instance,
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
      expect(result[1].id).toBe('conv-2');
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
      expect(result[1].id).toBe('msg-2');
      expect(result[1].buttons).toEqual([{ title: 'Да', callbackData: 'yes' }]);
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
        },
      });
    });
  });

  describe('enrichStreamEventWithUserId', () => {
    it('should add userId to the event from conversation', async () => {
      prismaMock.conversationFindUnique.mockResolvedValue({
        id: 'conv-1',
        userId: 'user-1',
      });

      const event = {
        messageId: 'msg-1',
        conversationId: 'conv-1',
        userId: '',
        senderRole: 'USER' as const,
        content: 'Hello',
        buttons: null,
        createdAt: new Date().toISOString(),
      };

      const result = await service.enrichStreamEventWithUserId(event);

      expect(result.userId).toBe('user-1');
    });

    it('should leave userId empty when conversation not found', async () => {
      prismaMock.conversationFindUnique.mockResolvedValue(null);

      const event = {
        messageId: 'msg-1',
        conversationId: 'conv-1',
        userId: '',
        senderRole: 'USER' as const,
        content: 'Hello',
        buttons: null,
        createdAt: new Date().toISOString(),
      };

      const result = await service.enrichStreamEventWithUserId(event);

      expect(result.userId).toBe('');
    });
  });
});
