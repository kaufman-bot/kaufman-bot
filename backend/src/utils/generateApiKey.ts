import { randomBytes } from 'node:crypto';

/** Prefix of every issued API key. */
export const API_KEY_PREFIX = 'sk-';

/**
 * Generates a random API key (`sk-` + 40 hex chars). The value is revealed
 * once in the create/register response and is stored verbatim — ApiKeyGuard
 * looks keys up by their literal value.
 */
export const generateApiKey = (): string =>
  `${API_KEY_PREFIX}${randomBytes(20).toString('hex')}`;
