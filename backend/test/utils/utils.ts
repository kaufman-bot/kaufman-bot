import { randomUUID } from 'node:crypto';
import { createHashFromString } from '../../src/utils/createHashFromString.js';

export const getRandomSha7 = () =>
  createHashFromString(Date.now().toString() + randomUUID().toString()).slice(
    0,
    7,
  );
