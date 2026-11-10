# E2E Fixture Hygiene — Do Not Touch Seeded-Admin Data

## Rule

E2E specs under `backend/test/*.e2e-spec.ts` MUST NOT create, mutate or delete
any row owned by the seeded admin account (`admin@kaufman.bot`, the
`ADMIN_API_KEY` from `backend/.env`). This includes but is not limited to:

- `ButtonPreset` rows where `ownerId = admin.id`;
- `ApiKey` rows where `userId = admin.id`;
- `Conversation` / `Message` rows tied to the admin's chat identity;
- the admin's `User` profile itself (PATCH, role change, deletion).

The seeded admin is a **privileged operator**, not a fixture. Real work
presets, keys, and conversations can be stored under this account at any
time; a test that enumerates its list and wipes it in `afterAll` would
silently destroy product data on the developer machine and in CI.

## Allowed uses of the seeded admin key

The admin key may be presented **only** for these purposes:

| Call                                                | Purpose                                                                                                    |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `POST /api/v1/auth/register`                        | Create a fresh test account (its API key is returned in the response — reuse it, do not mint a second key) |
| `PATCH /api/v1/admin/users/:id` `{ role: 'ADMIN' }` | Promote a test-spawned account to ADMIN so it can own protected fixtures                                   |
| `DELETE /api/v1/admin/users/:id`                    | Tear down **test-spawned account ids** only (never the seeded admin's own id)                              |
| `GET /api/v1/admin/users*`                          | Read state for assertions                                                                                  |
| `DELETE /api/v1/admin/users/:self` (negative test)  | Assert that the API refuses the caller's own-account deletion with 403                                     |

Anything else — CRUD over `/mock-bot/presets`, `/chat/*`, `/api-keys/*`,
conversations, messages, or the admin's own profile — must go through a
**separate** `ActivityHelper` instance holding a test-spawned ADMIN key.

## Canonical pattern (button presets, and any future operator-owned resource)

```ts
// backend/test/<resource>.e2e-spec.ts
describe('<Resource> (e2e, running backend)', () => {
  // Seeded ADMIN — only used for admin/users register/promote/teardown.
  const admin = new ActivityHelper();
  // Test-owned ADMINs — every resource-mutating call runs behind these.
  const adminA = new ActivityHelper();
  const adminB = new ActivityHelper();

  const createdUsers: string[] = [];

  async function spawnAdmin(tag: string) {
    const reg = await admin.registerAccount(
      `test_${admin.randomSha7}_${tag}@example.com`,
    );
    createdUsers.push(reg.user.id);
    await admin.sdk.adminUsersControllerUpdateV1({
      path: { id: reg.user.id },
      body: { role: 'ADMIN' },
    });
    return reg.apiKey.key; // the key issued at registration already works
  }

  beforeAll(async () => {
    await admin.ensureBackendRunning();
    admin.loginAsAdmin();
    adminA.loginByApiKey(await spawnAdmin('resource-admin-a'));
    adminB.loginByApiKey(await spawnAdmin('resource-admin-b'));
  });

  afterAll(async () => {
    // Iterate ONLY the test-owned admins. Never `admin` itself.
    for (const owner of [adminA, adminB]) {
      const list = await owner.sdk.<resource>ControllerListV1();
      for (const row of (list.data ?? []) as <Resource>Dto[]) {
        await owner.sdk.<resource>ControllerRemoveV1({ path: { id: row.id } });
      }
    }
    // Cascade: ButtonPreset/ApiKey FKs are onDelete: Cascade, so removing
    // the test-spawned users drops any row the loop above missed.
    for (const id of createdUsers) {
      await admin.removeAccountAsAdmin(id);
    }
  });
});
```

Do not add `admin` to the `for (const owner of [...])` array. If a helper
call inside the test needs the seeded key (e.g. a promote/removeAccount
call), make it inline on the specific line — never widen the loop that
wipes rows.

## Why

1. `admin@kaufman.bot` is a real operator workspace shared across every
   developer's local database, CI runners and (post-migration) the
   production instance. Test cleanup must never be able to reach it.
2. `ActivityHelper` keeps the API key on `client.setConfig({ headers })`
   for the whole lifetime of the instance. One helper = one identity —
   reusing the same helper for a "promoted test admin" and for the seeded
   admin leaks the seeded key into cleanup loops. This is the same failure
   mode that the stateful-ActivityHelper rule already warns about; the
   present rule extends it to _data ownership_, not just auth headers.
3. `onDelete: Cascade` on `ButtonPreset.ownerId → User` guarantees a
   deterministic teardown path: remove the test user, and its presets
   disappear. Cleanup loops on top are belt-and-braces — they must stay
   scoped to test-owned users.

## Forbidden patterns

| Anti-pattern                                                                | What breaks                                                                                                                   |
| --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `for (const owner of [admin, adminA])` in `afterAll`                        | Wipes every preset owned by the seeded admin on the developer machine                                                         |
| `admin.sdk.<resource>ControllerCreateV1(...)` in a happy-path test          | Leaves a fixture row on the seeded admin; next `afterAll` may or may not delete it, and any real preset in between is at risk |
| `admin.loginAsAdmin()` inside individual tests                              | Silently switches identity back to the seeded key; combined with any admin-owned resource call it becomes an audit nightmare  |
| Reusing the seeded key as "the second admin" in an ownership-isolation test | Both callers resolve to the same `ownerId`, so the test proves nothing and both admin-side loops hit the same rows            |

## Self-check before committing

```bash
# From backend/:
grep -RnE 'admin\.sdk\.[a-zA-Z]+(Remove|Delete|Update|Create)V1' test/*.e2e-spec.ts
```

Legitimate hits are limited to:

- `admin.sdk.adminUsersControllerUpdateV1` — the promote call in
  `spawnAdmin`;
- `admin.sdk.adminUsersControllerRemoveV1` — the self-delete negative
  test in `admin-users.e2e-spec.ts`, and any remove call whose path id
  comes from `admin.registerAccount` earlier in the same test.

Anything else is a red flag: switch that call to a test-spawned
`adminA`/`adminB`/etc.

## Related files

| File                                      | Role                                                                                  |
| ----------------------------------------- | ------------------------------------------------------------------------------------- |
| `backend/test/utils/activity-helper.ts`   | Stateful client + `loginAsAdmin` / `registerAccount` / `removeAccountAsAdmin` helpers |
| `backend/test/button-presets.e2e-spec.ts` | Reference implementation of the pattern above                                         |
| `backend/test/admin-users.e2e-spec.ts`    | Legitimate uses of the seeded admin (self-delete negative + test-user cleanup)        |
| `backend/src/seed/seed.service.ts`        | Where `admin@kaufman.bot` is created; explains why it is a first-class operator       |
| `backend/.env`                            | Holds `ADMIN_API_KEY`; the value is the seeded admin's identity                       |
