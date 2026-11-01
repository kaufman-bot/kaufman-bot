import { Injectable } from '@nestjs/common';
import { BotPlugin, BotPluginContext } from './bot-plugin.interface.js';

/** Echo plugin: replies "pong" to a "ping" message. */
@Injectable()
export class PingPongPlugin implements BotPlugin {
  readonly name = 'ping-pong';

  canHandle(content: string): boolean {
    return content.trim().toLowerCase() === 'ping';
  }

  handle(_context: BotPluginContext): string {
    return 'pong';
  }
}
