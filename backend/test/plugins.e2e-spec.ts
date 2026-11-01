import { lastValueFrom, take, toArray } from 'rxjs';
import type {
  ChatControllerStreamEventsV1Data,
  ChatMessageDto,
  ChatStreamEventDto,
} from './generated/client/types.gen.js';
import { ActivityHelper } from './utils/activity-helper.js';
import { unwrap } from './utils/api-result.js';

/** Chat SSE endpoint (authenticated with the presented key like REST). */
const CHAT_STREAM_URL: ChatControllerStreamEventsV1Data['url'] =
  '/api/v1/chat/stream';

/** Reply shape of the time plugin: `YYYY-MM-DD HH:mm:ss (<zone>)`. */
const TIME_REPLY = (zone: string): RegExp =>
  new RegExp(`^\\d{4}-\\d{2}-\\d{2} \\d{2}:\\d{2}:\\d{2} \\(${zone}\\)$`);

/**
 * Parses the `YYYY-MM-DD HH:mm:ss` stamp of a time-plugin reply as wall-clock
 * time in a fixed UTC offset (Europe/Moscow is +03:00 year-round, UTC is Z)
 * and asserts it is close to the local "now" of this process.
 */
const expectCloseToNow = (reply: string, offset: '+03:00' | 'Z'): void => {
  const stamp = reply.slice(0, 19).replace(' ', 'T');
  const parsed = new Date(`${stamp}${offset}`);
  expect(Number.isNaN(+parsed)).toBe(false);
  expect(Math.abs(+new Date() - +parsed)).toBeLessThan(120_000);
};

/** Lets an SSE subscription reach the server before events are triggered. */
const sleep = (ms: number): Promise<void> =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Bot plugin dispatch (e2e, running backend): plugins react to exact user
 * messages (`ping` → `pong`, `time` → current time in the user's time zone),
 * their replies are persisted as BOT messages and delivered over the chat
 * SSE stream. Non-matching messages and operator mock-bot replies never
 * reach the plugins.
 */
describe('Bot plugins (e2e, running backend)', () => {
  const user = new ActivityHelper();
  const admin = new ActivityHelper();

  /** Every account created here is removed by the admin endpoint afterwards. */
  const createdUsers: string[] = [];

  beforeAll(async () => {
    await user.ensureBackendRunning();
    admin.loginAsAdmin();
  });

  afterAll(async () => {
    admin.loginAsAdmin();
    for (const id of createdUsers) {
      await admin.removeAccountAsAdmin(id);
    }
  });

  /** Registers a fresh account and presents its key (re-bound per test). */
  const registerUser = async (label: string): Promise<string> => {
    const registered = await user.registerAccount(
      `test_${user.randomSha7}_${label}@example.com`,
    );
    createdUsers.push(registered.user.id);
    user.loginByApiKey(registered.apiKey.key);
    return registered.user.id;
  };

  const send = async (content: string): Promise<ChatMessageDto> =>
    unwrap(
      await user.sdk.chatControllerSendMessageV1({ body: { content } }),
      `POST /chat/messages (${content})`,
    );

  const history = async (): Promise<ChatMessageDto[]> =>
    unwrap(
      await user.sdk.chatControllerGetMessagesV1({}),
      'GET /chat/messages',
    );

  it('replies pong to ping and PING and stores both replies in history', async () => {
    await registerUser('ping');

    await send('ping');
    await send('PING');

    expect(
      (await history()).map((m) => `${m.senderRole}:${m.content}`),
    ).toEqual(['USER:ping', 'BOT:pong', 'USER:PING', 'BOT:pong']);
  });

  it('delivers the pong reply over the chat SSE stream', async () => {
    await registerUser('ping_sse');

    const eventsPromise = lastValueFrom(
      user
        .sse<ChatStreamEventDto>({ url: CHAT_STREAM_URL })
        .pipe(take(2), toArray()),
    );
    // The event bus is hot: let the subscription reach the server first.
    await sleep(500);
    await send('ping');

    const events = await eventsPromise;
    expect(events.map((e) => `${e.senderRole}:${e.content}`)).toEqual([
      'USER:ping',
      'BOT:pong',
    ]);
  });

  it('does not reply to ping pong or ping! (exact matching)', async () => {
    await registerUser('ping_nomatch');

    await send('ping pong');
    await send('ping!');

    expect(
      (await history()).map((m) => `${m.senderRole}:${m.content}`),
    ).toEqual(['USER:ping pong', 'USER:ping!']);
  });

  it('replies with the time in the time zone stored via PATCH /auth/me', async () => {
    await registerUser('time_msk');
    unwrap(
      await user.sdk.authControllerUpdateMeV1({
        body: { timezone: 'Europe/Moscow' },
      }),
      'PATCH /auth/me (Europe/Moscow)',
    );

    await send('time');

    const botReply = (await history()).find((m) => m.senderRole === 'BOT');
    expect(botReply).toBeDefined();
    expect(botReply!.content).toMatch(TIME_REPLY('Europe/Moscow'));
    expectCloseToNow(botReply!.content, '+03:00');
  });

  it('replies with UTC time when the user has no stored time zone', async () => {
    await registerUser('time_utc');

    await send('time');

    const botReply = (await history()).find((m) => m.senderRole === 'BOT');
    expect(botReply).toBeDefined();
    expect(botReply!.content).toMatch(TIME_REPLY('UTC'));
    expectCloseToNow(botReply!.content, 'Z');
  });

  it('does not trigger plugins for operator mock-bot replies', async () => {
    const userId = await registerUser('operator_ping');
    await send('Hello there');

    unwrap(
      await admin.sdk.mockBotControllerReplyAsBotV1({
        path: { userId },
        body: { content: 'ping' },
      }),
      'POST /mock-bot/conversations/:userId/messages (operator ping)',
    );

    expect(
      (await history()).map((m) => `${m.senderRole}:${m.content}`),
    ).toEqual(['USER:Hello there', 'BOT:ping']);
  });
});
