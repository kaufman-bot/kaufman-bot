import { describe, expect, it } from 'vitest';
import { createHashFromString } from './createHashFromString.js';

/** SHA-256 digests published for these inputs (known-answer vectors). */
const EMPTY =
  'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
const ABC = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad';
const SPACE =
  '36a9e7f1c95b82ffb99743e0c5c4ce95d83c9a430aac59f84ef3cbfab6145068';
const KAUFMAN_BOT =
  '28fb0f0f0d0eadfefe75fd0c5a164e4cc8fbf5e41d523da60b45fccb68bc8e93';
const UTF8 = 'bf0dcb2f76a7f67eb2aba391afa78de61b9c7f20fff398a955b61e587cdd065a';
const THOUSAND_A =
  '41edece42d63e8d9bf515a9ba6932e1c20cbc9f5a5d134645adb5db1b9737ea3';

/** A 256 bit digest rendered as lowercase hex. */
const HEX_64 = /^[0-9a-f]{64}$/;

describe('createHashFromString', () => {
  it('returns the SHA-256 digest of the input as lowercase hex', () => {
    expect(createHashFromString('')).toBe(EMPTY);
    expect(createHashFromString('abc')).toBe(ABC);
    expect(createHashFromString('kaufman-bot')).toBe(KAUFMAN_BOT);
  });

  it('always produces 64 hex characters, whatever the input size', () => {
    for (const value of ['', 'a', 'abc', 'kaufman-bot', ' '.repeat(5_000)]) {
      const digest = createHashFromString(value);

      expect(digest).toMatch(HEX_64);
      expect(digest).toHaveLength(64);
    }
  });

  it('is deterministic: the same input hashes to the same digest', () => {
    const first = createHashFromString('sk-admin-default-key-change-me');

    expect(createHashFromString('sk-admin-default-key-change-me')).toBe(first);
    expect(createHashFromString('sk-admin-default-key-change-me')).toBe(first);
  });

  it('neither trims nor case-folds the input', () => {
    expect(createHashFromString(' ')).toBe(SPACE);
    expect(createHashFromString('a ')).not.toBe(createHashFromString('a'));
    expect(createHashFromString('A')).not.toBe(createHashFromString('a'));
  });

  it('spreads a single-character change over the whole digest', () => {
    const before = createHashFromString('user-1@example.com');
    const after = createHashFromString('user-2@example.com');
    let changed = 0;

    for (let index = 0; index < 64; index++) {
      if (before[index] !== after[index]) {
        changed++;
      }
    }

    expect(changed).toBeGreaterThan(20);
  });

  it('hashes the UTF-8 bytes of non-ASCII input', () => {
    expect(createHashFromString('привет 🌍')).toBe(UTF8);
  });

  it('hashes input longer than one SHA-256 block', () => {
    expect(createHashFromString('a'.repeat(1_000))).toBe(THOUSAND_A);
  });

  it('gives a distinct digest to similar inputs', () => {
    const digests = new Set(
      Array.from({ length: 500 }, (_, index) =>
        createHashFromString(`seed-${index}`),
      ),
    );

    expect(digests.size).toBe(500);
  });
});
