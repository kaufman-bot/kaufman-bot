import { Injectable } from '@nestjs/common';
import type { KeyboardButtonDto } from '../dto/keyboard.dto.js';
import type { User } from '../generated/prisma/client.js';
import type { Language } from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { normalizeLanguage, SUPPORTED_LANGUAGES } from '../utils/language.js';
import {
  BotPlugin,
  BotPluginContext,
  BotPluginReply,
  BotPluginSourceKind,
} from './bot-plugin.interface.js';

/** Text that opens the settings screen (case and surrounding spaces ignored). */
const TRIGGER = '/settings';

/**
 * Namespace prefix of the settings buttons. Only this plugin claims it, so a
 * payload pressed from another keyboard can never reach these handlers.
 */
const CALLBACK_PREFIX = 'settings:language:';

/** Marker prefixed to the button of the language that is currently active. */
const CURRENT_MARKER = '✓ ';

/**
 * User-facing strings of the screen, keyed by the language they are written
 * in. The reply is always rendered in the language the user ends up with: the
 * screen in the current one, the confirmation in the newly selected one, the
 * refusal in the one that stayed active.
 */
const TEXTS: Record<
  Language,
  { screen: string; changed: string; rejected: string }
> = {
  en: {
    screen: 'Settings\n\nActive language: en\n\nPress a button to change it:',
    changed: 'Language has been changed successfully.',
    rejected:
      'Unsupported language "{code}". Available languages: {supported}.',
  },
  ru: {
    screen: 'Настройки\n\nАктивный язык: ru\n\nНажмите кнопку, чтобы изменить:',
    changed: 'Язык успешно изменён.',
    rejected: 'Неподдерживаемый язык «{code}». Доступные языки: {supported}.',
  },
};

/** Placeholder of the requested language code inside the refusal text. */
const CODE_PLACEHOLDER = '{code}';

/** Placeholder filled with the supported codes, so the list lives in one place. */
const SUPPORTED_PLACEHOLDER = '{supported}';

/** Shown instead of a missing code (`settings:language:` pressed empty). */
const EMPTY_CODE_LABEL = '—';

/**
 * Button labels are language self-names and stay untranslated — a Russian
 * speaker looking for «Русский» must not have to guess the English spelling.
 */
const LANGUAGE_TITLES: Record<Language, string> = {
  en: 'English',
  ru: 'Русский',
};

/**
 * User settings screen in chat. `/settings` shows the active language with one
 * button per supported language (the current one marked); pressing a button
 * stores that language on the user profile and confirms the change in the
 * language that just became active.
 *
 * The whole `settings:language:` payload namespace belongs to this plugin, so
 * a button carrying a code we do not ship gets an explicit refusal instead of
 * silence: the profile stays untouched and the user is told, in the language
 * that stayed active, which codes exist.
 *
 * Registration order in the BOT_PLUGINS factory decides priority; this plugin
 * owns the `settings:` payload namespace and is the only one that accepts
 * button callbacks.
 */
@Injectable()
export class SettingsPlugin implements BotPlugin {
  readonly name = 'settings';

  /** This plugin is the one that reacts to pressed inline buttons. */
  readonly handlesCallbacks = true;

  constructor(private readonly prisma: PrismaService) {}

  canHandle(content: string, kind: BotPluginSourceKind): boolean {
    const value = content.trim().toLowerCase();
    if (kind === 'BUTTON') {
      // Claims the namespace regardless of the code so that a broken code is
      // answered rather than dropped; payloads of other namespaces (operator
      // presets, `ping`) stay untouched.
      return value.startsWith(CALLBACK_PREFIX);
    }
    return value === TRIGGER;
  }

  async handle(context: BotPluginContext): Promise<BotPluginReply> {
    if (context.kind === 'BUTTON') {
      return this.selectLanguage(context.user, context.content);
    }
    return {
      text: TEXTS[context.user.language].screen,
      buttons: this.languageButtons(context.user.language),
    };
  }

  /**
   * Stores the pressed language and confirms it in that language. Pressing the
   * language that is already active keeps the profile untouched (same value,
   * no write) and still answers with the confirmation, so every click the
   * plugin accepts gets an audible result.
   */
  private async selectLanguage(
    user: User,
    content: string,
  ): Promise<BotPluginReply> {
    const value = content.trim().toLowerCase();
    const language = this.parseLanguage(value);

    if (!language) {
      // A code outside the enum: nothing is written, and the refusal is a
      // regular bot reply — it reaches the user over the same channel as any
      // other answer (history + SSE, and the recovery sweep if the process
      // died before this reply was persisted).
      return {
        text: this.refusal(user.language, value.slice(CALLBACK_PREFIX.length)),
        buttons: this.languageButtons(user.language),
      };
    }

    if (language !== user.language) {
      await this.prisma.user.update({
        where: { id: user.id },
        data: { language },
      });
    }

    return {
      text: TEXTS[language].changed,
      buttons: this.languageButtons(language),
    };
  }

  /** Refusal text for an unsupported code, in the language that stays active. */
  private refusal(active: Language, code: string): string {
    return TEXTS[active].rejected
      .replace(CODE_PLACEHOLDER, code.trim() || EMPTY_CODE_LABEL)
      .replace(SUPPORTED_PLACEHOLDER, SUPPORTED_LANGUAGES.join(', '));
  }

  /** One button per supported language, the active one carrying the marker. */
  private languageButtons(active: Language): KeyboardButtonDto[] {
    return SUPPORTED_LANGUAGES.map((language) => ({
      title:
        (language === active ? CURRENT_MARKER : '') + LANGUAGE_TITLES[language],
      callbackData: `${CALLBACK_PREFIX}${language}`,
    }));
  }

  /** Language code carried by a settings payload, or null when there is none. */
  private parseLanguage(value: string): Language | null {
    if (!value.startsWith(CALLBACK_PREFIX)) {
      return null;
    }
    return normalizeLanguage(value.slice(CALLBACK_PREFIX.length));
  }
}
