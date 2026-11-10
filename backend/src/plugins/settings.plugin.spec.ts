import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { User } from '../generated/prisma/client.js';
import type { Language } from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  BotPluginContext,
  BotPluginSourceKind,
} from './bot-plugin.interface.js';
import { SettingsPlugin } from './settings.plugin.js';

const makeUser = (language: Language = 'en') =>
  ({ id: 'user-1', language }) as User;

const context = (
  content: string,
  kind: BotPluginSourceKind = 'TEXT',
  language: Language = 'en',
): BotPluginContext => ({ user: makeUser(language), content, kind });

describe('SettingsPlugin', () => {
  let userUpdate: ReturnType<typeof vi.fn>;
  let plugin: SettingsPlugin;

  beforeEach(() => {
    userUpdate = vi.fn();
    plugin = new SettingsPlugin({
      user: { update: userUpdate },
    } as unknown as PrismaService);
  });

  describe('canHandle', () => {
    it('matches /settings regardless of case and surrounding spaces', () => {
      expect(plugin.canHandle('/settings', 'TEXT')).toBe(true);
      expect(plugin.canHandle('  /SETTINGS  ', 'TEXT')).toBe(true);
    });

    it('does not match partial or decorated text', () => {
      expect(plugin.canHandle('settings', 'TEXT')).toBe(false);
      expect(plugin.canHandle('мои настройки', 'TEXT')).toBe(false);
      expect(plugin.canHandle('/settings?', 'TEXT')).toBe(false);
      expect(plugin.canHandle('/settings extra', 'TEXT')).toBe(false);
    });

    it('claims the whole settings:language: namespace and nothing else', () => {
      expect(plugin.canHandle('settings:language:ru', 'BUTTON')).toBe(true);
      expect(plugin.canHandle('settings:language:en', 'BUTTON')).toBe(true);
      // A code outside the enum is still this plugin's payload: it must be
      // answered with a refusal instead of being dropped by the dispatcher.
      expect(plugin.canHandle('settings:language:de', 'BUTTON')).toBe(true);
      expect(plugin.canHandle('settings:language:', 'BUTTON')).toBe(true);
      expect(plugin.canHandle('settings:language:123', 'BUTTON')).toBe(true);
      expect(plugin.canHandle('settings:language:ru,en', 'BUTTON')).toBe(true);
      // Other namespaces are not ours, whatever they look like.
      expect(plugin.canHandle('settings:lang:en', 'BUTTON')).toBe(false);
      expect(plugin.canHandle('settings:language', 'BUTTON')).toBe(false);
      expect(plugin.canHandle('ping', 'BUTTON')).toBe(false);
      expect(plugin.canHandle('presets:123', 'BUTTON')).toBe(false);
    });

    it('never treats the screen command as a button payload', () => {
      expect(plugin.canHandle('/settings', 'BUTTON')).toBe(false);
    });
  });

  describe('settings screen', () => {
    it('shows the active language and both buttons in English by default', async () => {
      const reply = await plugin.handle(context('/settings'));

      expect(reply).toEqual({
        text: expect.stringContaining('en'),
        buttons: [
          { title: '✓ English', callbackData: 'settings:language:en' },
          { title: 'Русский', callbackData: 'settings:language:ru' },
        ],
      });
      // Reading the screen must not write anything.
      expect(userUpdate).not.toHaveBeenCalled();
    });

    it('is written in Russian and marks the Russian button when ru is active', async () => {
      const reply = await plugin.handle(context('/settings', 'TEXT', 'ru'));

      expect(reply).toEqual({
        text: expect.stringContaining('Активный язык: ru'),
        buttons: [
          { title: 'English', callbackData: 'settings:language:en' },
          { title: '✓ Русский', callbackData: 'settings:language:ru' },
        ],
      });
    });
  });

  describe('language change', () => {
    it('stores the pressed language and confirms in the new one', async () => {
      const reply = await plugin.handle(
        context('settings:language:ru', 'BUTTON', 'en'),
      );

      expect(userUpdate).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { language: 'ru' },
      });
      expect(reply).toEqual({
        text: 'Язык успешно изменён.',
        buttons: [
          { title: 'English', callbackData: 'settings:language:en' },
          { title: '✓ Русский', callbackData: 'settings:language:ru' },
        ],
      });
    });

    it('confirms in English when switching back', async () => {
      const reply = await plugin.handle(
        context('settings:language:en', 'BUTTON', 'ru'),
      );

      expect(userUpdate).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { language: 'en' },
      });
      expect(reply).toEqual({
        text: 'Language has been changed successfully.',
        buttons: [
          { title: '✓ English', callbackData: 'settings:language:en' },
          { title: 'Русский', callbackData: 'settings:language:ru' },
        ],
      });
    });

    it('leaves the profile untouched but still confirms when the language is already active', async () => {
      const reply = await plugin.handle(
        context('settings:language:ru', 'BUTTON', 'ru'),
      );

      expect(userUpdate).not.toHaveBeenCalled();
      expect(reply).toMatchObject({ text: 'Язык успешно изменён.' });
    });

    it('accepts a payload with extra spaces or uppercase', async () => {
      const reply = await plugin.handle(
        context(' SETTINGS:LANGUAGE:RU ', 'BUTTON', 'en'),
      );

      expect(userUpdate).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { language: 'ru' },
      });
      expect(reply).toMatchObject({ text: 'Язык успешно изменён.' });
    });

    it('refuses an unsupported code with a reply and writes nothing', async () => {
      const reply = await plugin.handle(
        context('settings:language:de', 'BUTTON', 'en'),
      );

      expect(reply).toEqual({
        text: 'Unsupported language "de". Available languages: en, ru.',
        buttons: [
          { title: '✓ English', callbackData: 'settings:language:en' },
          { title: 'Русский', callbackData: 'settings:language:ru' },
        ],
      });
      expect(userUpdate).not.toHaveBeenCalled();
    });

    it('refuses in the language that stays active, not in the requested one', async () => {
      const reply = await plugin.handle(
        context('settings:language:de', 'BUTTON', 'ru'),
      );

      expect(reply).toEqual({
        text: 'Неподдерживаемый язык «de». Доступные языки: en, ru.',
        buttons: [
          { title: 'English', callbackData: 'settings:language:en' },
          { title: '✓ Русский', callbackData: 'settings:language:ru' },
        ],
      });
      expect(userUpdate).not.toHaveBeenCalled();
    });

    it('answers every malformed code of the namespace instead of throwing', async () => {
      // No branch here may write a language or fail the plugin: an exception
      // would be swallowed by the dispatcher and leave the user with silence.
      const cases = [
        ['settings:language:de', '"de"'],
        ['  SETTINGS:LANGUAGE:DE  ', '"de"'],
        ['settings:language:', '"—"'],
        ['settings:language:123', '"123"'],
        ['settings:language:ru,en', '"ru,en"'],
        ['settings:language:russian', '"russian"'],
      ] as const;

      for (const [content, expectedCode] of cases) {
        const reply = await plugin.handle(context(content, 'BUTTON', 'en'));

        // The object form is what the dispatcher persists: text + keyboard.
        expect(reply, content).toMatchObject({
          text: expect.stringContaining(`Unsupported language ${expectedCode}`),
          buttons: [expect.any(Object), expect.any(Object)],
        });
      }

      expect(userUpdate).not.toHaveBeenCalled();
    });
  });
});
