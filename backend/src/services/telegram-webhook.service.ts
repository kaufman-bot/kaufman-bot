import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Bot } from 'grammy';
import { PrismaService } from '../prisma/prisma.service.js';

/**
 * Infrastructure service responsible for registering and unregistering
 * Telegram webhooks. Completely decoupled from CRUD logic (service-layer-split):
 * the controller orchestrates calls here after bots-service mutations.
 *
 * Every method is best-effort — errors are logged but never thrown into the
 * startup sequence or an HTTP response. When TELEGRAM_WEBHOOK_BASE_URL is
 * empty or unset, all operations are skipped with a single warn.
 */
@Injectable()
export class TelegramWebhookService implements OnApplicationBootstrap {
  private readonly logger = new Logger(TelegramWebhookService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * On application start, iterate all active bots and attempt webhook
   * registration for each. Fire-and-forget per bot so one slow/failing token
   * doesn't block others or the bootstrap sequence.
   */
  async onApplicationBootstrap(): Promise<void> {
    const base = process.env.TELEGRAM_WEBHOOK_BASE_URL;
    if (!base) {
      this.logger.warn(
        'TELEGRAM_WEBHOOK_BASE_URL is not set — webhook registration skipped',
      );
      return;
    }

    const bots = await this.prisma.telegramBot.findMany({
      where: { isActive: true },
      select: { id: true, botToken: true, webhookSecret: true },
    });

    for (const bot of bots) {
      // Fire-and-forget: don't await so a single slow call doesn't delay start.
      void this.syncById(bot.id);
    }
  }

  /**
   * Synchronize webhook state for a given bot id. If the bot is active,
   * registers the webhook; if inactive, removes it. Silently skips if the bot
   * no longer exists or the base URL is not configured.
   */
  async syncById(botId: string): Promise<void> {
    const base = process.env.TELEGRAM_WEBHOOK_BASE_URL;
    if (!base) return;

    const row = await this.prisma.telegramBot.findUnique({
      where: { id: botId },
      select: { botToken: true, webhookSecret: true, isActive: true },
    });
    if (!row) return;

    try {
      if (row.isActive) {
        const url = `${base}/api/telegram/webhook/${botId}`;
        const bot = this.createBot(row.botToken);
        await bot.api.setWebhook(url, {
          secret_token: row.webhookSecret,
        });
        this.logger.log(`Webhook set for bot ${botId}`);
      } else {
        const bot = this.createBot(row.botToken);
        await bot.api.deleteWebhook();
        this.logger.log(`Webhook deleted for inactive bot ${botId}`);
      }
    } catch (err: unknown) {
      this.logger.error(
        `Webhook sync failed for bot ${botId}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  /**
   * Unregister the webhook for a bot identified by its raw token.
   * Used after a bot is deleted (the row is gone, but Telegram still has the
   * webhook pointing to our server).
   */
  async unregisterByToken(botToken: string): Promise<void> {
    const base = process.env.TELEGRAM_WEBHOOK_BASE_URL;
    if (!base) return;

    try {
      const bot = this.createBot(botToken);
      await bot.api.deleteWebhook();
    } catch (err: unknown) {
      this.logger.error(
        `Webhook unregister failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  /**
   * Factory method that creates a grammy Bot instance. Exposed as a
   * protected/overridable method so tests can spy or replace it without
   * mocking the grammy module itself.
   */
  protected createBot(token: string): Bot {
    return new Bot(token);
  }
}
