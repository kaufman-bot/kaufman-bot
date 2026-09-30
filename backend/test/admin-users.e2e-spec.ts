import type { AdminUserListDto } from './generated/client/types.gen.js';
import { ActivityHelper } from './utils/activity-helper.js';
import { messageOf, unwrap } from './utils/api-result.js';

describe('Admin user management (e2e, running backend)', () => {
  const admin = new ActivityHelper();

  /** Accounts created here; the last of them is deleted by an explicit test. */
  const createdUsers: string[] = [];

  beforeAll(async () => {
    await admin.ensureBackendRunning();
    admin.loginAsAdmin();
  });

  afterAll(async () => {
    for (const id of createdUsers) {
      await admin.removeAccountAsAdmin(id);
    }
  });

  describe('authorization', () => {
    it('rejects requests without an API key', async () => {
      const anonymous = new ActivityHelper();
      const result = await anonymous.sdk.adminUsersControllerListV1();

      expect(result.response?.status).toBe(401);
      expect(messageOf(result.error)).toMatch(/API key is required/i);
    });

    it('rejects an authenticated account that is not an admin', async () => {
      const user = await admin.registerAccount(
        `test_${admin.randomSha7}_notadmin@example.com`,
      );
      createdUsers.push(user.user.id);

      const caller = new ActivityHelper();
      caller.loginByApiKey(user.apiKey.key);
      const result = await caller.sdk.adminUsersControllerListV1();

      expect(result.response?.status).toBe(403);
      expect(messageOf(result.error)).toMatch(/Admin access required/i);
    });

    it('refuses to delete the account of the caller itself', async () => {
      const profile = unwrap(
        await admin.sdk.authControllerMeV1(),
        'GET /auth/me',
      );
      const result = await admin.sdk.adminUsersControllerRemoveV1({
        path: { id: profile.user.id },
      });

      expect(result.response?.status).toBe(403);
      expect(messageOf(result.error)).toMatch(/delete your own account/i);
    });
  });

  describe('reading accounts', () => {
    it('lists every account with masked keys', async () => {
      const list = unwrap(
        await admin.sdk.adminUsersControllerListV1(),
        'GET /admin/users',
      ) as AdminUserListDto;

      expect(list.total).toBe(list.items.length);
      expect(list.items.length).toBeGreaterThan(0);
      for (const item of list.items) {
        expect(item.email).toMatch(/@/);
        for (const key of item.apiKeys) {
          expect(key.key).toMatch(/…$/);
        }
      }
    });

    it('reads a single account', async () => {
      const created = await admin.registerAccount(
        `test_${admin.randomSha7}_read@example.com`,
      );
      createdUsers.push(created.user.id);

      const user = unwrap(
        await admin.sdk.adminUsersControllerGetV1({
          path: { id: created.user.id },
        }),
        'GET /admin/users/:id',
      );

      expect(user.email).toBe(created.user.email);
      expect(user.role).toBe('USER');
      expect(user.isActive).toBe(true);
      expect(user.createdAt).toMatch(
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
      );
      expect(user.apiKeys.map((key) => key.id)).toEqual([created.apiKey.id]);
    });

    it('returns 404 for an unknown account', async () => {
      const result = await admin.sdk.adminUsersControllerGetV1({
        path: { id: `missing-${admin.randomSha7}` },
      });

      expect(result.response?.status).toBe(404);
      expect(messageOf(result.error)).toMatch(/User not found/i);
    });
  });

  describe('changing accounts', () => {
    it('deactivates an account and activates it again', async () => {
      const created = await admin.registerAccount(
        `test_${admin.randomSha7}_deactivate@example.com`,
      );
      createdUsers.push(created.user.id);
      const holder = new ActivityHelper();
      holder.loginByApiKey(created.apiKey.key);

      const deactivated = unwrap(
        await admin.sdk.adminUsersControllerUpdateV1({
          path: { id: created.user.id },
          body: { isActive: false },
        }),
        'PATCH /admin/users/:id',
      );
      expect(deactivated.isActive).toBe(false);
      expect((await holder.sdk.authControllerMeV1()).response?.status).toBe(
        401,
      );

      const activated = await admin.sdk.adminUsersControllerUpdateV1({
        path: { id: created.user.id },
        body: { isActive: true },
      });
      expect(activated.data?.isActive).toBe(true);
      expect((await holder.getAuthProfile())?.user.id).toBe(created.user.id);
    });

    it('grants ADMIN, which unlocks the admin endpoints for that account', async () => {
      const created = await admin.registerAccount(
        `test_${admin.randomSha7}_promote@example.com`,
      );
      createdUsers.push(created.user.id);
      await admin.sdk.adminUsersControllerUpdateV1({
        path: { id: created.user.id },
        body: { role: 'ADMIN' },
      });

      const promoted = new ActivityHelper();
      promoted.loginByApiKey(created.apiKey.key);

      expect(
        (await promoted.sdk.adminUsersControllerListV1()).response?.status,
      ).toBe(200);

      await admin.sdk.adminUsersControllerUpdateV1({
        path: { id: created.user.id },
        body: { role: 'USER' },
      });
      expect(
        (await promoted.sdk.adminUsersControllerListV1()).response?.status,
      ).toBe(403);
    });

    it('rejects an unknown role', async () => {
      const created = await admin.registerAccount(
        `test_${admin.randomSha7}_badrole@example.com`,
      );
      createdUsers.push(created.user.id);

      const result = await admin.sdk.adminUsersControllerUpdateV1({
        path: { id: created.user.id },
        // Deliberately invalid: the contract allows USER, ADMIN and GUEST.
        body: { role: 'ROOT' as unknown as 'USER' },
      });

      expect(result.response?.status).toBe(400);
      expect(messageOf(result.error)).toMatch(/role must be one of/i);
    });
  });

  describe('deleting accounts', () => {
    it('revokes every key of a deleted account (cascade)', async () => {
      const created = await admin.registerAccount(
        `test_${admin.randomSha7}_delete@example.com`,
      );
      const holder = new ActivityHelper();
      holder.loginByApiKey(created.apiKey.key);
      expect((await holder.getAuthProfile())?.user.id).toBe(created.user.id);

      const deleted = await admin.sdk.adminUsersControllerRemoveV1({
        path: { id: created.user.id },
      });

      expect(deleted.response?.status).toBe(204);
      const afterDelete = await holder.sdk.authControllerMeV1();
      expect(afterDelete.response?.status).toBe(401);
      expect(messageOf(afterDelete.error)).toMatch(/Invalid API key/i);

      const listed = await admin.sdk.adminUsersControllerGetV1({
        path: { id: created.user.id },
      });
      expect(listed.response?.status).toBe(404);
    });
  });
});
