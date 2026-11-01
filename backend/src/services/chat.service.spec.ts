import { BadRequestException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MessageSenderRole } from '../generated/prisma/enums.js';
import { ChatEventsService } from './chat-events.service.js';
import { ChatService } from './chat.service.js';

const makePrismaMock = () => {
  const conversationFindUnique = vi.fn();
  const conversationUpsert = vi.fn();
  const messageCreate = vi.fn();
  const messageUpdateMany = vi.fn();

  return {
    instance: {
      conversation: {
        findUnique: conversationFindUnique,
        upsert: conversationUpsert,
      },
      message: {
        create: messageCreate,
        updateMany: messageUpdateMany,
      },
    },
    conversationFindUnique,
    conversationUpsert,
    messageCreate,
    messageUpdateMany,
  };
};

const makeUser = (id = 'user-1') => ({
  id,
  email: 'test@example.com',
  password: 'hashed',
  role: 'USER' as const,
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
});

const makeChatEventsMock = () => {
  const publish = vi.fn();
  const streamByConversation = vi.fn().mockReturnValue({ subscribe: vi.fn() });
  const streamAll = vi.fn().mockReturnValue({ subscribe: vi.fn() });

  return {
    publish,
    streamByConversation,
    streamAll,
    instance: {
      publish,
      streamByConversation,
      streamAll,
    } as unknown as ChatEventsService,
  };
};

describe('ChatService', () => {
  let prismaMock: ReturnType<typeof makePrismaMock>;
  let chatEventsMock: ReturnType<typeof makeChatEventsMock>;
  let service: ChatService;

  beforeEach(() => {
    prismaMock = makePrismaMock();
    chatEventsMock = makeChatEventsMock();
    service = new ChatService(
      prismaMock.instance as any,
      chatEventsMock.instance,
    );
  });

  describe('getHistory', () => {
    it('should return empty array when no conversation exists', async () => {
      prismaMock.conversationFindUnique.mockResolvedValue(null);
      const user = makeUser();

      const result = await service.getHistory(user);

      expect(result).toEqual([]);
    });

    it('should return messages ordered by createdAt ascending', async () => {
      const messages = [
        {
          id: 'msg-1',
          conversationId: 'conv-1',
          senderRole: MessageSenderRole.USER,
          content: 'First',
          readAt: null,
          createdAt: new Date('2024-01-01'),
        },
        {
          id: 'msg-2',
          conversationId: 'conv-1',
          senderRole: MessageSenderRole.BOT,
          content: 'Second',
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

      const user = makeUser();
      const result = await service.getHistory(user);

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('msg-1');
      expect(result[1].id).toBe('msg-2');
    });

    it('should mark bot messages as read', async () => {
      prismaMock.conversationFindUnique.mockResolvedValue({
        id: 'conv-1',
        userId: 'user-1',
        messages: [],
      });
      prismaMock.messageUpdateMany.mockResolvedValue({ count: 0 });

      const user = makeUser();
      await service.getHistory(user);

      expect(prismaMock.messageUpdateMany).toHaveBeenCalledWith({
        where: {
          conversationId: 'conv-1',
          senderRole: MessageSenderRole.BOT,
          readAt: null,
        },
        data: { readAt: expect.any(Date) },
      });
    });
  });

  describe('sendMessage', () => {
    it('should throw BadRequestException when content is empty', async () => {
      const user = makeUser();

      await expect(service.sendMessage(user, '')).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.sendMessage(user, '   ')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException when content exceeds max length', async () => {
      const user = makeUser();
      const longContent = 'a'.repeat(4001);

      await expect(service.sendMessage(user, longContent)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should create conversation lazily on first message', async () => {
      prismaMock.conversationUpsert.mockResolvedValue({
        id: 'conv-1',
        userId: 'user-1',
      });
      prismaMock.messageCreate.mockResolvedValue({
        id: 'msg-1',
        conversationId: 'conv-1',
        senderRole: MessageSenderRole.USER,
        content: 'Hello',
        readAt: null,
        createdAt: new Date('2024-01-01'),
      });

      const user = makeUser();
      await service.sendMessage(user, 'Hello');

      expect(prismaMock.conversationUpsert).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        update: {},
        create: { userId: 'user-1' },
      });
    });

    it('should persist the message and publish an event', async () => {
      const createdAt = new Date('2024-01-01T00:00:00Z');
      prismaMock.conversationUpsert.mockResolvedValue({
        id: 'conv-1',
        userId: 'user-1',
      });
      prismaMock.messageCreate.mockResolvedValue({
        id: 'msg-1',
        conversationId: 'conv-1',
        senderRole: MessageSenderRole.USER,
        content: 'Hello',
        readAt: null,
        createdAt,
      });

      const user = makeUser();
      const result = await service.sendMessage(user, 'Hello');

      expect(result.id).toBe('msg-1');
      expect(result.content).toBe('Hello');
      expect(result.createdAt).toBe(createdAt.toISOString());

      expect(chatEventsMock.publish).toHaveBeenCalledWith({
        conversationId: 'conv-1',
        messageId: 'msg-1',
        senderRole: MessageSenderRole.USER,
        content: 'Hello',
        createdAt: createdAt.toISOString(),
      });
    });

    it('should trim whitespace from content', async () => {
      prismaMock.conversationUpsert.mockResolvedValue({
        id: 'conv-1',
        userId: 'user-1',
      });
      prismaMock.messageCreate.mockResolvedValue({
        id: 'msg-1',
        conversationId: 'conv-1',
        senderRole: MessageSenderRole.USER,
        content: 'Hello',
        readAt: null,
        createdAt: new Date(),
      });

      const user = makeUser();
      await service.sendMessage(user, '  Hello  ');

      expect(prismaMock.messageCreate).toHaveBeenCalledWith({
        data: {
          conversationId: 'conv-1',
          senderRole: MessageSenderRole.USER,
          content: 'Hello',
        },
      });
    });
  });

  describe('getConversationByUserId', () => {
    it('should throw NotFoundException when conversation does not exist', async () => {
      prismaMock.conversationFindUnique.mockResolvedValue(null);

      await expect(
        service.getConversationByUserId('unknown-user'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should return the conversation when it exists', async () => {
      const conversation = {
        id: 'conv-1',
        userId: 'user-1',
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      prismaMock.conversationFindUnique.mockResolvedValue(conversation);

      const result = await service.getConversationByUserId('user-1');

      expect(result).toEqual(conversation);
    });
  });
});
