import {
  Body,
  Controller,
  Headers,
  Param,
  Post,
  Res,
  VERSION_NEUTRAL,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import type { Update } from 'grammy/types';
import { TelegramBridgeService } from '../services/telegram-bridge.service.js';

/**
 * Public webhook receiver for Telegram Bot API updates. Routed outside API
 * versioning (`VERSION_NEUTRAL`) so the registered URL stays stable across
 * API version bumps.
 *
 * No `ApiKeyGuard` — Telegram calls this endpoint directly. Authentication
 * is handled by the `X-Telegram-Bot-Api-Secret-Token` header, verified against
 * `TelegramBot.webhookSecret` inside `TelegramBridgeService.handleUpdate`.
 */
@ApiTags('Telegram Webhook')
@Controller({ path: 'telegram/webhook', version: VERSION_NEUTRAL })
export class TelegramWebhookController {
  constructor(private readonly bridge: TelegramBridgeService) {}

  @Post(':botId')
  @ApiOperation({
    summary: 'Receive a Telegram Bot API update (public webhook)',
  })
  async receive(
    @Param('botId') botId: string,
    @Body() update: Update,
    @Headers('x-telegram-bot-api-secret-token') secret: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    const handled = await this.bridge.handleUpdate(botId, update, secret);
    if (!handled) {
      res.status(403).json({ message: 'Forbidden' });
      return;
    }
    res.status(200).json({ ok: true });
  }
}
