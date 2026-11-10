import { Language } from '../generated/prisma/enums.js';

/**
 * Active-language codes accepted by the API and stored in `User.language`, in
 * display order (the default language first). Derived from the generated
 * Prisma enum, so the database domain and this list cannot drift apart.
 */
export const SUPPORTED_LANGUAGES: readonly Language[] = [
  Language.en,
  Language.ru,
];

/** Default active language for every user (see the `@default(en)` in the schema). */
export const DEFAULT_LANGUAGE: Language = Language.en;

/**
 * Normalizes a language selector to a supported code: trimmed, case
 * insensitive, so `EN`, ` en ` and `en` are all valid. Returns `null` for
 * anything outside {@link SUPPORTED_LANGUAGES} - callers decide between a 400
 * (REST profile update) and staying silent (button payload).
 */
export function normalizeLanguage(raw: unknown): Language | null {
  const code = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  return (SUPPORTED_LANGUAGES as readonly string[]).includes(code)
    ? (code as Language)
    : null;
}
