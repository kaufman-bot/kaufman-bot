import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes } from 'crypto';
import { TelegramLaunchDto } from '../dto/telegram-launch.dto.js';
import { PrismaService } from '../prisma/prisma.service.js';

/** Token expiry window (minutes). */
const TOKEN_TTL_MINUTES = 30;

/**
 * Use-case service: admin assigns a Telegram-bot target to a user,
 * the user "launches" (gets a deep-link with a one-time token), and the
 * bridge service consumes that token on `/start <token>` to bind the
 * Telegram chat id.
 *
 * Separated from `TelegramBotsService` (entity-CRUD) per service-layer-split.
 */
@Injectable()
export class TelegramBindingService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Target assignment (admin side) ────────────────────────────────────

  /**
   * Assigns a Telegram bot as the user's active target (or resets to mock
   * when `telegramBotId` is null). `telegramChatId` is never cleared here —
   * an existing chat binding is preserved and can only be rebound to a
   * different chat id via the `/start <token>` flow (`consumeToken`).
   *
   * @param adminId The ADMIN making the change (ownership check).
   * @param userId The target user.
   * @param telegramBotId The bot to assign, or null to reset.
   */
  async setTarget(
    adminId: string,
    userId: string,
    telegramBotId: string | null,
  ): Promise<void> {
    if (telegramBotId !== null) {
      // Validate bot exists AND belongs to the admin.
      const bot = await this.prisma.telegramBot.findFirst({
        where: { id: telegramBotId, ownerId: adminId },
        select: { id: true },
      });
      if (!bot) {
        throw new NotFoundException('Telegram bot not found');
      }
    }

    const updated = await this.prisma.user.updateMany({
      where: { id: userId },
      data: {
        telegramBotId,
      },
    });
    if (updated.count === 0) {
      throw new NotFoundException('User not found');
    }
  }

  // ─── Launch (user side) ────────────────────────────────────────────────

  /**
   * Generates a deep-link for the user to start a Telegram conversation.
   * Only valid when the user's active target is a bot (not mock).
   * Returns the absolute `https://t.me/<username>?start=<token>` URL (the scheme
   * is required: the frontend hands it to `window.open`) and the raw token.
   */
  async launch(userId: string): Promise<TelegramLaunchDto> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { telegramBotId: true },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    if (!user.telegramBotId) {
      throw new BadRequestException(
        'Cannot launch: user target is mock-server (no bot assigned)',
      );
    }

    const bot = await this.prisma.telegramBot.findUnique({
      where: { id: user.telegramBotId },
      select: { botUsername: true },
    });
    if (!bot?.botUsername) {
      throw new BadRequestException(
        'Cannot launch: bot has no username configured',
      );
    }

    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + TOKEN_TTL_MINUTES * 60_000);

    await this.prisma.telegramBindingToken.create({
      data: {
        token,
        userId,
        telegramBotId: user.telegramBotId,
        expiresAt,
      },
    });

    const url = `https://t.me/${bot.botUsername}?start=${token}`;
    return new TelegramLaunchDto({ url, token });
  }

  // ─── Token consumption (bridge /start handler) ────────────────────────

  /**
   * Idempotently consumes a binding token triggered by `/start <token>`
   * from Telegram. Validates existence, freshness, and non-use. Sets the
   * user's `telegramChatId` on success.
   *
   * @returns true when the token was valid and chat was bound.
   */
  async consumeToken(token: string, chatId: string): Promise<boolean> {
    const row = await this.prisma.telegramBindingToken.findUnique({
      where: { token },
    });

    // Token not found or already used.
    if (!row || row.usedAt) {
      return false;
    }

    // Token expired.
    if (row.expiresAt < new Date()) {
      return false;
    }

    // Mark as used and bind the chat id atomically.
    await this.prisma.$transaction([
      this.prisma.telegramBindingToken.update({
        where: { id: row.id },
        data: { usedAt: new Date() },
      }),
      this.prisma.user.update({
        where: { id: row.userId },
        data: { telegramChatId: chatId },
      }),
    ]);

    return true;
  }
}
