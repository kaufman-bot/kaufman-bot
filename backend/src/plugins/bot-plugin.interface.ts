import type { User } from '../generated/prisma/client.js';

/**
 * Provider token collecting every registered bot plugin. Plugins are bound
 * with `{ provide: BOT_PLUGINS, useClass: ... }` multi-providers in
 * AppModule; the order of those bindings is the dispatch priority — the
 * first plugin whose canHandle matches handles the user message.
 */
export const BOT_PLUGINS = Symbol('BOT_PLUGINS');

/** Data a plugin receives when handling a user message. */
export interface BotPluginContext {
  /** The authenticated user who sent the message (includes `timezone`). */
  user: User;
  /** Message text after trimming. */
  content: string;
}

/**
 * Contract every bot plugin implements. A plugin reacts to user messages:
 * `canHandle` decides whether the plugin matches a message, `handle`
 * computes the reply text that is sent to the user as a bot message.
 */
export interface BotPlugin {
  /** Human-readable plugin name used in logs. */
  readonly name: string;
  /** Whether the plugin reacts to the given (already trimmed) message. */
  canHandle(content: string): boolean;
  /** Computes the reply text for a matched message. */
  handle(context: BotPluginContext): Promise<string> | string;
}
