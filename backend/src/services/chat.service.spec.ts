import { BadRequestException, NotFoundException } from '@nestjs/common';
import { firstValueFrom, Subject, take, toArray } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatEventsService } from './chat-events.service.js';
import { ChatService } from './chat.service.js';

const makePrismaMock = () => {
  const conversationFindUnique = vi.fn();
  const conversationUpsert = vi.fn();
  const messageCreate = vi.fn();
  const messageUpdateMany = vi.fn();
  const botPluginTaskCreate = vi.fn();
  const $transaction = vi.fn(async (fn: (tx: unknown) => unknown) =>
    fn({
      message: { create: messageCreate },
      botPluginTask: { create: botPluginTaskCreate },
    }),
  );

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
      botPluginTask: {
        create: botPluginTaskCreate,
      },
      $transaction,
    },
    conversationFindUnique,
    conversationUpsert,
    messageCreate,
    messageUpdateMany,
    botPluginTaskCreate,
    $transaction,
  };
};

const makeUser = (id = 'user-1') => ({
  id,
  email: 'test@example.com',
  password: 'hashed',
  role: 'USER' as const,
  isActive: true,
  timezone: null,
  createdAt: new Date(),
  updatedAt: new Date(),
});

const makeChatEventsMock = () => {
  const subject = new Subject<any>();
  const publish = vi.fn((event) => subject.next(event));
  const streamByConversation = vi.fn((_id: string) => subject.asObservable());
  const streamAll = vi.fn(() => subject.asObservable());

  return {
    publish,
    streamByConversation,
    streamAll,
    subject,
    instance: {
      publish,
      streamByConversation,
      streamAll,
    } as unknown as ChatEventsService,
  };
};

const makeBotPluginsMock = () => {
  const dispatchAndReply = vi.fn().mockResolvedValue(undefined);

  return {
    dispatchAndReply,
    instance: { dispatchAndReply } as unknown as any,
  };
};

describe('ChatService', () => {
  let prismaMock: ReturnType<typeof makePrismaMock>;
  let chatEventsMock: ReturnType<typeof makeChatEventsMock>;
  let botPluginsMock: ReturnType<typeof makeBotPluginsMock>;
  let service: ChatService;

  beforeEach(() => {
    prismaMock = makePrismaMock();
    chatEventsMock = makeChatEventsMock();
    botPluginsMock = makeBotPluginsMock();
    service = new ChatService(
      prismaMock.instance as any,
      chatEventsMock.instance,
      botPluginsMock.instance,
    );
  });

  describe('getHistory', () => {
    it('should return empty array when no conversation exists', async () => {
      prismaMock.conversationFindUnique.mockResolvedValue(null);
      const user = makeUser();

      const result = await service.getHistory(user);

      expect(result).toEqual([]);
    });

    it('excludes kind=BUTTON rows from the user history (Prisma where filter)', async () => {
      prismaMock.conversationFindUnique.mockResolvedValue({
        id: 'conv-1',
        userId: 'user-1',
        messages: [
          {
            id: 'msg-1',
            conversationId: 'conv-1',
            senderRole: 'BOT',
            kind: 'TEXT',
            content: 'Hi',
            buttons: [{ title: 'Да', callbackData: 'yes' }],
            readAt: null,
            createdAt: new Date('2024-01-01'),
          },
        ],
      });
      prismaMock.messageUpdateMany.mockResolvedValue({ count: 0 });

      const result = await service.getHistory(makeUser());

      // The findUnique include call MUST ask for a where filter that
      // excludes BUTTON rows — otherwise callbacks leak into history.
      expect(prismaMock.conversationFindUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 'user-1' },
          include: {
            messages: expect.objectContaining({
              where: { kind: { not: 'BUTTON' } },
              orderBy: { createdAt: 'asc' },
            }),
          },
        }),
      );
      expect(result[0].buttons).toEqual([{ title: 'Да', callbackData: 'yes' }]);
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
          senderRole: 'BOT',
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
        senderRole: 'USER',
        kind: 'TEXT',
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

    it('should persist the message and publish an event (kind=TEXT)', async () => {
      const createdAt = new Date('2024-01-01T00:00:00Z');
      prismaMock.conversationUpsert.mockResolvedValue({
        id: 'conv-1',
        userId: 'user-1',
      });
      prismaMock.messageCreate.mockResolvedValue({
        id: 'msg-1',
        conversationId: 'conv-1',
        senderRole: 'USER',
        kind: 'TEXT',
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
        senderRole: 'USER',
        content: 'Hello',
        createdAt: createdAt.toISOString(),
        kind: 'TEXT',
        buttons: null,
      });

      expect(botPluginsMock.dispatchAndReply).toHaveBeenCalledWith(
        'conv-1',
        expect.objectContaining({ id: 'user-1' }),
        'Hello',
        'msg-1',
      );
    });

    it('should dispatch the trimmed content to plugins', async () => {
      prismaMock.conversationUpsert.mockResolvedValue({
        id: 'conv-1',
        userId: 'user-1',
      });
      prismaMock.messageCreate.mockResolvedValue({
        id: 'msg-1',
        conversationId: 'conv-1',
        senderRole: 'USER',
        kind: 'TEXT',
        content: 'Hello',
        readAt: null,
        createdAt: new Date(),
      });

      await service.sendMessage(makeUser(), '  Hello  ');

      expect(botPluginsMock.dispatchAndReply).toHaveBeenCalledWith(
        'conv-1',
        expect.anything(),
        'Hello',
        'msg-1',
      );
    });

    it('should not fail the send when the plugin dispatch fails', async () => {
      botPluginsMock.dispatchAndReply.mockRejectedValue(
        new Error('dispatch exploded'),
      );
      prismaMock.conversationUpsert.mockResolvedValue({
        id: 'conv-1',
        userId: 'user-1',
      });
      prismaMock.messageCreate.mockResolvedValue({
        id: 'msg-1',
        conversationId: 'conv-1',
        senderRole: 'USER',
        kind: 'TEXT',
        content: 'Hello',
        readAt: null,
        createdAt: new Date(),
      });

      const result = await service.sendMessage(makeUser(), 'Hello');

      expect(result.id).toBe('msg-1');
      expect(result.content).toBe('Hello');
    });

    it('should trim whitespace from content', async () => {
      prismaMock.conversationUpsert.mockResolvedValue({
        id: 'conv-1',
        userId: 'user-1',
      });
      prismaMock.messageCreate.mockResolvedValue({
        id: 'msg-1',
        conversationId: 'conv-1',
        senderRole: 'USER',
        kind: 'TEXT',
        content: 'Hello',
        readAt: null,
        createdAt: new Date(),
      });

      const user = makeUser();
      await service.sendMessage(user, '  Hello  ');

      expect(prismaMock.messageCreate).toHaveBeenCalledWith({
        data: {
          conversationId: 'conv-1',
          senderRole: 'USER',
          kind: 'TEXT',
          content: 'Hello',
        },
      });
    });

    it('should create the plugin task in the same transaction as the message', async () => {
      prismaMock.conversationUpsert.mockResolvedValue({
        id: 'conv-1',
        userId: 'user-1',
      });
      prismaMock.messageCreate.mockResolvedValue({
        id: 'msg-1',
        conversationId: 'conv-1',
        senderRole: 'USER',
        kind: 'TEXT',
        content: 'Hello',
        readAt: null,
        createdAt: new Date(),
      });

      await service.sendMessage(makeUser(), 'Hello');

      expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
      expect(prismaMock.botPluginTaskCreate).toHaveBeenCalledWith({
        data: { messageId: 'msg-1' },
      });
    });

    it('should not accept the message when task creation fails', async () => {
      prismaMock.conversationUpsert.mockResolvedValue({
        id: 'conv-1',
        userId: 'user-1',
      });
      prismaMock.messageCreate.mockResolvedValue({
        id: 'msg-1',
        conversationId: 'conv-1',
        senderRole: 'USER',
        kind: 'TEXT',
        content: 'Hello',
        readAt: null,
        createdAt: new Date(),
      });
      prismaMock.botPluginTaskCreate.mockRejectedValue(
        new Error('task insert failed'),
      );

      await expect(service.sendMessage(makeUser(), 'Hello')).rejects.toThrow(
        'task insert failed',
      );
      // The transaction rolls back: no event, no plugin dispatch
      expect(chatEventsMock.publish).not.toHaveBeenCalled();
      expect(botPluginsMock.dispatchAndReply).not.toHaveBeenCalled();
    });
  });

  describe('submitButtonCallback', () => {
    it('should persist a USER message with kind=BUTTON and not create a BotPluginTask', async () => {
      prismaMock.conversationUpsert.mockResolvedValue({
        id: 'conv-1',
        userId: 'user-1',
      });
      prismaMock.messageCreate.mockResolvedValue({
        id: 'msg-cb',
        conversationId: 'conv-1',
        senderRole: 'USER',
        kind: 'BUTTON',
        content: 'ping',
        readAt: null,
        createdAt: new Date('2024-01-01'),
      });

      const result = await service.submitButtonCallback(makeUser(), {
        callbackData: 'ping',
      });

      expect(result.id).toBe('msg-cb');
      expect(result.content).toBe('ping');
      expect(result.senderRole).toBe('USER');

      // Uses a plain create, not a $transaction wrapper (no outbox row).
      expect(prismaMock.$transaction).not.toHaveBeenCalled();
      expect(prismaMock.botPluginTaskCreate).not.toHaveBeenCalled();

      expect(prismaMock.messageCreate).toHaveBeenCalledWith({
        data: {
          conversationId: 'conv-1',
          senderRole: 'USER',
          kind: 'BUTTON',
          content: 'ping',
        },
      });

      // Plugins were NOT dispatched.
      expect(botPluginsMock.dispatchAndReply).not.toHaveBeenCalled();

      // Event is published with kind=BUTTON so user-stream filters drop it.
      expect(chatEventsMock.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          conversationId: 'conv-1',
          messageId: 'msg-cb',
          senderRole: 'USER',
          content: 'ping',
          kind: 'BUTTON',
          buttons: null,
        }),
      );
    });

    it('rejects empty callbackData', async () => {
      await expect(
        service.submitButtonCallback(makeUser(), { callbackData: '   ' }),
      ).rejects.toThrow(BadRequestException);
    });

    it(`rejects callbackData longer than 256 characters`, async () => {
      await expect(
        service.submitButtonCallback(makeUser(), {
          callbackData: 'x'.repeat(257),
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('streamEvents (BUTTON suppression)', () => {
    it('does not forward kind=BUTTON events to the user subscriber', async () => {
      prismaMock.conversationFindUnique.mockResolvedValue({
        id: 'conv-1',
        userId: 'user-1',
      });

      const stream$ = service.streamEvents(makeUser());
      const collected = firstValueFrom(stream$.pipe(take(2), toArray()));

      // streamEvents resolves the user's conversation via a Promise before
      // subscribing to the ChatEvents bus; wait for that microtask to flush
      // so the following subject.next() calls actually reach the subscriber.
      await new Promise((r) => setImmediate(r));

      // Emit one ordinary TEXT bot event and one suppressed BUTTON event.
      chatEventsMock.subject.next({
        conversationId: 'conv-1',
        messageId: 'msg-bot',
        senderRole: 'BOT',
        content: 'hello',
        createdAt: new Date().toISOString(),
        kind: 'TEXT',
        buttons: null,
      });
      chatEventsMock.subject.next({
        conversationId: 'conv-1',
        messageId: 'msg-cb',
        senderRole: 'USER',
        content: 'ping',
        createdAt: new Date().toISOString(),
        kind: 'BUTTON',
        buttons: null,
      });
      // And one more TEXT event to guarantee take(2) resolves after
      // the BUTTON was filtered out; without suppression take(2) would
      // have consumed [msg-bot, msg-cb] and this third event would
      // remain unread — so its presence asserts the filter runs.
      chatEventsMock.subject.next({
        conversationId: 'conv-1',
        messageId: 'msg-bot2',
        senderRole: 'BOT',
        content: 'again',
        createdAt: new Date().toISOString(),
        kind: 'TEXT',
        buttons: null,
      });

      const received = await collected;
      expect(received.map((e) => e.messageId)).toEqual(['msg-bot', 'msg-bot2']);
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
