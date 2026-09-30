import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from './hashPassword.js';

describe('hashPassword', () => {
  it('should return a salt:hash string in hex format', () => {
    const hashed = hashPassword('s3cret');
    const [salt, hash] = hashed.split(':');

    expect(salt).toMatch(/^[0-9a-f]{32}$/); // 16 bytes salt -> 32 hex chars
    expect(hash).toMatch(/^[0-9a-f]{128}$/); // 64 bytes hash -> 128 hex chars
  });

  it('should produce different hashes for the same password (random salt)', () => {
    const first = hashPassword('s3cret');
    const second = hashPassword('s3cret');

    expect(first).not.toBe(second);
  });

  it('should not contain the plain password in the output', () => {
    const password = 's3cret-passw0rd';
    expect(hashPassword(password)).not.toContain(password);
  });

  it('should hash empty password via "empty" fallback', () => {
    const fromUndefined = hashPassword();
    const fromNull = hashPassword(null);
    const fromEmptyString = hashPassword('');

    expect(fromUndefined).toMatch(/^[0-9a-f]{32}:[0-9a-f]{128}$/);
    // All three map to the same fallback password 'empty'
    expect(verifyPassword(null, fromUndefined)).toBe(true);
    expect(verifyPassword('', fromNull)).toBe(true);
    expect(verifyPassword(undefined, fromEmptyString)).toBe(true);
  });
});

describe('verifyPassword', () => {
  it('should return true for a correct password', () => {
    const hashed = hashPassword('s3cret');

    expect(verifyPassword('s3cret', hashed)).toBe(true);
  });

  it('should return false for an incorrect password', () => {
    const hashed = hashPassword('s3cret');

    expect(verifyPassword('wrong-password', hashed)).toBe(false);
  });

  it('should return false when stored hash is missing', () => {
    expect(verifyPassword('s3cret', null)).toBe(false);
    expect(verifyPassword('s3cret', undefined)).toBe(false);
    expect(verifyPassword('s3cret', '')).toBe(false);
  });

  it('should return false when stored hash has no hash part', () => {
    expect(verifyPassword('s3cret', 'salt-without-hash-part')).toBe(false);
    expect(verifyPassword('s3cret', 'abcdef:')).toBe(false);
  });

  it('should verify the empty-password fallback', () => {
    const hashed = hashPassword();

    expect(verifyPassword(null, hashed)).toBe(true);
    expect(verifyPassword('', hashed)).toBe(true);
    expect(verifyPassword('empty', hashed)).toBe(true);
  });

  it('should treat empty incoming password as fallback when hash was made from "empty"', () => {
    const hashed = hashPassword('empty');

    expect(verifyPassword(undefined, hashed)).toBe(true);
  });

  it('should throw on a stored hash with invalid hex (length mismatch in timingSafeEqual)', () => {
    // Known limitation: non-hex hash parts decode to a shorter buffer,
    // so timingSafeEqual raises RangeError instead of returning false.
    expect(() => verifyPassword('s3cret', 'abcdef:not-hex!')).toThrow(
      RangeError,
    );
  });
});

describe('hashPassword + verifyPassword roundtrip', () => {
  const passwords = [
    's3cret',
    'P@ssw0rd with spaces',
    'ёжик в тумане — 中文 🔑',
    'a'.repeat(1024),
  ];

  it.each(passwords)(
    'should verify a freshly hashed password %p',
    (password) => {
      expect(verifyPassword(password, hashPassword(password))).toBe(true);
    },
  );

  it('should not cross-verify between different passwords', () => {
    const hashedA = hashPassword('password-a');
    const hashedB = hashPassword('password-b');

    expect(verifyPassword('password-b', hashedA)).toBe(false);
    expect(verifyPassword('password-a', hashedB)).toBe(false);
  });
});
