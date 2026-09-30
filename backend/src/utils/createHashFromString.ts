import { createHash } from 'node:crypto';

export const createHashFromString = (str: string) =>
  createHash('sha256').update(str).digest('hex');
