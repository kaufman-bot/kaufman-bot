import {
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import type { KeyboardButtonDto } from '../dto/keyboard.dto.js';
import type {
  BotPluginTask,
  Message,
  User,
} from '../generated/prisma/client.js';
import {
  BotPluginTaskStatus,
  MessageKind,
  MessageSenderRole,
} from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  ChatEvent,
  ChatEventsService,
} from '../services/chat-events.service.js';
import {
  normalizeButtons,
  validateButtons,
} from '../utils/keyboard-buttons.js';
import {
  BOT_PLUGINS,
  BotPlugin,
  BotPluginReply,
  BotPluginSourceKind,
} from './bot-plugin.interface.js';

/** Interval between recovery sweeps (ms). */
const SWEEP_INTERVAL_MS = 30_000;
/**
 * A PROCESSING task older than this is considered abandoned by a crashed
 * process and is reopened by the recovery sweep. The threshold must stay
 * well above the normal processing time (fractions of a second) so a live
 * worker in prod cluster mode never gets its task stolen.
 */
const STALE_PROCESSING_MS = 60_000;

/** A pending outbox task joined with its user message. */
type PendingTask = BotPluginTask & { message: Message };

/** Result of validating a plugin reply before anything is persisted. */
type PreparedReply =
  | { ok: true; text: string; buttons?: KeyboardButtonDto[] }
  | { ok: false; reason: string };

/**
 * Dispatches user messages to the registered bot plugins. Finds the first
 * plugin matching the message, computes its reply and delivers it as a
 * regular bot message: persisted in the conversation and published to the
 * chat event bus (same pattern as MockBotService.replyAsBot).
 *
 * The work is crash-safe: every user message gets an outbox task
 * (BotPluginTask) created in the same transaction as the message itself.
 * Dispatch claims the task atomically and commits the reply together with
 * the task completion, and a recovery sweep (on bootstrap + every
 * SWEEP_INTERVAL_MS) finishes whatever a restart has left unfinished, so a
 * message is processed at most once across restarts.
 *
 * A plugin error never propagates: it is logged, the task is closed and the
 * dispatch simply produces no reply, so the user's own message stays
 * unaffected.
 */
@Injectable()
export class BotPluginsService
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(BotPluginsService.name);
  private sweepTimer: NodeJS.Timeout | null = null;

  // In-process only: it stops parallel sweeps within a single process. After
  // Redis is adopted, replace it with a distributed lock (Redlock) so
  // scaled-out instances share one sweep — see BACKLOG.md.
  private sweeping = false;

  constructor(
    @Inject(BOT_PLUGINS) private readonly plugins: BotPlugin[],
    private readonly prisma: PrismaService,
    private readonly chatEvents: ChatEventsService,
  ) {}

  // --- lifecycle ---------------------------------------------------------

  onApplicationBootstrap(): void {
    // Finish whatever a previous process left unfinished, then keep
    // sweeping: prod runs several cluster workers and any worker can die
    // between claiming a task and committing its result.
    void this.runRecoverySweep();
    this.sweepTimer = setInterval(
      () => void this.runRecoverySweep(),
      SWEEP_INTERVAL_MS,
    );
    this.sweepTimer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.sweepTimer) {
      clearInterval(this.sweepTimer);
      this.sweepTimer = null;
    }
  }

  // --- dispatch ----------------------------------------------------------

  /**
   * Handles a user message dispatch. The message's outbox task is claimed
   * atomically (PENDING -> PROCESSING), so only one worker/process ever
   * handles a message. When a plugin matches, its reply is persisted as a
   * BOT message of the conversation and published to the chat event bus for
   * real-time delivery; the task completion is committed in the same
   * transaction as the reply.
   *
   * `kind` tells the plugins whether `content` is typed text or the payload of
   * a pressed inline button. Button messages are only offered to plugins that
   * opt in via `handlesCallbacks`, so a button payload colliding with a
   * text-only trigger stays silent.
   */
  async dispatchAndReply(
    conversationId: string,
    user: User,
    content: string,
    messageId: string,
    kind: BotPluginSourceKind = 'TEXT',
  ): Promise<void> {
    const claimed = await this.prisma.botPluginTask.updateMany({
      where: { messageId, status: BotPluginTaskStatus.PENDING },
      data: { status: BotPluginTaskStatus.PROCESSING },
    });
    if (claimed.count === 0) {
      // Another worker/process owns (or already finished) this message.
      return;
    }

    const plugin = this.plugins.find(
      (candidate) =>
        (kind === 'TEXT' || candidate.handlesCallbacks === true) &&
        candidate.canHandle(content, kind),
    );
    if (!plugin) {
      // No plugin matched: the message is fully processed without a reply.
      await this.completeTask(messageId);
      return;
    }

    let reply: BotPluginReply;
    try {
      reply = await plugin.handle({ user, content, kind });
    } catch (error) {
      // A plugin failure never affects the user's send: log it and close the
      // task so a persistently failing plugin is not retried forever (the
      // missing reply is the documented isolation behavior). If even this
      // update fails, the task stays PROCESSING and the sweep retries later.
      this.logger.error(
        `Plugin "${plugin.name}" failed to handle message: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      await this.completeTask(messageId);
      return;
    }

    const prepared = this.prepareReply(reply);
    if (!prepared.ok) {
      // Same isolation policy as a thrown error: log, close the task, send
      // nothing, so a buggy reply cannot fail the request or loop retries.
      this.logger.error(
        `Plugin "${plugin.name}" produced an invalid reply (${prepared.reason}); no bot message was sent`,
      );
      await this.completeTask(messageId);
      return;
    }

    // Persist the reply and close the task atomically: a crash before the
    // commit leaves the task in PROCESSING for the recovery sweep, a commit
    // guarantees exactly one reply for this message.
    const message = await this.prisma.$transaction(async (tx) => {
      const created = await tx.message.create({
        data: {
          conversationId,
          senderRole: MessageSenderRole.BOT,
          content: prepared.text,
          buttons: prepared.buttons
            ? (prepared.buttons as unknown as object)
            : undefined,
        },
      });
      await tx.botPluginTask.updateMany({
        where: { messageId, status: BotPluginTaskStatus.PROCESSING },
        data: { status: BotPluginTaskStatus.DONE },
      });
      return created;
    });

    const event: ChatEvent = {
      conversationId,
      messageId: message.id,
      senderRole: MessageSenderRole.BOT,
      content: message.content,
      createdAt: message.createdAt.toISOString(),
      buttons: prepared.buttons,
    };
    this.chatEvents.publish(event);
  }

  // --- recovery ----------------------------------------------------------

  /**
   * Reopens tasks abandoned by a crashed process (PROCESSING older than the
   * staleness threshold) and dispatches every PENDING task through the
   * regular dispatch path. Safe to run concurrently in cluster mode: each
   * task is claimed atomically by dispatchAndReply.
   */
  async runRecoverySweep(): Promise<void> {
    if (this.sweeping) {
      return;
    }
    this.sweeping = true;
    try {
      const reopened = await this.prisma.botPluginTask.updateMany({
        where: {
          status: BotPluginTaskStatus.PROCESSING,
          updatedAt: { lt: new Date(Date.now() - STALE_PROCESSING_MS) },
        },
        data: { status: BotPluginTaskStatus.PENDING },
      });

      const pending = await this.prisma.botPluginTask.findMany({
        where: { status: BotPluginTaskStatus.PENDING },
        include: { message: true },
        orderBy: { createdAt: 'asc' },
      });
      for (const task of pending) {
        await this.processPendingTask(task);
      }

      if (reopened.count > 0 || pending.length > 0) {
        this.logger.log(
          `Bot plugin recovery sweep: reopened ${reopened.count} stale task(s), dispatched ${pending.length} pending task(s)`,
        );
      }
    } catch (error) {
      this.logger.error(
        `Bot plugin recovery sweep failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    } finally {
      this.sweeping = false;
    }
  }

  /**
   * Validates and normalizes a plugin reply before anything is written:
   * a text part must be non-empty and buttons go through the same rules as
   * operator messages (`validateButtons` + `normalizeButtons`). An invalid
   * reply produces no bot message at all instead of a partial one.
   */
  private prepareReply(reply: BotPluginReply): PreparedReply {
    const { text, buttons } =
      typeof reply === 'string' ? { text: reply, buttons: undefined } : reply;

    const content = text.trim();
    if (!content) {
      return { ok: false, reason: 'reply text is empty' };
    }
    if (!buttons || buttons.length === 0) {
      return { ok: true, text: content };
    }

    try {
      validateButtons(buttons);
      return { ok: true, text: content, buttons: normalizeButtons(buttons) };
    } catch (error) {
      return {
        ok: false,
        reason: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /** Restores the dispatch context (conversation owner) and dispatches. */
  private async processPendingTask(task: PendingTask): Promise<void> {
    const message = task.message;
    if (message.senderRole !== MessageSenderRole.USER) {
      // Defensive: only user messages are plugin inputs.
      await this.closeTaskById(task.id);
      return;
    }

    const conversation = await this.prisma.conversation.findUnique({
      where: { id: message.conversationId },
    });
    const user = conversation
      ? await this.prisma.user.findUnique({
          where: { id: conversation.userId },
        })
      : null;
    if (!user) {
      // The conversation owner is gone: there is nobody to reply to.
      await this.closeTaskById(task.id);
      return;
    }

    await this.dispatchAndReply(
      message.conversationId,
      user,
      message.content,
      message.id,
      // A pressed button keeps its payload as content; the row's kind is what
      // the live dispatch path passes as source kind, so a sweep of a button
      // task reaches the same plugin the live path would have.
      message.kind === MessageKind.BUTTON ? 'BUTTON' : 'TEXT',
    );
  }

  private async closeTaskById(taskId: string): Promise<void> {
    await this.prisma.botPluginTask.updateMany({
      where: { id: taskId, status: BotPluginTaskStatus.PENDING },
      data: { status: BotPluginTaskStatus.DONE },
    });
  }

  private async completeTask(messageId: string): Promise<void> {
    await this.prisma.botPluginTask.updateMany({
      where: { messageId, status: BotPluginTaskStatus.PROCESSING },
      data: { status: BotPluginTaskStatus.DONE },
    });
  }
}
