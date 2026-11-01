import { Injectable } from '@nestjs/common';
import { BotPlugin, BotPluginContext } from './bot-plugin.interface.js';

/** Date formatter producing YYYY-MM-DD in the requested time zone. */
const dateFormatter = (timeZone: string) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

/** Time formatter producing HH:mm:ss (24h) in the requested time zone. */
const timeFormatter = (timeZone: string) =>
  new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });

/** Time plugin: replies with the current server time in the user's time zone. */
@Injectable()
export class TimePlugin implements BotPlugin {
  readonly name = 'time';

  canHandle(content: string): boolean {
    return content.trim().toLowerCase() === 'time';
  }

  handle({ user }: BotPluginContext): string {
    const timeZone = user.timezone ?? 'UTC';
    const now = new Date();
    const date = dateFormatter(timeZone).format(now);
    const time = timeFormatter(timeZone).format(now);
    return `${date} ${time} (${timeZone})`;
  }
}
