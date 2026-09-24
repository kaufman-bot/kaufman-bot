import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

export function hashPassword(password?: string | null): string {
  if (!password) {
    password = 'empty';
  }
  const salt = randomBytes(16).toString('hex');
  const hashed = scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hashed}`;
}

export function verifyPassword(
  password?: string | null,
  storedHash?: string | null,
): boolean {
  if (!password) {
    password = 'empty';
  }
  if (!storedHash) {
    return false;
  }
  const [salt, hash] = storedHash.split(':');
  const buffer = scryptSync(password, salt, 64);
  return hash ? timingSafeEqual(buffer, Buffer.from(hash, 'hex')) : false;
}
