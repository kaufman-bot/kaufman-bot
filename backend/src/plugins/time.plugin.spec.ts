import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { User } from '../generated/prisma/client.js';
import { TimePlugin } from './time.plugin.js';

describe('TimePlugin', () => {
  const plugin = new TimePlugin();

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-01T09:30:45Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('matches only the exact "time" command', () => {
    expect(plugin.canHandle('time')).toBe(true);
    expect(plugin.canHandle('  TIME ')).toBe(true);
    expect(plugin.canHandle('what time is it')).toBe(false);
    expect(plugin.canHandle('тайм')).toBe(false);
    expect(plugin.canHandle('time?')).toBe(false);
  });

  it('replies with the server time in the user time zone', async () => {
    const reply = await plugin.handle({
      user: { timezone: 'Europe/Moscow' } as User,
      content: 'time',
    });
    expect(reply).toBe('2026-11-01 12:30:45 (Europe/Moscow)');
  });

  it('falls back to UTC when the user has no time zone', async () => {
    const reply = await plugin.handle({
      user: { timezone: null } as User,
      content: 'time',
    });
    expect(reply).toBe('2026-11-01 09:30:45 (UTC)');
  });
});
