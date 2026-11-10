import type { ChatMessageDto } from './generated/client/types.gen.js';
import { ActivityHelper } from './utils/activity-helper.js';
import { messageOf, unwrap } from './utils/api-result.js';

/**
 * User settings plugin (e2e, running backend): `/settings` renders the active
 * language with one button per supported language (the current one marked),
 * pressing a button stores the language and confirms the change in the new
 * language. An unsupported language is refused: `PATCH /auth/me` answers 400
 * without touching the stored value, and a button payload carrying a code
 * outside the supported set gets a refusal message written in the language
 * that stayed active (payloads of other namespaces stay silent). Clicks stay
 * invisible to the clicking user (kind=BUTTON filtering) while the operator
 * console still traces them.
 *
 * Fixture hygiene: the seeded admin only registers and deletes the test
 * accounts; every console read runs behind a test-spawned ADMIN key.
 */
describe('Settings plugin (e2e, running backend)', () => {
  const admin = new ActivityHelper();
  const user = new ActivityHelper();
  const operator = new ActivityHelper();

  const createdUsers: string[] = [];

  /** Console messages of the test user, clicks included. */
  const operatorHistory = async (userId: string): Promise<ChatMessageDto[]> =>
    unwrap(
      await operator.sdk.mockBotControllerGetConversationMessagesV1({
        path: { userId },
      }),
      'GET /mock-bot/conversations/:userId/messages',
    );

  const userHistory = async (): Promise<ChatMessageDto[]> =>
    unwrap(
      await user.sdk.chatControllerGetMessagesV1({}),
      'GET /chat/messages',
    );

  /** The most recent BOT message, i.e. the plugin reply of the last action. */
  const lastBotReply = async (): Promise<ChatMessageDto | undefined> => {
    const messages = await userHistory();
    return [...messages].reverse().find((m) => m.senderRole === 'BOT');
  };

  beforeAll(async () => {
    await admin.ensureBackendRunning();
    admin.loginAsAdmin();

    // A test-owned ADMIN to read the operator console.
    const spawned = await admin.registerAccount(
      `test_${admin.randomSha7}_settings_operator@example.com`,
    );
    createdUsers.push(spawned.user.id);
    await admin.sdk.adminUsersControllerUpdateV1({
      path: { id: spawned.user.id },
      body: { role: 'ADMIN' },
    });
    operator.loginByApiKey(spawned.apiKey.key);
  });

  afterAll(async () => {
    admin.loginAsAdmin();
    for (const id of createdUsers) {
      await admin.removeAccountAsAdmin(id);
    }
  });

  /** Registers a fresh USER and presents its key. */
  const registerUser = async (label: string): Promise<string> => {
    admin.loginAsAdmin();
    const registered = await admin.registerAccount(
      `test_${admin.randomSha7}_${label}@example.com`,
    );
    createdUsers.push(registered.user.id);
    user.loginByApiKey(registered.apiKey.key);
    return registered.user.id;
  };

  it('shows the settings screen with both language buttons and marks en', async () => {
    await registerUser('settings_screen');

    unwrap(
      await user.sdk.chatControllerSendMessageV1({
        body: { content: '/settings' },
      }),
      'POST /chat/messages (/settings)',
    );

    const reply = await lastBotReply();
    expect(reply).toBeDefined();
    expect(reply!.senderRole).toBe('BOT');
    expect(reply!.content).toContain('en');
    expect(reply!.buttons).toEqual([
      { title: '✓ English', callbackData: 'settings:language:en' },
      { title: 'Русский', callbackData: 'settings:language:ru' },
    ]);
  });

  it('changes the language on press, confirms in Russian and persists it', async () => {
    const userId = await registerUser('settings_change');

    unwrap(
      await user.sdk.chatControllerSendMessageV1({
        body: { content: '/settings' },
      }),
      'POST /chat/messages (/settings)',
    );
    unwrap(
      await user.sdk.chatControllerSubmitButtonCallbackV1({
        body: { callbackData: 'settings:language:ru' },
      }),
      'POST /chat/button-callbacks (ru)',
    );

    const reply = await lastBotReply();
    expect(reply?.content).toBe('Язык успешно изменён.');
    // The confirmation keyboard marks the language that just became active.
    expect(reply?.buttons).toEqual([
      { title: 'English', callbackData: 'settings:language:en' },
      { title: '✓ Русский', callbackData: 'settings:language:ru' },
    ]);

    const profile = unwrap(await user.sdk.authControllerMeV1(), 'GET /auth/me');
    expect(profile.user.language).toBe('ru');

    // The screen itself is now rendered in Russian.
    unwrap(
      await user.sdk.chatControllerSendMessageV1({
        body: { content: '/settings' },
      }),
      'POST /chat/messages (/settings after change)',
    );
    const screen = await lastBotReply();
    expect(screen?.content).toContain('Активный язык: ru');

    // The click stays hidden from the user but is traced for the operator,
    // together with the confirmation the plugin sent.
    const consoleMessages = await operatorHistory(userId);
    const click = consoleMessages.find(
      (m) => m.content === 'settings:language:ru' && m.senderRole === 'USER',
    );
    expect(click).toBeDefined();
    expect(
      consoleMessages.some((m) => m.content === 'Язык успешно изменён.'),
    ).toBe(true);

    const hidden = await userHistory();
    expect(hidden.some((m) => m.content === 'settings:language:ru')).toBe(
      false,
    );
  });

  it('answers in English when switching back', async () => {
    await registerUser('settings_back');

    unwrap(
      await user.sdk.chatControllerSendMessageV1({
        body: { content: '/settings' },
      }),
      'POST /chat/messages (/settings)',
    );
    unwrap(
      await user.sdk.chatControllerSubmitButtonCallbackV1({
        body: { callbackData: 'settings:language:ru' },
      }),
      'POST /chat/button-callbacks (ru)',
    );
    unwrap(
      await user.sdk.chatControllerSubmitButtonCallbackV1({
        body: { callbackData: 'settings:language:en' },
      }),
      'POST /chat/button-callbacks (en)',
    );

    const reply = await lastBotReply();
    expect(reply?.content).toBe('Language has been changed successfully.');

    const profile = unwrap(await user.sdk.authControllerMeV1(), 'GET /auth/me');
    expect(profile.user.language).toBe('en');
  });

  it('re-pressing the active language keeps it and still confirms', async () => {
    await registerUser('settings_idempotent');

    unwrap(
      await user.sdk.chatControllerSendMessageV1({
        body: { content: '/settings' },
      }),
      'POST /chat/messages (/settings)',
    );
    unwrap(
      await user.sdk.chatControllerSubmitButtonCallbackV1({
        body: { callbackData: 'settings:language:en' },
      }),
      'POST /chat/button-callbacks (en again)',
    );

    const reply = await lastBotReply();
    expect(reply?.content).toBe('Language has been changed successfully.');

    const profile = unwrap(await user.sdk.authControllerMeV1(), 'GET /auth/me');
    expect(profile.user.language).toBe('en');
  });

  it('refuses an unknown language code with a message and changes nothing', async () => {
    const userId = await registerUser('settings_unknown');

    unwrap(
      await user.sdk.chatControllerSendMessageV1({
        body: { content: '/settings' },
      }),
      'POST /chat/messages (/settings)',
    );
    const screen = await lastBotReply();
    const repliesBefore = (await userHistory()).filter(
      (m) => m.senderRole === 'BOT',
    ).length;

    const click = unwrap(
      await user.sdk.chatControllerSubmitButtonCallbackV1({
        body: { callbackData: 'settings:language:de' },
      }),
      'POST /chat/button-callbacks (de)',
    );
    // The click response carries the stored click only — the verdict of the
    // plugin always arrives asynchronously, as a separate BOT message.
    expect(click.senderRole).toBe('USER');
    expect(click.content).toBe('settings:language:de');

    const reply = await lastBotReply();
    expect(reply?.id).not.toBe(screen?.id);
    expect(reply?.content).toBe(
      'Unsupported language "de". Available languages: en, ru.',
    );
    // The keyboard offered with the refusal is marked with the language that
    // stayed active, so the user can correct the choice right away.
    expect(reply?.buttons).toEqual([
      { title: '✓ English', callbackData: 'settings:language:en' },
      { title: 'Русский', callbackData: 'settings:language:ru' },
    ]);

    const messages = await userHistory();
    expect(messages.filter((m) => m.senderRole === 'BOT').length).toBe(
      repliesBefore + 1,
    );

    const profile = unwrap(await user.sdk.authControllerMeV1(), 'GET /auth/me');
    expect(profile.user.language).toBe('en');

    // The refusal is an ordinary bot message, so the operator console sees it
    // next to the click that caused it.
    const consoleMessages = await operatorHistory(userId);
    expect(
      consoleMessages.some(
        (m) => m.content === 'settings:language:de' && m.senderRole === 'USER',
      ),
    ).toBe(true);
    expect(
      consoleMessages.some(
        (m) =>
          m.content ===
            'Unsupported language "de". Available languages: en, ru.' &&
          m.senderRole === 'BOT',
      ),
    ).toBe(true);
  });

  it('writes the refusal in the language that stays active', async () => {
    await registerUser('settings_refusal_ru');

    unwrap(
      await user.sdk.chatControllerSendMessageV1({
        body: { content: '/settings' },
      }),
      'POST /chat/messages (/settings)',
    );
    unwrap(
      await user.sdk.chatControllerSubmitButtonCallbackV1({
        body: { callbackData: 'settings:language:ru' },
      }),
      'POST /chat/button-callbacks (ru)',
    );
    expect((await lastBotReply())?.content).toBe('Язык успешно изменён.');

    unwrap(
      await user.sdk.chatControllerSubmitButtonCallbackV1({
        body: { callbackData: 'settings:language:de' },
      }),
      'POST /chat/button-callbacks (de while ru is active)',
    );

    // The user is not switched to the language they asked for: the refusal is
    // written in the language that stayed active and marks its button current.
    const reply = await lastBotReply();
    expect(reply?.content).toBe(
      'Неподдерживаемый язык «de». Доступные языки: en, ru.',
    );
    expect(reply?.buttons).toEqual([
      { title: 'English', callbackData: 'settings:language:en' },
      { title: '✓ Русский', callbackData: 'settings:language:ru' },
    ]);

    const profile = unwrap(await user.sdk.authControllerMeV1(), 'GET /auth/me');
    expect(profile.user.language).toBe('ru');
  });

  it('refuses every broken code of the language namespace, one by one', async () => {
    await registerUser('settings_bad_codes');

    unwrap(
      await user.sdk.chatControllerSendMessageV1({
        body: { content: '/settings' },
      }),
      'POST /chat/messages (/settings)',
    );
    let botReplies = (await userHistory()).filter(
      (m) => m.senderRole === 'BOT',
    ).length;

    // Empty code, a list of codes, an unknown code and an oversized one: all
    // of them are inside the namespace this plugin owns, so each click must
    // get its own refusal naming the code it was sent. Case and surrounding
    // spaces are not significant.
    const cases: Array<[string, string]> = [
      ['settings:language:de', '"de"'],
      ['  SETTINGS:LANGUAGE:DE  ', '"de"'],
      ['settings:language:', '"—"'],
      ['settings:language:123', '"123"'],
      ['settings:language:ru,en', '"ru,en"'],
      ['settings:language:russian', '"russian"'],
    ];

    for (const [callbackData, expectedCode] of cases) {
      const click = unwrap(
        await user.sdk.chatControllerSubmitButtonCallbackV1({
          body: { callbackData },
        }),
        `POST /chat/button-callbacks (${callbackData})`,
      );
      // Accepted as a click (well-formed callbackData: non-empty, within the
      // 256-char limit); the endpoint's own 400/401 cases are covered in
      // keyboard-buttons.e2e-spec.ts. The server trims the payload before
      // storing it, so only the surrounding spaces are lost.
      expect(click.senderRole, callbackData).toBe('USER');
      expect(click.content, callbackData).toBe(callbackData.trim());

      botReplies += 1;
      const reply = await lastBotReply();
      expect(reply?.content, callbackData).toBe(
        `Unsupported language ${expectedCode}. Available languages: en, ru.`,
      );
      expect(
        (await userHistory()).filter((m) => m.senderRole === 'BOT').length,
        callbackData,
      ).toBe(botReplies);

      const profile = unwrap(
        await user.sdk.authControllerMeV1(),
        'GET /auth/me',
      );
      expect(profile.user.language, callbackData).toBe('en');
    }
  });

  it('stays silent for payloads outside the language namespace', async () => {
    await registerUser('settings_foreign_payloads');

    unwrap(
      await user.sdk.chatControllerSendMessageV1({
        body: { content: '/settings' },
      }),
      'POST /chat/messages (/settings)',
    );
    const screen = await lastBotReply();
    const botReplies = (await userHistory()).filter(
      (m) => m.senderRole === 'BOT',
    ).length;

    // A tampered prefix, a payload without the code separator, and buttons of
    // other plugins: none of them may be claimed, so the last BOT message
    // stays the settings screen.
    for (const callbackData of [
      'settings:lang:en',
      'settings:language',
      'ping',
      'presets:123',
    ]) {
      const click = unwrap(
        await user.sdk.chatControllerSubmitButtonCallbackV1({
          body: { callbackData },
        }),
        `POST /chat/button-callbacks (${callbackData})`,
      );
      expect(click.content, callbackData).toBe(callbackData);

      expect(
        (await userHistory()).filter((m) => m.senderRole === 'BOT').length,
        callbackData,
      ).toBe(botReplies);
      expect((await lastBotReply())?.id, callbackData).toBe(screen?.id);

      const profile = unwrap(
        await user.sdk.authControllerMeV1(),
        'GET /auth/me',
      );
      expect(profile.user.language, callbackData).toBe('en');
    }
  });

  it('rejects an unsupported language with 400 and keeps the stored one', async () => {
    await registerUser('settings_bad_language');

    // The SDK types `language` as the supported union, the endpoint still has
    // to reject a value outside it (user-language spec, "недопустимое значение").
    const result = await user.sdk.authControllerUpdateMeV1({
      body: { language: 'de' as 'en' },
    });

    expect(result.response?.status).toBe(400);
    expect(messageOf(result.error)).toMatch(/language/i);

    const profile = unwrap(await user.sdk.authControllerMeV1(), 'GET /auth/me');
    expect(profile.user.language).toBe('en');

    // Nothing was written: the settings screen is still rendered in English.
    unwrap(
      await user.sdk.chatControllerSendMessageV1({
        body: { content: '/settings' },
      }),
      'POST /chat/messages (/settings)',
    );
    const screen = await lastBotReply();
    expect(screen?.content).toContain('Active language: en');
    expect(screen?.buttons?.map((b) => b.title)).toEqual([
      '✓ English',
      'Русский',
    ]);
  });

  it('names the supported codes in the error for any bad language value', async () => {
    await registerUser('settings_bad_values');

    for (const language of ['de', 'fr', 'russian', 'ru,en', '', '   ', '123']) {
      const result = await user.sdk.authControllerUpdateMeV1({
        body: { language: language as 'en' },
      });

      expect(result.response?.status, JSON.stringify(language)).toBe(400);
      expect(messageOf(result.error), JSON.stringify(language)).toMatch(
        /Unsupported language: expected one of en, ru/,
      );
    }

    // `null` is not an error — it is a "keep what is stored" selector.
    const kept = await user.sdk.authControllerUpdateMeV1({
      body: { language: null as unknown as 'en' },
    });
    expect(kept.response?.status).toBe(200);
    expect(kept.data?.user.language).toBe('en');

    const profile = unwrap(await user.sdk.authControllerMeV1(), 'GET /auth/me');
    expect(profile.user.language).toBe('en');
  });

  it('does not react to a settings message without the slash', async () => {
    await registerUser('settings_no_trigger');

    unwrap(
      await user.sdk.chatControllerSendMessageV1({
        body: { content: 'settings' },
      }),
      'POST /chat/messages (settings)',
    );

    const messages = await userHistory();
    expect(messages.some((m) => m.senderRole === 'BOT')).toBe(false);
  });

  it('ignores case and surrounding spaces of the command', async () => {
    await registerUser('settings_case');

    unwrap(
      await user.sdk.chatControllerSendMessageV1({
        body: { content: '  /SETTINGS  ' },
      }),
      'POST /chat/messages (/SETTINGS)',
    );

    const reply = await lastBotReply();
    expect(reply?.buttons?.map((b) => b.callbackData)).toEqual([
      'settings:language:en',
      'settings:language:ru',
    ]);
  });
});
