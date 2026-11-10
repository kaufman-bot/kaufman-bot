import type {
  AuthProfileDto,
  AuthRegisterDto,
} from './generated/client/types.gen.js';
import { ActivityHelper } from './utils/activity-helper.js';
import { messageOf, unwrap } from './utils/api-result.js';

/** Shape of a generated secret: the prefix plus 40 hex characters. */
const API_KEY = /^sk-[0-9a-f]{40}$/;

describe('Registration and auth profile (e2e, running backend)', () => {
  const activity = new ActivityHelper();
  const admin = new ActivityHelper();

  /** Every account created here is removed by the admin endpoint afterwards. */
  const createdUsers: string[] = [];

  beforeAll(async () => {
    await activity.ensureBackendRunning();
    admin.loginAsAdmin();
  });

  afterAll(async () => {
    for (const id of createdUsers) {
      await admin.removeAccountAsAdmin(id);
    }
  });

  describe('POST /api/v1/auth/register', () => {
    it('creates a USER account and reveals its first API key once', async () => {
      const email = `test_${activity.randomSha7}_register@example.com`;
      const result = await activity.sdk.authControllerRegisterV1({
        body: { email, password: 'e2e-password-123' },
      });

      expect(result.response?.status).toBe(201);
      const created = result.data as AuthRegisterDto;
      createdUsers.push(created.user.id);

      expect(created.user.email).toBe(email);
      expect(created.user.role).toBe('USER');
      expect(created.user.isActive).toBe(true);
      // A new account starts with the default active language.
      expect(created.user.language).toBe('en');
      expect(created.apiKey.key).toMatch(API_KEY);
      expect(created.apiKey.name).toBe('Default key');
      expect(created.apiKey.expiresAt).toBeNull();
    });

    it('hands out a key that immediately authenticates requests', async () => {
      const registered = await activity.registerAccount(
        `test_${activity.randomSha7}_keyworks@example.com`,
      );
      createdUsers.push(registered.user.id);

      activity.loginByApiKey(registered.apiKey.key);
      const profile = await activity.getAuthProfile();

      expect(profile).not.toBeNull();
      expect(profile!.user.id).toBe(registered.user.id);
      expect(profile!.apiKey.id).toBe(registered.apiKey.id);
      // Only the create response ever shows the secret.
      expect(profile!.apiKey.key).toBe(`${registered.apiKey.key.slice(0, 8)}…`);
    });

    it('rejects a malformed e-mail', async () => {
      const result = await activity.sdk.authControllerRegisterV1({
        body: { email: 'not-an-e-mail', password: 'e2e-password-123' },
      });

      expect(result.response?.status).toBe(400);
      expect(messageOf(result.error)).toMatch(/valid e-mail/i);
    });

    it('rejects a password shorter than 8 characters', async () => {
      const result = await activity.sdk.authControllerRegisterV1({
        body: {
          email: `test_${activity.randomSha7}_short@example.com`,
          password: 'short',
        },
      });

      expect(result.response?.status).toBe(400);
      expect(messageOf(result.error)).toMatch(/at least 8 characters/i);
    });

    it('rejects an e-mail that is already taken', async () => {
      const email = `test_${activity.randomSha7}_duplicate@example.com`;
      const registered = await activity.registerAccount(email);
      createdUsers.push(registered.user.id);

      const again = await activity.sdk.authControllerRegisterV1({
        body: { email, password: 'e2e-password-123' },
      });

      expect(again.response?.status).toBe(409);
      expect(messageOf(again.error)).toMatch(/already exists/i);
    });

    it('accepts the same e-mail with a different case (it is normalized)', async () => {
      const email = `test_${activity.randomSha7}_case@example.com`;
      const registered = await activity.registerAccount(email);
      createdUsers.push(registered.user.id);

      const result = await activity.sdk.authControllerRegisterV1({
        body: { email: email.toUpperCase(), password: 'e2e-password-123' },
      });

      expect(result.response?.status).toBe(409);
    });
  });

  describe('GET /api/v1/auth/me', () => {
    it('rejects requests without an API key', async () => {
      activity.logout();
      const result = await activity.sdk.authControllerMeV1();

      expect(result.response?.status).toBe(401);
      expect(messageOf(result.error)).toMatch(/API key is required/i);
    });

    it('describes the account behind the presented key', async () => {
      const registered = await activity.registerAccount(
        `test_${activity.randomSha7}_profile@example.com`,
      );
      createdUsers.push(registered.user.id);
      activity.loginByApiKey(registered.apiKey.key);

      const profile = unwrap(
        await activity.sdk.authControllerMeV1(),
        'GET /auth/me',
      );

      expect(profile.user).toEqual({
        id: registered.user.id,
        email: registered.user.email,
        role: 'USER',
        isActive: true,
        timezone: null,
        language: 'en',
        telegramBotId: null,
        telegramBotName: null,
      });
      expect(profile.apiKey.id).toBe(registered.apiKey.id);
    });
  });

  describe('PATCH /api/v1/auth/me', () => {
    it('stores a valid IANA time zone (trimmed) and persists it', async () => {
      const registered = await activity.registerAccount(
        `test_${activity.randomSha7}_tz@example.com`,
      );
      createdUsers.push(registered.user.id);
      activity.loginByApiKey(registered.apiKey.key);

      const result = await activity.sdk.authControllerUpdateMeV1({
        body: { timezone: '  Europe/Moscow  ' },
      });

      expect(result.response?.status).toBe(200);
      expect(result.data?.user.timezone).toBe('Europe/Moscow');

      // The stored value survives into a fresh GET /auth/me.
      const profile = unwrap(
        await activity.sdk.authControllerMeV1(),
        'GET /auth/me',
      );
      expect(profile.user.timezone).toBe('Europe/Moscow');
    });

    it('rejects a non-IANA time zone with 400', async () => {
      const registered = await activity.registerAccount(
        `test_${activity.randomSha7}_tzbad@example.com`,
      );
      createdUsers.push(registered.user.id);
      activity.loginByApiKey(registered.apiKey.key);

      const result = await activity.sdk.authControllerUpdateMeV1({
        body: { timezone: 'Mars/Olympus' },
      });

      expect(result.response?.status).toBe(400);
      expect(messageOf(result.error)).toMatch(/IANA time zone/i);
    });

    it('rejects requests without an API key', async () => {
      activity.logout();
      const result = await activity.sdk.authControllerUpdateMeV1({
        body: { timezone: 'Europe/Moscow' },
      });

      expect(result.response?.status).toBe(401);
      expect(messageOf(result.error)).toMatch(/API key is required/i);
    });

    it('clears the stored time zone when null is sent', async () => {
      const registered = await activity.registerAccount(
        `test_${activity.randomSha7}_tzclear@example.com`,
      );
      createdUsers.push(registered.user.id);
      activity.loginByApiKey(registered.apiKey.key);

      unwrap(
        await activity.sdk.authControllerUpdateMeV1({
          body: { timezone: 'Europe/Moscow' },
        }),
        'PATCH /auth/me (set)',
      );
      const cleared = unwrap(
        await activity.sdk.authControllerUpdateMeV1({
          body: { timezone: null },
        }),
        'PATCH /auth/me (clear)',
      );
      expect(cleared.user.timezone).toBeNull();

      const profile = unwrap(
        await activity.sdk.authControllerMeV1(),
        'GET /auth/me',
      );
      expect(profile.user.timezone).toBeNull();
    });

    it('reports the time zone in login and me responses', async () => {
      const registered = await activity.registerAccount(
        `test_${activity.randomSha7}_tzlogin@example.com`,
      );
      createdUsers.push(registered.user.id);
      activity.loginByApiKey(registered.apiKey.key);

      unwrap(
        await activity.sdk.authControllerUpdateMeV1({
          body: { timezone: 'Europe/Paris', language: 'ru' },
        }),
        'PATCH /auth/me',
      );

      const login = unwrap(
        await activity.sdk.authControllerLoginV1({
          body: { apiKey: registered.apiKey.key },
        }),
        'POST /auth/login',
      );
      expect(login.user.timezone).toBe('Europe/Paris');
      expect(login.user.language).toBe('ru');

      const profile = unwrap(
        await activity.sdk.authControllerMeV1(),
        'GET /auth/me',
      );
      expect(profile.user.timezone).toBe('Europe/Paris');
      expect(profile.user.language).toBe('ru');
    });

    it('stores a supported language and persists it', async () => {
      const registered = await activity.registerAccount(
        `test_${activity.randomSha7}_lang@example.com`,
      );
      createdUsers.push(registered.user.id);
      activity.loginByApiKey(registered.apiKey.key);

      const result = await activity.sdk.authControllerUpdateMeV1({
        body: { language: 'ru' },
      });

      expect(result.response?.status).toBe(200);
      expect(result.data?.user.language).toBe('ru');

      const profile = unwrap(
        await activity.sdk.authControllerMeV1(),
        'GET /auth/me',
      );
      expect(profile.user.language).toBe('ru');
    });

    it('rejects a language outside the supported set with 400', async () => {
      const registered = await activity.registerAccount(
        `test_${activity.randomSha7}_langbad@example.com`,
      );
      createdUsers.push(registered.user.id);
      activity.loginByApiKey(registered.apiKey.key);

      // The SDK types `language` as the supported union, the endpoint still has
      // to reject a value outside it.
      const result = await activity.sdk.authControllerUpdateMeV1({
        body: { language: 'de' as 'en' },
      });

      expect(result.response?.status).toBe(400);
      expect(messageOf(result.error)).toMatch(/language/i);

      // The stored language was not touched by the rejected request.
      const profile = unwrap(
        await activity.sdk.authControllerMeV1(),
        'GET /auth/me',
      );
      expect(profile.user.language).toBe('en');
    });

    it('keeps the stored language when the field is absent', async () => {
      const registered = await activity.registerAccount(
        `test_${activity.randomSha7}_langkeep@example.com`,
      );
      createdUsers.push(registered.user.id);
      activity.loginByApiKey(registered.apiKey.key);

      unwrap(
        await activity.sdk.authControllerUpdateMeV1({
          body: { language: 'ru' },
        }),
        'PATCH /auth/me (set language)',
      );

      const updated = unwrap(
        await activity.sdk.authControllerUpdateMeV1({
          body: { timezone: 'Europe/Moscow' },
        }),
        'PATCH /auth/me (time zone only)',
      );
      expect(updated.user.timezone).toBe('Europe/Moscow');
      expect(updated.user.language).toBe('ru');
    });
  });

  describe('POST /api/v1/auth/login', () => {
    it('returns the profile for a valid API key', async () => {
      const registered = await activity.registerAccount(
        `test_${activity.randomSha7}_login@example.com`,
      );
      createdUsers.push(registered.user.id);

      const result = await activity.sdk.authControllerLoginV1({
        body: { apiKey: registered.apiKey.key },
      });

      expect(result.response?.status).toBe(201);
      const profile = result.data as AuthProfileDto;
      expect(profile.user.id).toBe(registered.user.id);
      expect(profile.user.email).toBe(registered.user.email);
      expect(profile.user.timezone).toBeNull();
      expect(profile.user.language).toBe('en');
      expect(profile.apiKey.id).toBe(registered.apiKey.id);
    });

    it('rejects an unknown API key with 401', async () => {
      const result = await activity.sdk.authControllerLoginV1({
        body: { apiKey: 'sk-unknown-key-that-does-not-exist' },
      });

      expect(result.response?.status).toBe(401);
      expect(messageOf(result.error)).toMatch(/Invalid API key/i);
    });

    it('rejects an empty API key with 400', async () => {
      const result = await activity.sdk.authControllerLoginV1({
        body: { apiKey: '' },
      });

      expect(result.response?.status).toBe(400);
      expect(messageOf(result.error)).toMatch(/API key is required/i);
    });

    it('rejects a missing apiKey field with 400', async () => {
      const result = await activity.sdk.authControllerLoginV1({
        body: {} as { apiKey: string },
      });

      expect(result.response?.status).toBe(400);
      expect(messageOf(result.error)).toMatch(/API key is required/i);
    });

    it('rejects an inactive API key with 401', async () => {
      const registered = await activity.registerAccount(
        `test_${activity.randomSha7}_inactive@example.com`,
      );
      createdUsers.push(registered.user.id);

      // Deactivate the user via admin endpoint (keys inherit user status)
      admin.loginAsAdmin();
      await admin.sdk.adminUsersControllerUpdateV1({
        path: { id: registered.user.id },
        body: { isActive: false },
      });

      const result = await activity.sdk.authControllerLoginV1({
        body: { apiKey: registered.apiKey.key },
      });

      expect(result.response?.status).toBe(401);
      expect(messageOf(result.error)).toMatch(/Invalid API key/i);
    });
  });
});
