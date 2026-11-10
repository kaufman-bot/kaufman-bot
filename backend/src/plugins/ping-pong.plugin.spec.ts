import { describe, expect, it } from 'vitest';
import type { User } from '../generated/prisma/client.js';
import { PingPongPlugin } from './ping-pong.plugin.js';

describe('PingPongPlugin', () => {
  const plugin = new PingPongPlugin();

  it('matches "ping" case-insensitively with surrounding spaces', () => {
    expect(plugin.canHandle('ping')).toBe(true);
    expect(plugin.canHandle('PING')).toBe(true);
    expect(plugin.canHandle('Ping')).toBe(true);
    expect(plugin.canHandle('  PING  ')).toBe(true);
  });

  it('does not match other messages', () => {
    expect(plugin.canHandle('ping pong')).toBe(false);
    expect(plugin.canHandle('пинг')).toBe(false);
    expect(plugin.canHandle('ping!')).toBe(false);
    expect(plugin.canHandle('')).toBe(false);
  });

  it('replies with "pong"', async () => {
    const reply = await plugin.handle({
      user: { id: 'user-1' } as User,
      content: 'ping',
      kind: 'TEXT' as const,
    });
    expect(reply).toBe('pong');
  });
});
