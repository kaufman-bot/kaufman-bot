import type { KeyboardButtonDto } from '../dto/keyboard.dto.js';
import type { User } from '../generated/prisma/client.js';

/**
 * Provider token collecting every registered bot plugin. Plugins are bound
 * with `{ provide: BOT_PLUGINS, useClass: ... }` multi-providers in
 * AppModule; the order of those bindings is the dispatch priority — the
 * first plugin whose canHandle matches handles the user message.
 */
export const BOT_PLUGINS = Symbol('BOT_PLUGINS');

/**
 * Where an inbound message came from: typed text or a pressed inline button
 * (whose payload arrives as the content). Mirrors `MessageKind`.
 */
export type BotPluginSourceKind = 'TEXT' | 'BUTTON';

/** Data a plugin receives when handling a user message. */
export interface BotPluginContext {
  /** The authenticated user who sent the message (includes `timezone`). */
  user: User;
  /** Message text after trimming, or the payload of the pressed button. */
  content: string;
  /** Whether `content` is typed text or a button payload. */
  kind: BotPluginSourceKind;
}

/**
 * Reply of a plugin: plain text, or text carrying an inline keyboard. Buttons
 * are validated and normalized by the dispatcher before they are stored.
 */
export type BotPluginReply =
  | string
  | {
      /** Reply text shown above the buttons. */
      text: string;
      /** Inline keyboard sent with the reply (optional). */
      buttons?: KeyboardButtonDto[];
    };

/**
 * Contract every bot plugin implements. A plugin reacts to user messages:
 * `canHandle` decides whether the plugin matches a message, `handle`
 * computes the reply that is sent to the user as a bot message.
 */
export interface BotPlugin {
  /** Human-readable plugin name used in logs. */
  readonly name: string;
  /**
   * Whether the plugin also reacts to pressed inline buttons. Absent means
   * false: button messages are never dispatched to such a plugin, which keeps
   * a button payload that collides with another plugin's trigger silent.
   */
  readonly handlesCallbacks?: boolean;
  /**
   * Whether the plugin reacts to the given (already trimmed) message of the
   * given kind. Implementations may ignore `kind` (text-only plugins).
   */
  canHandle(content: string, kind: BotPluginSourceKind): boolean;
  /** Computes the reply for a matched message. */
  handle(context: BotPluginContext): Promise<BotPluginReply> | BotPluginReply;
}
