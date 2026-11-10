import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ChatMessageDto } from './generated/client/types.gen.js';
import { ActivityHelper } from './utils/activity-helper.js';
import { messageOf } from './utils/api-result.js';

/**
 * E2E for the "quiet press" contract that the specs introduce:
 *
 *   1. The operator sends a bot reply with inline buttons; the user sees
 *      them in their own history via `GET /api/v1/chat/messages`.
 *   2. The user presses a button → `POST /api/v1/chat/button-callbacks`
 *      returns 201 and persists a USER message with `kind=BUTTON`.
 *   3. That click must NOT flow back into the clicking user's history or
 *      SSE (see ChatService.getHistory filter + `emitIfVisible`). It IS
 *      dispatched to plugins, but only plugins declaring `handlesCallbacks`
 *      are offered it — PingPong is not one of them, so a `ping` payload
 *      pressed from a keyboard still produces no bot reply.
 *   4. The operator console keeps the click (via `getConversationMessages`
 *      which does not filter by `kind`), so an operator can trace every
 *      press.
 */
describe('Inline keyboard buttons (e2e, running backend)', () => {
  const admin = new ActivityHelper();
  const user = new ActivityHelper();

  const createdUsers: string[] = [];
  let userId: string;

  beforeAll(async () => {
    await admin.ensureBackendRunning();
    admin.loginAsAdmin();

    const reg = await user.registerAccount(
      `test_${user.randomSha7}_keyboard@example.com`,
    );
    createdUsers.push(reg.user.id);
    userId = reg.user.id;
    user.loginByApiKey(reg.apiKey.key);

    // Open a conversation so the operator can reply into it.
    await user.sdk.chatControllerSendMessageV1({
      body: { content: 'hi' },
    });
  });

  afterAll(async () => {
    admin.loginAsAdmin();
    for (const id of createdUsers) {
      await admin.removeAccountAsAdmin(id);
    }
  });

  it('sends a bot reply with buttons and the user sees them in history', async () => {
    admin.loginAsAdmin();
    const reply = await admin.sdk.mockBotControllerReplyAsBotV1({
      path: { userId },
      body: {
        content: 'Choose an option',
        buttons: [
          { title: 'Ping', callbackData: 'ping' },
          { title: 'Pong', callbackData: 'pong' },
        ],
      },
    });
    expect(reply.response?.status).toBe(201);
    const botMessage = reply.data as ChatMessageDto;
    expect(botMessage.buttons).toEqual([
      { title: 'Ping', callbackData: 'ping' },
      { title: 'Pong', callbackData: 'pong' },
    ]);

    user.loginByApiKey(user.currentApiKey!);
    const history = await user.sdk.chatControllerGetMessagesV1({});
    const visible = (history.data as ChatMessageDto[]).find(
      (m) => m.id === botMessage.id,
    );
    expect(visible).toBeDefined();
    expect(visible!.buttons).toEqual(botMessage.buttons);
  });

  it('POST /chat/button-callbacks returns 201 and does not echo to the user', async () => {
    user.loginByApiKey(user.currentApiKey!);
    const cb = await user.sdk.chatControllerSubmitButtonCallbackV1({
      body: { callbackData: 'ping' },
    });
    expect(cb.response?.status).toBe(201);
    const click = cb.data as ChatMessageDto;
    expect(click.content).toBe('ping');
    expect(click.senderRole).toBe('USER');
    expect(click.buttons).toBeNull();

    // Now the click must not appear in the user's own history.
    const history = await user.sdk.chatControllerGetMessagesV1({});
    const msgs = history.data as ChatMessageDto[];
    expect(msgs.find((m) => m.id === click.id)).toBeUndefined();

    // PingPong would have replied `pong` if it accepted button presses.
    // The click does reach the dispatcher now, but PingPong never declared
    // `handlesCallbacks`, so it is not even asked — no BOT reply with
    // `pong` may appear after the click.
    const autoReply = msgs.find(
      (m) => m.senderRole === 'BOT' && m.content.toLowerCase().includes('pong'),
    );
    expect(autoReply).toBeUndefined();
  });

  it('operator still sees the click in the console history', async () => {
    admin.loginAsAdmin();
    const result = await admin.sdk.mockBotControllerGetConversationMessagesV1({
      path: { userId },
    });
    const messages = result.data as ChatMessageDto[];

    const click = messages.find(
      (m) => m.senderRole === 'USER' && m.content === 'ping',
    );
    expect(click).toBeDefined();
  });

  it('rejects an empty callbackData with 400', async () => {
    user.loginByApiKey(user.currentApiKey!);
    const result = await user.sdk.chatControllerSubmitButtonCallbackV1({
      body: { callbackData: '   ' },
    });
    expect(result.response?.status).toBe(400);
    expect(messageOf(result.error)).toMatch(/cannot be empty/i);
  });

  it('rejects a callbackData longer than 256 characters with 400', async () => {
    user.loginByApiKey(user.currentApiKey!);
    const result = await user.sdk.chatControllerSubmitButtonCallbackV1({
      body: { callbackData: 'x'.repeat(257) },
    });
    expect(result.response?.status).toBe(400);
    expect(messageOf(result.error)).toMatch(/exceeds maximum length/i);
  });

  it('rejects an unauthenticated press with 401', async () => {
    const anon = new ActivityHelper();
    const result = await anon.sdk.chatControllerSubmitButtonCallbackV1({
      body: { callbackData: 'ping' },
    });
    expect(result.response?.status).toBe(401);
    expect(messageOf(result.error)).toMatch(/API key is required/i);
  });
});
