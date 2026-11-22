/**
 * Identity-based coloring for chat bubbles, shared by `/chat` and `/mock-bot`.
 *
 * Channel badges name the exact transport in words; the bubble color is
 * derived from WHO the message belongs to (a Telegram bot or a console
 * operator), so replies delivered through two different bots stay visually
 * distinguishable even when the badge text is not read. The hue is a
 * deterministic hash of the identity key: the same bot always gets the same
 * color across both screens, sessions and history reloads.
 */

/** Channel snapshot fields mirrored from the backend message DTO. */
export interface ChannelSnapshot {
  senderRole: 'USER' | 'BOT';
  channel: 'WEB' | 'TELEGRAM' | null;
  botName: string | null;
  operatorEmail: string | null;
  /**
   * Channels a BOT reply was delivered to (design D3: snapshot TELEGRAM =
   * dual delivery). Absent on payloads recorded before the field existed —
   * those keep the legacy channel-snapshot wording.
   */
  deliveredTo?: Array<'WEB' | 'TELEGRAM'> | null;
}

/** Screen the badge is rendered on; only the wording differs. */
export type ChannelPerspective = 'chat' | 'console';

/**
 * Number of palette slots; the identity hash picks one of them. The
 * `.msg-identity-0` .. `.msg-identity-7` classes themselves live in the
 * global `styles.css` (AOT cannot resolve imported constants in component
 * `styles`), so the count must match the palette defined there.
 */
export const IDENTITY_PALETTE_SIZE = 8;

/**
 * Identity key the color is derived from:
 *   - USER — where the user wrote from: the Telegram bot, or no key for the
 *     web chat;
 *   - BOT — who answered: the console operator, else the delivering bot,
 *     else no key (a plugin reply delivered to the web chat).
 */
export function identityKeyOf(message: ChannelSnapshot): string | null {
  const botName = message.botName?.trim();
  const operatorEmail = message.operatorEmail?.trim();

  if (message.senderRole === 'USER') {
    return message.channel === 'TELEGRAM' && botName ? `bot:${botName}` : null;
  }
  if (operatorEmail) {
    return `operator:${operatorEmail}`;
  }
  return message.channel === 'TELEGRAM' && botName ? `bot:${botName}` : null;
}

/** Modifier class for a message bubble; empty when it has no identity. */
export function identityClassOf(message: ChannelSnapshot): string {
  const key = identityKeyOf(message);
  if (!key) {
    return '';
  }
  return `msg-identity-${hashIdentity(key) % IDENTITY_PALETTE_SIZE}`;
}

/**
 * Badge under a message: where the user wrote from, or where the reply was
 * delivered. `null` means "recorded before the channel snapshot" or — for a
 * BOT reply in the user chat — "web-only delivery, nothing extra to show":
 * web delivery is unconditional, so the chat only marks the additional
 * Telegram copy. The console instead always names the delivery channels
 * from `deliveredTo` («веб» / «веб + Telegram», with the bot name when the
 * snapshot knows it).
 */
export function channelBadgeOf(
  message: ChannelSnapshot,
  perspective: ChannelPerspective,
): string | null {
  if (message.senderRole === 'USER') {
    if (message.channel === null) {
      return null;
    }
    const telegram = message.botName?.trim()
      ? `Telegram · ${message.botName.trim()}`
      : 'Telegram';
    const channel = message.channel === 'TELEGRAM' ? telegram : null;
    const prefix = perspective === 'chat' ? 'отправлено из' : 'из';
    return `${prefix} ${channel ?? 'веб-чата'}`;
  }

  const botName = message.botName?.trim();
  const deliveredTo = message.deliveredTo?.length ? message.deliveredTo : null;
  if (deliveredTo) {
    if (perspective === 'chat') {
      return deliveredTo.includes('TELEGRAM') ? 'доставлено в Telegram' : null;
    }
    const base = deliveredTo.includes('TELEGRAM')
      ? 'доставлено в веб + Telegram'
      : 'доставлено в веб';
    return botName ? `${base} · ${botName}` : base;
  }

  // Legacy payload without deliveredTo: fall back to the channel snapshot.
  if (message.channel === null) {
    return null;
  }
  const telegram = message.botName?.trim()
    ? `Telegram · ${message.botName.trim()}`
    : 'Telegram';
  const channel = message.channel === 'TELEGRAM' ? telegram : null;
  return `доставлено в ${channel ?? 'веб-чат'}`;
}

/** Sender caption: `USER` is the reader (`/chat`) or the client (console). */
export function senderLabelOf(
  message: ChannelSnapshot,
  perspective: ChannelPerspective,
): string {
  if (message.senderRole === 'USER') {
    return perspective === 'chat' ? 'Вы' : 'Пользователь';
  }
  return message.operatorEmail?.trim() || 'Бот';
}

/** Deterministic hash: same key → same color, everywhere. */
function hashIdentity(key: string): number {
  let hash = 0;
  for (let index = 0; index < key.length; index += 1) {
    hash = (Math.imul(hash, 31) + key.charCodeAt(index)) >>> 0;
  }
  return hash;
}
