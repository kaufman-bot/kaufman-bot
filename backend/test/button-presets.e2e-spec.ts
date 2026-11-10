import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ButtonPresetDto } from './generated/client/types.gen.js';
import { ActivityHelper } from './utils/activity-helper.js';
import { messageOf } from './utils/api-result.js';

/**
 * E2E over `POST/GET/PATCH/DELETE /api/v1/mock-bot/presets`.
 *
 * Presets are the operator-side reusable button sets. Two dimensions are
 * exercised here:
 *   - contract: create/list/patch/delete flows and the same 400 rules
 *     (empty body, invalid buttons) the console relies on;
 *   - ownership: what happens when a caller is not an ADMIN (403) and
 *     when two ADMINs each own their own presets (patch/remove on a
 *     foreign id still returns 404 without leaking which case it was).
 *
 * All preset CRUD in this suite runs behind two *test-spawned* ADMIN
 * keys (`adminA`, `adminB`). The seeded `admin` key is only used for
 * admin-side calls that register / promote / remove accounts — its own
 * preset list is never read or mutated, because it may contain real
 * product data that no test has any business deleting.
 */
describe('Button presets (e2e, running backend)', () => {
  /** Seeded ADMIN — only used for `admin/users` side calls in this suite. */
  const admin = new ActivityHelper();
  /** First test-owned ADMIN — happy-path, validation and "mine" side. */
  const adminA = new ActivityHelper();
  /** Second test-owned ADMIN — proves owner-scope isolation. */
  const adminB = new ActivityHelper();

  /** Registered user ids that the suite must delete during teardown. */
  const createdUsers: string[] = [];
  /** Preset ids created by any test; kept for reference in asserts. */
  const createdPresetIds: string[] = [];

  /**
   * Registers a fresh account, promotes it to ADMIN and returns the key
   * issued during registration (that key already belongs to the new
   * user, so no extra `POST /api-keys` is needed).
   */
  async function spawnAdmin(tag: string) {
    const reg = await admin.registerAccount(
      `test_${admin.randomSha7}_${tag}@example.com`,
    );
    createdUsers.push(reg.user.id);
    await admin.sdk.adminUsersControllerUpdateV1({
      path: { id: reg.user.id },
      body: { role: 'ADMIN' },
    });
    return { userId: reg.user.id, apiKey: reg.apiKey.key };
  }

  beforeAll(async () => {
    await admin.ensureBackendRunning();
    admin.loginAsAdmin();

    const a = await spawnAdmin('presets-admin-a');
    adminA.loginByApiKey(a.apiKey);
    const b = await spawnAdmin('presets-admin-b');
    adminB.loginByApiKey(b.apiKey);
  });

  afterAll(async () => {
    // Remove every preset the tests created via the two spawned ADMINs
    // so a repeated suite run does not accumulate rows. The seeded
    // `admin` key is deliberately skipped — its list may hold real
    // product presets and must stay untouched.
    for (const owner of [adminA, adminB]) {
      const list = await owner.sdk.buttonPresetsControllerListV1();
      for (const p of (list.data ?? []) as ButtonPresetDto[]) {
        await owner.sdk.buttonPresetsControllerRemoveV1({
          path: { id: p.id },
        });
      }
    }
    // The FK on ButtonPreset.ownerId is `onDelete: Cascade`, so deleting
    // the test-spawned users also drops any preset that slipped through
    // the loop above. The seeded admin's account is never removed.
    for (const id of createdUsers) {
      await admin.removeAccountAsAdmin(id);
    }
    // Silence unused-variable warning; createdPresetIds is only used by
    // individual tests that want to assert on the specific row they made.
    void createdPresetIds;
  });

  describe('access control', () => {
    it('rejects a request without an API key (401)', async () => {
      const anon = new ActivityHelper();
      const result = await anon.sdk.buttonPresetsControllerListV1();

      expect(result.response?.status).toBe(401);
      expect(messageOf(result.error)).toMatch(/API key is required/i);
    });

    it('rejects a USER API key with 403 (AdminGuard)', async () => {
      const plainUser = new ActivityHelper();
      const reg = await plainUser.registerAccount(
        `test_${plainUser.randomSha7}_presets-user@example.com`,
      );
      createdUsers.push(reg.user.id);
      plainUser.loginByApiKey(reg.apiKey.key);

      const result = await plainUser.sdk.buttonPresetsControllerListV1();

      expect(result.response?.status).toBe(403);
      expect(messageOf(result.error)).toMatch(/admin access required/i);
    });
  });

  describe('CRUD happy path', () => {
    it('create → list → patch → delete flows through the caller-owned set', async () => {
      const createResult = await adminA.sdk.buttonPresetsControllerCreateV1({
        body: {
          name: 'Confirm / Decline',
          buttons: [
            { title: 'Да', callbackData: 'yes' },
            { title: 'Нет', callbackData: 'no' },
          ],
        },
      });
      expect(createResult.response?.status).toBe(201);
      const created = createResult.data as ButtonPresetDto;
      expect(created.id).toBeDefined();
      expect(created.name).toBe('Confirm / Decline');
      expect(created.buttons).toEqual([
        { title: 'Да', callbackData: 'yes' },
        { title: 'Нет', callbackData: 'no' },
      ]);
      expect(created.ownerId).toBeDefined();
      createdPresetIds.push(created.id);

      // Listing shows the new preset.
      const listResult = await adminA.sdk.buttonPresetsControllerListV1();
      expect(listResult.response?.status).toBe(200);
      const list = listResult.data as ButtonPresetDto[];
      expect(list.find((p) => p.id === created.id)).toBeDefined();

      // Patch swaps both the name and the buttons.
      const patchResult = await adminA.sdk.buttonPresetsControllerUpdateV1({
        path: { id: created.id },
        body: {
          name: 'Renamed',
          buttons: [{ title: 'X', callbackData: 'x' }],
        },
      });
      expect(patchResult.response?.status).toBe(200);
      const patched = patchResult.data as ButtonPresetDto;
      expect(patched.name).toBe('Renamed');
      expect(patched.buttons).toEqual([{ title: 'X', callbackData: 'x' }]);

      // Delete → 204, and the row is gone.
      const removeResult = await adminA.sdk.buttonPresetsControllerRemoveV1({
        path: { id: created.id },
      });
      expect(removeResult.response?.status).toBe(204);

      const afterDelete = await adminA.sdk.buttonPresetsControllerListV1();
      const stillThere = (afterDelete.data as ButtonPresetDto[]).find(
        (p) => p.id === created.id,
      );
      expect(stillThere).toBeUndefined();
    });
  });

  describe('validation', () => {
    it('rejects an empty buttons list with 400', async () => {
      const result = await adminA.sdk.buttonPresetsControllerCreateV1({
        body: { name: 'Empty', buttons: [] },
      });

      expect(result.response?.status).toBe(400);
    });

    it('rejects a blank name with 400', async () => {
      const result = await adminA.sdk.buttonPresetsControllerCreateV1({
        body: {
          name: '   ',
          buttons: [{ title: 'a', callbackData: 'b' }],
        },
      });

      expect(result.response?.status).toBe(400);
      expect(messageOf(result.error)).toMatch(/name/i);
    });

    it('rejects a button with blank callbackData with 400', async () => {
      const result = await adminA.sdk.buttonPresetsControllerCreateV1({
        body: {
          name: 'Invalid',
          buttons: [{ title: 'Ok', callbackData: '  ' }],
        },
      });

      expect(result.response?.status).toBe(400);
      expect(messageOf(result.error)).toMatch(/callbackData/i);
    });

    it('rejects more than 12 buttons with 400', async () => {
      const buttons = Array.from({ length: 13 }, (_, i) => ({
        title: `t${i}`,
        callbackData: `c${i}`,
      }));
      const result = await adminA.sdk.buttonPresetsControllerCreateV1({
        body: { name: 'Too many', buttons },
      });

      expect(result.response?.status).toBe(400);
      expect(messageOf(result.error)).toMatch(/too many buttons/i);
    });
  });

  describe('ownership isolation', () => {
    it("each admin only sees their own presets, and cannot patch/remove the other's", async () => {
      // adminA creates one preset.
      const mine = await adminA.sdk.buttonPresetsControllerCreateV1({
        body: {
          name: 'Admin-A preset',
          buttons: [{ title: 'one', callbackData: 'one' }],
        },
      });
      expect(mine.response?.status).toBe(201);
      const mineId = (mine.data as ButtonPresetDto).id;
      createdPresetIds.push(mineId);

      // adminB sees none of adminA's rows and cannot patch or delete
      // them. Both non-owned lookups must yield 404 (not 403), so the
      // API does not disclose whether the row exists at all.
      const list2 = await adminB.sdk.buttonPresetsControllerListV1();
      const list2Data = (list2.data ?? []) as ButtonPresetDto[];
      expect(list2Data.find((p) => p.id === mineId)).toBeUndefined();

      const patchForeign = await adminB.sdk.buttonPresetsControllerUpdateV1({
        path: { id: mineId },
        body: { name: 'hijack' },
      });
      expect(patchForeign.response?.status).toBe(404);

      const deleteForeign = await adminB.sdk.buttonPresetsControllerRemoveV1({
        path: { id: mineId },
      });
      expect(deleteForeign.response?.status).toBe(404);

      // adminB makes its own preset; adminA must not see it either.
      const theirs = await adminB.sdk.buttonPresetsControllerCreateV1({
        body: {
          name: 'Admin-B preset',
          buttons: [{ title: 'two', callbackData: 'two' }],
        },
      });
      expect(theirs.response?.status).toBe(201);
      const theirsId = (theirs.data as ButtonPresetDto).id;

      const list1 = await adminA.sdk.buttonPresetsControllerListV1();
      const list1Data = (list1.data ?? []) as ButtonPresetDto[];
      expect(list1Data.find((p) => p.id === theirsId)).toBeUndefined();

      // Clean up adminB's preset through its owner (belt-and-braces;
      // afterAll also iterates each test-owned admin's list). The
      // seeded admin's list is not enumerated anywhere in this suite.
      await adminB.sdk.buttonPresetsControllerRemoveV1({
        path: { id: theirsId },
      });
    });

    it('patch on a non-existent id returns 404 (same shape as foreign)', async () => {
      const result = await adminA.sdk.buttonPresetsControllerUpdateV1({
        path: { id: 'does-not-exist' },
        body: { name: 'X' },
      });

      expect(result.response?.status).toBe(404);
    });
  });
});
