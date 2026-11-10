import { BadRequestException } from '@nestjs/common';
import { KeyboardButtonDto } from '../dto/keyboard.dto.js';

/** Maximum number of inline keyboard buttons per message or preset. */
export const MAX_BUTTONS = 12;

/** Maximum length of the button visible label (`title`). */
export const MAX_TITLE_LENGTH = 64;

/** Maximum length of the opaque button payload (`callbackData`). */
export const MAX_CALLBACK_LENGTH = 256;

/** Raw shape accepted by Prisma's Json column before typing. */
type RawButtonLike = {
  title?: unknown;
  callbackData?: unknown;
};

/**
 * Validates the ordered `buttons` array attached to a bot reply or a
 * preset. Throws a `BadRequestException` on the first violation so the
 * caller never persists a partially valid set. An empty array is treated
 * as "no buttons supplied" — the caller (replyAsBot / presets service)
 * decides whether that alone is acceptable given the rest of the payload.
 *
 * Rules mirrored from the specs:
 * - 1..MAX_BUTTONS items when the array is non-empty;
 * - every item is an object with non-empty trimmed `title` (≤64) and
 *   non-empty trimmed `callbackData` (≤256);
 * - unknown extra fields are ignored (server stores the canonical
 *   `{ title, callbackData }` shape only).
 */
export function validateButtons(
  buttons: unknown,
): asserts buttons is KeyboardButtonDto[] {
  if (buttons === undefined || buttons === null) {
    return;
  }
  if (!Array.isArray(buttons)) {
    throw new BadRequestException('Buttons must be an array');
  }
  if (buttons.length === 0) {
    return;
  }
  if (buttons.length > MAX_BUTTONS) {
    throw new BadRequestException(
      `Too many buttons: maximum ${MAX_BUTTONS} allowed`,
    );
  }

  buttons.forEach((raw, index) => {
    if (!raw || typeof raw !== 'object') {
      throw new BadRequestException(
        `Button #${index + 1} must be an object with title and callbackData`,
      );
    }
    const { title, callbackData } = raw as RawButtonLike;
    if (typeof title !== 'string' || title.trim().length === 0) {
      throw new BadRequestException(
        `Button #${index + 1}: title must be a non-empty string`,
      );
    }
    if (title.length > MAX_TITLE_LENGTH) {
      throw new BadRequestException(
        `Button #${index + 1}: title exceeds ${MAX_TITLE_LENGTH} characters`,
      );
    }
    if (typeof callbackData !== 'string' || callbackData.trim().length === 0) {
      throw new BadRequestException(
        `Button #${index + 1}: callbackData must be a non-empty string`,
      );
    }
    if (callbackData.length > MAX_CALLBACK_LENGTH) {
      throw new BadRequestException(
        `Button #${index + 1}: callbackData exceeds ${MAX_CALLBACK_LENGTH} characters`,
      );
    }
  });
}

/**
 * Normalises a caller-supplied `buttons` array into the canonical
 * `KeyboardButtonDto` shape (trimmed strings, no extra fields). Called
 * after `validateButtons` so the input is guaranteed well-formed.
 * Returns `undefined` when the caller supplied nothing — that keeps the
 * `Message.buttons` column null instead of an empty array.
 */
export function normalizeButtons(
  buttons: KeyboardButtonDto[] | undefined,
): KeyboardButtonDto[] | undefined {
  if (!buttons || buttons.length === 0) {
    return undefined;
  }
  return buttons.map((b) => ({
    title: b.title.trim(),
    callbackData: b.callbackData.trim(),
  }));
}

/**
 * Reads a Prisma `Json` column into a typed array of buttons. Anything
 * that does not look like `[{ title, callbackData }, ...]` yields `null`
 * so a corrupted row never crashes the console/chat UI; callers treat
 * `null` as "no buttons" and render the message without a keyboard.
 */
export function toButtons(value: unknown): KeyboardButtonDto[] | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (!Array.isArray(value) || value.length === 0) {
    return null;
  }
  const out: KeyboardButtonDto[] = [];
  for (const raw of value as RawButtonLike[]) {
    if (!raw || typeof raw !== 'object') {
      return null;
    }
    if (typeof raw.title !== 'string' || typeof raw.callbackData !== 'string') {
      return null;
    }
    out.push({ title: raw.title, callbackData: raw.callbackData });
  }
  return out;
}
