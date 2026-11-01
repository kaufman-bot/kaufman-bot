import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { User } from '../generated/prisma/client.js';
import {
  BotPluginTaskStatus,
  MessageSenderRole,
} from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { ChatEventsService } from '../services/chat-events.service.js';
import { BotPlugin } from './bot-plugin.interface.js';
import { BotPluginsService } from './bot-plugins.service.js';

const makePrismaMock = () => {
  const messageCreate = vi.fn();
  const taskUpdateMany = vi.fn().mockResolvedValue({ count: 1 });
  const taskFindMany = vi.fn().mockResolvedValue([]);
  const conversationFindUnique = vi.fn();
  const userFindUnique = vi.fn();
  const $transaction = vi.fn(async (fn: (tx: unknown) => unknown) =>
    fn({
      message: { create: messageCreate },
      botPluginTask: { updateMany: taskUpdateMany },
    }),
  );

  return {
    messageCreate,
    taskUpdateMany,
    taskFindMany,
    conversationFindUnique,
    userFindUnique,
    $transaction,
    instance: {
      message: { create: messageCreate },
      botPluginTask: { updateMany: taskUpdateMany, findMany: taskFindMany },
      conversation: { findUnique: conversationFindUnique },
      user: { findUnique: userFindUnique },
      $transaction,
    } as unknown as PrismaService,
  };
};

const makeChatEventsMock = () => {
  const publish = vi.fn();
  return {
    publish,
    instance: { publish } as unknown as ChatEventsService,
  };
};

const makePlugin = (name: string, canHandle: boolean, reply: string) => ({
  name,
  canHandle: vi.fn().mockReturnValue(canHandle),
  handle: vi.fn().mockReturnValue(reply),
});

const user = { id: 'user-1', timezone: null } as unknown as User;

const pendingTask = {
  id: 'task-1',
  messageId: 'msg-in',
  status: BotPluginTaskStatus.PENDING,
  createdAt: new Date('2024-01-01T00:00:00Z'),
  updatedAt: new Date('2024-01-01T00:00:00Z'),
  message: {
    id: 'msg-in',
    conversationId: 'conv-1',
    senderRole: MessageSenderRole.USER,
    content: 'ping',
    readAt: null,
    createdAt: new Date('2024-01-01T00:00:00Z'),
  },
};

describe('BotPluginsService', () => {
  let prismaMock: ReturnType<typeof makePrismaMock>;
  let chatEventsMock: ReturnType<typeof makeChatEventsMock>;

  const createService = (...plugins: BotPlugin[]) =>
    new BotPluginsService(
      plugins,
      prismaMock.instance,
      chatEventsMock.instance,
    );

  beforeEach(() => {
    prismaMock = makePrismaMock();
    chatEventsMock = makeChatEventsMock();
    prismaMock.messageCreate.mockResolvedValue({
      id: 'msg-bot',
      content: 'reply',
      createdAt: new Date('2024-01-01T00:00:00Z'),
    });
  });

  describe('dispatchAndReply', () => {
    it('handles the message with the first matching plugin only', async () => {
      const first = makePlugin('first', true, 'first reply');
      const second = makePlugin('second', true, 'second reply');
      prismaMock.messageCreate.mockResolvedValue({
        id: 'msg-bot',
        content: 'first reply',
        createdAt: new Date('2024-01-01T00:00:00Z'),
      });

      const service = createService(first as BotPlugin, second as BotPlugin);
      await service.dispatchAndReply('conv-1', user, 'ping', 'msg-in');

      // The outbox task is claimed before any plugin runs
      expect(prismaMock.taskUpdateMany).toHaveBeenCalledWith({
        where: { messageId: 'msg-in', status: BotPluginTaskStatus.PENDING },
        data: { status: BotPluginTaskStatus.PROCESSING },
      });
      expect(first.handle).toHaveBeenCalledWith({ user, content: 'ping' });
      expect(second.handle).not.toHaveBeenCalled();
      expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
      expect(prismaMock.messageCreate).toHaveBeenCalledWith({
        data: {
          conversationId: 'conv-1',
          senderRole: MessageSenderRole.BOT,
          content: 'first reply',
        },
      });
      expect(chatEventsMock.publish).toHaveBeenCalledWith({
        conversationId: 'conv-1',
        messageId: 'msg-bot',
        senderRole: MessageSenderRole.BOT,
        content: 'first reply',
        createdAt: '2024-01-01T00:00:00.000Z',
      });
    });

    it('commits the reply and the DONE status in one transaction', async () => {
      const service = createService(
        makePlugin('echo', true, 'pong') as BotPlugin,
      );
      await service.dispatchAndReply('conv-1', user, 'ping', 'msg-in');

      expect(prismaMock.taskUpdateMany).toHaveBeenCalledWith({
        where: { messageId: 'msg-in', status: BotPluginTaskStatus.PROCESSING },
        data: { status: BotPluginTaskStatus.DONE },
      });
    });

    it('skips dispatch when the task is not PENDING (already claimed or done)', async () => {
      prismaMock.taskUpdateMany.mockResolvedValue({ count: 0 });
      const plugin = makePlugin('first', true, 'first reply');

      const service = createService(plugin as BotPlugin);
      await service.dispatchAndReply('conv-1', user, 'ping', 'msg-in');

      expect(plugin.handle).not.toHaveBeenCalled();
      expect(prismaMock.messageCreate).not.toHaveBeenCalled();
      expect(chatEventsMock.publish).not.toHaveBeenCalled();
      // Only the claim attempt happened, no completion update
      expect(prismaMock.taskUpdateMany).toHaveBeenCalledTimes(1);
    });

    it('completes the task without a reply when no plugin matches', async () => {
      const service = createService(
        makePlugin('first', false, 'first reply') as BotPlugin,
      );

      await service.dispatchAndReply('conv-1', user, 'anything', 'msg-in');

      expect(prismaMock.messageCreate).not.toHaveBeenCalled();
      expect(chatEventsMock.publish).not.toHaveBeenCalled();
      expect(prismaMock.taskUpdateMany).toHaveBeenCalledWith({
        where: { messageId: 'msg-in', status: BotPluginTaskStatus.PROCESSING },
        data: { status: BotPluginTaskStatus.DONE },
      });
    });

    it('closes the task without a reply when the plugin fails', async () => {
      const failing = makePlugin('failing', true, 'unused');
      failing.handle = vi.fn().mockRejectedValue(new Error('boom'));

      const service = createService(failing as BotPlugin);

      await expect(
        service.dispatchAndReply('conv-1', user, 'ping', 'msg-in'),
      ).resolves.toBeUndefined();
      expect(prismaMock.messageCreate).not.toHaveBeenCalled();
      expect(chatEventsMock.publish).not.toHaveBeenCalled();
      expect(prismaMock.taskUpdateMany).toHaveBeenCalledWith({
        where: { messageId: 'msg-in', status: BotPluginTaskStatus.PROCESSING },
        data: { status: BotPluginTaskStatus.DONE },
      });
    });
  });

  describe('runRecoverySweep', () => {
    it('dispatches a pending task restored from the database', async () => {
      prismaMock.taskUpdateMany.mockResolvedValueOnce({ count: 0 });
      prismaMock.taskFindMany.mockResolvedValue([pendingTask]);
      prismaMock.conversationFindUnique.mockResolvedValue({
        id: 'conv-1',
        userId: 'user-1',
      });
      prismaMock.userFindUnique.mockResolvedValue(user);

      const service = createService(
        makePlugin('echo', true, 'pong') as BotPlugin,
      );
      await service.runRecoverySweep();

      expect(prismaMock.taskFindMany).toHaveBeenCalledWith({
        where: { status: BotPluginTaskStatus.PENDING },
        include: { message: true },
        orderBy: { createdAt: 'asc' },
      });
      expect(prismaMock.messageCreate).toHaveBeenCalledWith({
        data: {
          conversationId: 'conv-1',
          senderRole: MessageSenderRole.BOT,
          content: 'pong',
        },
      });
      expect(chatEventsMock.publish).toHaveBeenCalled();
    });

    it('reopens a stale PROCESSING task before dispatching pending ones', async () => {
      prismaMock.taskUpdateMany.mockResolvedValueOnce({ count: 1 });
      prismaMock.taskFindMany.mockResolvedValue([pendingTask]);
      prismaMock.conversationFindUnique.mockResolvedValue({
        id: 'conv-1',
        userId: 'user-1',
      });
      prismaMock.userFindUnique.mockResolvedValue(user);

      const service = createService(
        makePlugin('echo', true, 'pong') as BotPlugin,
      );
      await service.runRecoverySweep();

      expect(prismaMock.taskUpdateMany).toHaveBeenCalledWith({
        where: {
          status: BotPluginTaskStatus.PROCESSING,
          updatedAt: { lt: expect.any(Date) },
        },
        data: { status: BotPluginTaskStatus.PENDING },
      });
      expect(chatEventsMock.publish).toHaveBeenCalled();
    });

    it('does not touch DONE tasks (they are never selected as pending)', async () => {
      prismaMock.taskUpdateMany.mockResolvedValueOnce({ count: 0 });
      prismaMock.taskFindMany.mockResolvedValue([]);

      const service = createService(
        makePlugin('echo', true, 'pong') as BotPlugin,
      );
      await service.runRecoverySweep();

      expect(prismaMock.messageCreate).not.toHaveBeenCalled();
      expect(chatEventsMock.publish).not.toHaveBeenCalled();
      // Only the stale-reopen update happened
      expect(prismaMock.taskUpdateMany).toHaveBeenCalledTimes(1);
    });

    it('closes the task without dispatch when the conversation owner is gone', async () => {
      prismaMock.taskUpdateMany.mockResolvedValueOnce({ count: 0 });
      prismaMock.taskFindMany.mockResolvedValue([pendingTask]);
      prismaMock.conversationFindUnique.mockResolvedValue(null);

      const service = createService(
        makePlugin('echo', true, 'pong') as BotPlugin,
      );
      await service.runRecoverySweep();

      expect(prismaMock.messageCreate).not.toHaveBeenCalled();
      expect(chatEventsMock.publish).not.toHaveBeenCalled();
      expect(prismaMock.taskUpdateMany).toHaveBeenCalledWith({
        where: { id: 'task-1', status: BotPluginTaskStatus.PENDING },
        data: { status: BotPluginTaskStatus.DONE },
      });
    });

    it('does not run two sweeps concurrently', async () => {
      let releaseFindMany: (tasks: unknown[]) => void = () => {};
      prismaMock.taskUpdateMany.mockResolvedValueOnce({ count: 0 });
      prismaMock.taskFindMany.mockReturnValue(
        new Promise((resolve) => {
          releaseFindMany = resolve;
        }),
      );

      const service = createService(
        makePlugin('echo', true, 'pong') as BotPlugin,
      );
      const first = service.runRecoverySweep();
      const second = service.runRecoverySweep();

      releaseFindMany([pendingTask]);
      await Promise.all([first, second]);

      expect(prismaMock.taskFindMany).toHaveBeenCalledTimes(1);
    });
  });

  describe('lifecycle', () => {
    it('sweeps on bootstrap and on every interval tick, stops on destroy', async () => {
      vi.useFakeTimers();
      try {
        const service = createService(
          makePlugin('echo', true, 'pong') as BotPlugin,
        );
        const sweep = vi
          .spyOn(
            service as unknown as { runRecoverySweep: () => Promise<void> },
            'runRecoverySweep',
          )
          .mockResolvedValue(undefined);

        service.onApplicationBootstrap();
        expect(sweep).toHaveBeenCalledTimes(1);

        await vi.advanceTimersByTimeAsync(30_000);
        expect(sweep).toHaveBeenCalledTimes(2);

        service.onModuleDestroy();
        await vi.advanceTimersByTimeAsync(30_000);
        expect(sweep).toHaveBeenCalledTimes(2);
      } finally {
        vi.useRealTimers();
      }
    });
  });
});
