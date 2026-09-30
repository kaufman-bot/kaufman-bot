import { describe, expect, it } from 'vitest';
import { API_KEY_PREFIX, generateApiKey } from './generateApiKey.js';

describe('generateApiKey', () => {
  it('returns a key with the sk- prefix', () => {
    expect(generateApiKey().startsWith(API_KEY_PREFIX)).toBe(true);
  });

  it('returns sk- followed by 40 hex characters', () => {
    expect(generateApiKey()).toMatch(/^sk-[0-9a-f]{40}$/);
  });

  it('produces unique values', () => {
    const keys = new Set(Array.from({ length: 200 }, () => generateApiKey()));
    expect(keys.size).toBe(200);
  });
});
