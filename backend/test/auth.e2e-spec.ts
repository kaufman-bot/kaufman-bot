import type { AuthRegisterDto } from './generated/client/types.gen.js';
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
      });
      expect(profile.apiKey.id).toBe(registered.apiKey.id);
    });
  });
});
