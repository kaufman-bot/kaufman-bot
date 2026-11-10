import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import {
  MAX_BUTTONS,
  MAX_CALLBACK_LENGTH,
  MAX_TITLE_LENGTH,
  normalizeButtons,
  toButtons,
  validateButtons,
} from './keyboard-buttons.js';

const mkButton = (
  title = 'Да',
  callbackData = 'confirm',
): { title: string; callbackData: string } => ({ title, callbackData });

describe('keyboard-buttons validator', () => {
  describe('validateButtons', () => {
    it('accepts undefined / null (treated as "no buttons supplied")', () => {
      expect(() => validateButtons(undefined)).not.toThrow();
      expect(() => validateButtons(null)).not.toThrow();
    });

    it('accepts an empty array (the caller decides whether it is enough)', () => {
      expect(() => validateButtons([])).not.toThrow();
    });

    it('accepts a well-formed set within the limit', () => {
      const buttons = Array.from({ length: MAX_BUTTONS }, (_, i) =>
        mkButton(`b${i}`, `cb${i}`),
      );
      expect(() => validateButtons(buttons)).not.toThrow();
    });

    it('rejects a non-array value', () => {
      expect(() => validateButtons('nope' as unknown)).toThrow(
        BadRequestException,
      );
      expect(() => validateButtons({} as unknown)).toThrow(BadRequestException);
    });

    it(`rejects when the array exceeds MAX_BUTTONS (${MAX_BUTTONS})`, () => {
      const tooMany = Array.from({ length: MAX_BUTTONS + 1 }, () => mkButton());
      expect(() => validateButtons(tooMany)).toThrow(BadRequestException);
    });

    it('rejects a non-object entry', () => {
      expect(() => validateButtons(['oops' as unknown])).toThrow(
        BadRequestException,
      );
    });

    it('rejects an empty or whitespace-only title', () => {
      expect(() => validateButtons([mkButton('', 'cb')])).toThrow(
        BadRequestException,
      );
      expect(() => validateButtons([mkButton('   ', 'cb')])).toThrow(
        BadRequestException,
      );
    });

    it(`rejects a title longer than MAX_TITLE_LENGTH (${MAX_TITLE_LENGTH})`, () => {
      const long = 'a'.repeat(MAX_TITLE_LENGTH + 1);
      expect(() => validateButtons([mkButton(long, 'cb')])).toThrow(
        BadRequestException,
      );
    });

    it('rejects an empty or whitespace-only callbackData', () => {
      expect(() => validateButtons([mkButton('ok', '')])).toThrow(
        BadRequestException,
      );
      expect(() => validateButtons([mkButton('ok', '   ')])).toThrow(
        BadRequestException,
      );
    });

    it(`rejects a callbackData longer than MAX_CALLBACK_LENGTH (${MAX_CALLBACK_LENGTH})`, () => {
      const long = 'b'.repeat(MAX_CALLBACK_LENGTH + 1);
      expect(() => validateButtons([mkButton('ok', long)])).toThrow(
        BadRequestException,
      );
    });

    it('rejects a title of wrong type', () => {
      expect(() =>
        validateButtons([{ title: 42, callbackData: 'cb' } as unknown]),
      ).toThrow(BadRequestException);
    });
  });

  describe('normalizeButtons', () => {
    it('returns undefined when input is empty or nullish', () => {
      expect(normalizeButtons(undefined)).toBeUndefined();
      expect(normalizeButtons([])).toBeUndefined();
    });

    it('trims and strips unknown extra fields from every entry', () => {
      const input = [
        {
          title: '  Да  ',
          callbackData: '  confirm  ',
          extra: 'ignored',
        },
      ];
      expect(normalizeButtons(input)).toEqual([
        { title: 'Да', callbackData: 'confirm' },
      ]);
    });

    it('preserves order', () => {
      const input = [
        mkButton('one', 'cb1'),
        mkButton('two', 'cb2'),
        mkButton('three', 'cb3'),
      ];
      expect(normalizeButtons(input)).toEqual([
        { title: 'one', callbackData: 'cb1' },
        { title: 'two', callbackData: 'cb2' },
        { title: 'three', callbackData: 'cb3' },
      ]);
    });
  });

  describe('toButtons', () => {
    it('returns null for null / undefined / non-array inputs', () => {
      expect(toButtons(null)).toBeNull();
      expect(toButtons(undefined)).toBeNull();
      expect(toButtons({})).toBeNull();
      expect(toButtons('string')).toBeNull();
    });

    it('returns null for an empty array (nothing to render)', () => {
      expect(toButtons([])).toBeNull();
    });

    it('returns null if any entry is missing a valid title/callbackData', () => {
      expect(toButtons([{ title: 'ok' }])).toBeNull();
      expect(toButtons([{ callbackData: 'ok' }])).toBeNull();
      expect(toButtons([{ title: 42, callbackData: 'ok' }])).toBeNull();
      expect(toButtons('not an object')).toBeNull();
    });

    it('passes through a well-formed array (drops extra fields)', () => {
      const value = [
        { title: 'one', callbackData: 'cb1', extra: 'ignored' },
        { title: 'two', callbackData: 'cb2' },
      ];
      expect(toButtons(value)).toEqual([
        { title: 'one', callbackData: 'cb1' },
        { title: 'two', callbackData: 'cb2' },
      ]);
    });
  });
});
