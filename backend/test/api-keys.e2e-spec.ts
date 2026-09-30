import { lastValueFrom, take } from 'rxjs';
import type {
  ApiKeyListDto,
  ServerTimeDto,
  TimeControllerStreamV1Data,
} from './generated/client/types.gen.js';
import { ActivityHelper } from './utils/activity-helper.js';
import { messageOf } from './utils/api-result.js';

/** Shape of a key secret: the generator prefix plus 40 hex characters. */
const API_KEY = /^sk-[0-9a-f]{40}$/;

describe('API keys (e2e, running backend)', () => {
  const activity = new ActivityHelper();
  const admin = new ActivityHelper();
  const streamUrl: TimeControllerStreamV1Data['url'] = '/api/v1/time/stream';

  /** Accounts created by this suite; every one of them is deleted afterwards. */
  const createdUsers: string[] = [];
  let validKey: string;
  let expiredKey: string;
  let inactiveKey: string;
  let futureKey: string;

  beforeAll(async () => {
    await activity.ensureBackendRunning();
    admin.loginAsAdmin();

    // Isolated identity created through the public API: the suite never
    // touches the database, all fixtures come from controllers.
    const registered = await activity.registerAccount(
      `test_${activity.randomSha7}_apikeys@example.com`,
    );
    createdUsers.push(registered.user.id);
    validKey = registered.apiKey.key;
    activity.loginByApiKey(validKey);

    expiredKey = (
      await activity.issueKey({
        name: 'Expired',
        expiresAt: ActivityHelper.isoFromNow(-60_000),
      })
    ).key;
    inactiveKey = (
      await activity.issueKey({ name: 'Inactive', isActive: false })
    ).key;
    futureKey = (
      await activity.issueKey({
        name: 'Future expiry',
        expiresAt: ActivityHelper.isoFromNow(3_600_000),
      })
    ).key;
  });

  afterAll(async () => {
    // api_keys cascade-delete together with the account
    for (const id of createdUsers) {
      await admin.removeAccountAsAdmin(id);
    }
  });

  /** Registers a second account and remembers it for the teardown. */
  async function registerAnotherAccount(): Promise<ActivityHelper> {
    const other = new ActivityHelper();
    const registered = await other.registerAccount(
      `test_${other.randomSha7}_other_apikeys@example.com`,
    );
    createdUsers.push(registered.user.id);
    other.loginByApiKey(registered.apiKey.key);

    return other;
  }

  /** Every test starts as the owner of the valid key unless it says otherwise. */
  beforeEach(() => {
    activity.loginByApiKey(validKey);
  });

  describe('GET /api/v1/auth/me as a key probe', () => {
    it('rejects requests without an API key', async () => {
      activity.logout();
      const result = await activity.sdk.authControllerMeV1();

      expect(result.response?.status).toBe(401);
      expect(messageOf(result.error)).toMatch(/API key is required/i);
    });

    it('rejects an unknown API key', async () => {
      activity.loginByApiKey(`unknown_${activity.randomSha7}`);
      const result = await activity.sdk.authControllerMeV1();

      expect(result.response?.status).toBe(401);
      expect(messageOf(result.error)).toMatch(/Invalid API key/i);
    });

    it('accepts a valid API key and returns the profile', async () => {
      const profile = await activity.loginAndFetchProfile(validKey);

      expect(profile).not.toBeNull();
      expect(profile!.user.role).toBe('USER');
      expect(profile!.user.isActive).toBe(true);
      expect(profile!.apiKey.name).toBe('Default key');
      expect(profile!.apiKey.expiresAt).toBeNull();
    });

    it('masks the key secret in the response', async () => {
      const profile = await activity.loginAndFetchProfile(validKey);

      expect(profile!.apiKey.key).toBe(`${validKey.slice(0, 8)}…`);
      expect(profile!.apiKey.key).not.toContain(validKey.slice(10));
    });

    it('rejects an expired API key', async () => {
      activity.loginByApiKey(expiredKey);
      const result = await activity.sdk.authControllerMeV1();

      expect(result.response?.status).toBe(401);
      expect(messageOf(result.error)).toMatch(/API key expired/i);
    });

    it('accepts a key whose expiry is in the future', async () => {
      const profile = await activity.loginAndFetchProfile(futureKey);

      expect(profile).not.toBeNull();
      expect(profile!.apiKey.name).toBe('Future expiry');
      expect(+new Date(profile!.apiKey.expiresAt as string)).not.toBeNaN();
    });

    it('rejects an inactive API key', async () => {
      activity.loginByApiKey(inactiveKey);
      const result = await activity.sdk.authControllerMeV1();

      expect(result.response?.status).toBe(401);
      expect(messageOf(result.error)).toMatch(/Invalid API key/i);
    });

    it('rejects any key of a deactivated user', async () => {
      const deactivated = await admin.sdk.adminUsersControllerUpdateV1({
        path: { id: createdUsers[0] },
        body: { isActive: false },
      });
      expect(deactivated.response?.status).toBe(200);
      try {
        activity.loginByApiKey(validKey);
        const result = await activity.sdk.authControllerMeV1();

        expect(result.response?.status).toBe(401);
        expect(messageOf(result.error)).toMatch(/User is inactive/i);
      } finally {
        await admin.sdk.adminUsersControllerUpdateV1({
          path: { id: createdUsers[0] },
          body: { isActive: true },
        });
      }
    });

    it('accepts the seeded default admin key from the environment', async () => {
      const profile = await activity.loginAndFetchProfile(
        ActivityHelper.adminApiKey(),
      );

      expect(profile!.user.role).toBe('ADMIN');
      expect(profile!.apiKey.name).toBe('Default admin key');
    });
  });

  describe('API key presentation channels', () => {
    it('accepts the key via the ?apiKey= query parameter', async () => {
      activity.logout();
      const result = await activity.sdk.authControllerMeV1({
        query: { apiKey: validKey },
      });

      expect(result.response?.status).toBe(200);
      expect(result.data?.apiKey.name).toBe('Default key');
    });

    it('query parameter does not override an invalid header key', async () => {
      const result = await activity.sdk.authControllerMeV1({
        headers: { 'x-api-key': `unknown_${activity.randomSha7}` },
        query: { apiKey: validKey },
      });

      // The header is checked first, so the bogus header must win (401).
      expect(result.response?.status).toBe(401);
    });
  });

  describe('CRUD /api/v1/api-keys', () => {
    it('requires a valid API key', async () => {
      activity.logout();
      const result = await activity.sdk.apiKeysControllerListV1();

      expect(result.response?.status).toBe(401);
      expect(messageOf(result.error)).toMatch(/API key is required/i);
    });

    it('lists the keys of the authenticated user with masked secrets', async () => {
      activity.loginByApiKey(validKey);
      const result = await activity.sdk.apiKeysControllerListV1();
      const list = result.data as ApiKeyListDto;

      expect(result.response?.status).toBe(200);
      expect(list.total).toBe(list.items.length);
      expect(list.items.map((item) => item.name)).toEqual(
        expect.arrayContaining([
          'Default key',
          'Expired',
          'Inactive',
          'Future expiry',
        ]),
      );
      for (const item of list.items) {
        expect(item.key).not.toMatch(API_KEY);
        expect(item.key).toMatch(/…$/);
      }
      expect(
        list.items.find((item) => item.name === 'Inactive')?.isActive,
      ).toBe(false);
    });

    it('never lists keys of another account', async () => {
      const other = await registerAnotherAccount();
      const mine = await activity.sdk.apiKeysControllerListV1();
      const theirs = await other.sdk.apiKeysControllerListV1();
      const myIds = new Set(mine.data!.items.map((item) => item.id));

      expect(theirs.data!.items.some((item) => myIds.has(item.id))).toBe(false);
    });

    it('creates a key and reveals its secret only in the create response', async () => {
      activity.loginByApiKey(validKey);
      const created = await activity.sdk.apiKeysControllerCreateV1({
        body: {
          name: 'CI pipeline',
          expiresAt: ActivityHelper.isoFromNow(86_400_000),
        },
      });

      expect(created.response?.status).toBe(201);
      expect(created.data!.key).toMatch(API_KEY);
      expect(created.data!.isActive).toBe(true);
      expect(created.data!.expiresAt).toMatch(
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/,
      );

      const listed = await activity.sdk.apiKeysControllerListV1();
      const masked = listed.data!.items.find(
        (item) => item.id === created.data!.id,
      );

      expect(masked?.key).toBe(`${created.data!.key.slice(0, 8)}…`);
    });

    it('accepts a key created in a disabled state and issues a usable secret', async () => {
      activity.loginByApiKey(validKey);
      const created = await activity.issueKey({
        name: 'Disabled on purpose',
        isActive: false,
      });
      const holder = new ActivityHelper();
      holder.loginByApiKey(created.key);

      const rejected = await holder.sdk.authControllerMeV1();

      expect(created.key).toMatch(API_KEY);
      expect(rejected.response?.status).toBe(401);
      expect(messageOf(rejected.error)).toMatch(/Invalid API key/i);
    });

    it('rejects a blank key name', async () => {
      const result = await activity.sdk.apiKeysControllerCreateV1({
        body: { name: '   ' },
      });

      expect(result.response?.status).toBe(400);
      expect(messageOf(result.error)).toMatch(/Key name is required/i);
    });

    it('rejects an expiresAt that is not an ISO-8601 string', async () => {
      const result = await activity.sdk.apiKeysControllerCreateV1({
        body: { name: 'Bad expiry', expiresAt: '30.09.2026' },
      });

      expect(result.response?.status).toBe(400);
      expect(messageOf(result.error)).toMatch(/ISO-8601/i);
    });

    it('renames, deactivates and re-expires a key', async () => {
      activity.loginByApiKey(validKey);
      const created = await activity.issueKey({ name: 'Rename me' });

      const renamed = await activity.sdk.apiKeysControllerUpdateV1({
        path: { id: created.id },
        body: { name: 'Renamed' },
      });
      expect(renamed.response?.status).toBe(200);
      expect(renamed.data?.name).toBe('Renamed');
      expect(renamed.data?.isActive).toBe(true);

      const retired = await activity.sdk.apiKeysControllerUpdateV1({
        path: { id: created.id },
        body: {
          isActive: false,
          expiresAt: ActivityHelper.isoFromNow(-1),
        },
      });
      expect(retired.data?.isActive).toBe(false);
      expect(retired.data?.expiresAt).toMatch(
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
      );

      const eternal = await activity.sdk.apiKeysControllerUpdateV1({
        path: { id: created.id },
        body: { expiresAt: null },
      });
      expect(eternal.data?.expiresAt).toBeNull();
    });

    it('revokes a key when it is deleted', async () => {
      activity.loginByApiKey(validKey);
      const created = await activity.issueKey({ name: 'To revoke' });
      const holder = new ActivityHelper();
      holder.loginByApiKey(created.key);

      expect((await holder.getAuthProfile())?.apiKey.id).toBe(created.id);

      const deleted = await activity.sdk.apiKeysControllerRemoveV1({
        path: { id: created.id },
      });
      expect(deleted.response?.status).toBe(204);

      const afterDelete = await holder.sdk.authControllerMeV1();
      expect(afterDelete.response?.status).toBe(401);
      expect(messageOf(afterDelete.error)).toMatch(/Invalid API key/i);
    });

    it('returns 404 for an unknown key id', async () => {
      const result = await activity.sdk.apiKeysControllerUpdateV1({
        path: { id: `missing-${activity.randomSha7}` },
        body: { name: 'Ghost' },
      });

      expect(result.response?.status).toBe(404);
      expect(messageOf(result.error)).toMatch(/API key not found/i);
    });

    it('returns 403 when a key of another account is managed', async () => {
      const other = await registerAnotherAccount();
      const foreignKey = (await activity.sdk.apiKeysControllerListV1()).data!
        .items[0];

      const result = await other.sdk.apiKeysControllerUpdateV1({
        path: { id: foreignKey.id },
        body: { name: 'Stolen' },
      });

      expect(result.response?.status).toBe(403);
      expect(messageOf(result.error)).toMatch(/belongs to another user/i);
    });
  });

  describe('time endpoints are public (their contract has no key at all)', () => {
    it('streams for an authenticated and for an anonymous client', async () => {
      activity.loginByApiKey(validKey);
      const authed = await lastValueFrom(
        activity.sse<ServerTimeDto>({ url: streamUrl }).pipe(take(1)),
      );

      activity.logout();
      const anonymous = await lastValueFrom(
        activity.sse<ServerTimeDto>({ url: streamUrl }).pipe(take(1)),
      );

      expect(+new Date(authed.time)).not.toBeNaN();
      expect(+new Date(anonymous.time)).not.toBeNaN();
    });

    it('is not blocked by a key the guard would reject', async () => {
      activity.loginByApiKey(expiredKey);
      const event = await lastValueFrom(
        activity.sse<ServerTimeDto>({ url: streamUrl }).pipe(take(1)),
      );

      // Unlike GET /auth/me, the stream neither requires nor reads a key.
      expect(+new Date(event.time)).not.toBeNaN();
    });
  });
});
