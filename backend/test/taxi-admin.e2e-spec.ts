import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type {
  ChatMessageDto,
  TaxiCityDto,
  TaxiPriceMatrixDto,
} from './generated/client/types.gen.js';
import { ActivityHelper } from './utils/activity-helper.js';
import { messageOf, unwrap } from './utils/api-result.js';

/**
 * E2E over the taxi admin console APIs (running backend):
 *   - dictionaries: cities, extra services, departure slots, passenger
 *     options, drivers with nested cars (create → list → patch → delete,
 *     400/409 negatives);
 *   - price matrix: one manual pair with symmetric reads, then auto-calc
 *     from the extreme-cities price with intermediate pair checks;
 *   - orders: an order submitted through the real wizard (chat API) is
 *     listed with its full snapshot (passenger, route, slot, services,
 *     prices, assigned car), moved through the status flow and hidden by
 *     the default filter once completed.
 *
 * Fixture hygiene (skill `e2e-fixture-hygiene`): the seeded `admin` key is
 * only used for admin-side account calls (register / promote / remove);
 * every taxi call runs behind the test-spawned `adminA` ADMIN key. The
 * suite deletes only its own records. Taxi dictionaries are global (no
 * owner column), so created ids are tracked explicitly and never wiped by
 * list; seeded dictionaries are read-only here — they are only *used* (ids
 * looked up, wizard options picked). Deleting a user cascades his orders
 * and drafts, which in turn releases the references that would otherwise
 * block city deletion (cities may not be removed while orders cite them).
 *
 * Matrix residue: `auto-calc` overwrites the price of every pair among
 * active cities, including seeded↔seeded pairs, and the API has no
 * delete-a-pair endpoint. Prices that existed before the suite are
 * snapshotted and restored in teardown; pair rows newly created between
 * seeded cities necessarily remain (the matrix is admin-filled data and
 * the seed itself creates no prices).
 */
describe('Taxi admin console (e2e, running backend)', () => {
  /** Seeded ADMIN — only used for `admin/users` side calls in this suite. */
  const admin = new ActivityHelper();
  /** Test-owned ADMIN — every dictionary/matrix/order call below. */
  const adminA = new ActivityHelper();
  /** Test-owned USER — proves 403 on non-admin keys. */
  const plain = new ActivityHelper();
  /**
   * Riders driving the wizard through the chat API. One helper is reused
   * and re-logged for each fresh registration (same pattern as the
   * settings-plugin suite).
   */
  const rider = new ActivityHelper();

  /** Rider/user accounts removed first in teardown (their orders cascade). */
  const createdUsers: string[] = [];
  /** The test-spawned ADMIN's own account — removed last (its key cleans up). */
  let adminAUserId = '';
  const createdCityIds: string[] = [];
  const createdServiceIds: string[] = [];
  const createdSlotIds: string[] = [];
  const createdOptionIds: string[] = [];
  const createdDriverIds: string[] = [];

  /** Prices present before this suite; restored in teardown. */
  let matrixBackup: TaxiPriceMatrixDto | null = null;
  /** Test-spawned keys, re-presented in teardown. */
  let adminAKey = '';
  let plainKey = '';

  /** Wizard route cities: 1000 km and 1200 km — both above the seeded 700. */
  let cityA!: TaxiCityDto;
  let cityB!: TaxiCityDto;

  beforeAll(async () => {
    await admin.ensureBackendRunning();
    admin.loginAsAdmin();

    const spawned = await admin.registerAccount(
      `test_${admin.randomSha7}_taxi_admin@example.com`,
    );
    adminAUserId = spawned.user.id;
    await admin.sdk.adminUsersControllerUpdateV1({
      path: { id: spawned.user.id },
      body: { role: 'ADMIN' },
    });
    adminAKey = spawned.apiKey.key;
    adminA.loginByApiKey(adminAKey);

    const plainUser = await admin.registerAccount(
      `test_${admin.randomSha7}_taxi_user@example.com`,
    );
    createdUsers.push(plainUser.user.id);
    plainKey = plainUser.apiKey.key;
    plain.loginByApiKey(plainKey);

    // Snapshot before any write, then create the route cities the matrix
    // and wizard tests share.
    matrixBackup = unwrap(
      await adminA.sdk.taxiPriceMatrixControllerGetMatrixV1({}),
      'GET /taxi/price-matrix (backup)',
    );

    cityA = unwrap(
      await adminA.sdk.taxiCatalogControllerCreateCityV1({
        body: { name: `e2e-Откуда-${admin.randomSha7}`, distanceKm: 1000 },
      }),
      'POST /taxi/cities (cityA)',
    );
    createdCityIds.push(cityA.id);
    cityB = unwrap(
      await adminA.sdk.taxiCatalogControllerCreateCityV1({
        body: { name: `e2e-Куда-${admin.randomSha7}`, distanceKm: 1200 },
      }),
      'POST /taxi/cities (cityB)',
    );
    createdCityIds.push(cityB.id);
  });

  afterAll(async () => {
    // 1. Users first: removing a user cascades his taxi orders and drafts,
    //    so cities stop being referenced and cars stop being busy.
    admin.loginAsAdmin();
    for (const id of createdUsers) {
      await admin.removeAccountAsAdmin(id);
    }

    adminA.loginByApiKey(adminAKey);
    for (const id of createdDriverIds) {
      const result = await adminA.sdk.taxiCatalogControllerRemoveDriverV1({
        path: { id },
      });
      expect([204, 404]).toContain(result.response?.status);
    }
    for (const id of createdServiceIds) {
      const result = await adminA.sdk.taxiCatalogControllerRemoveServiceV1({
        path: { id },
      });
      expect([204, 404]).toContain(result.response?.status);
    }
    for (const id of createdSlotIds) {
      const result =
        await adminA.sdk.taxiCatalogControllerRemoveDepartureSlotV1({
          path: { id },
        });
      expect([204, 404]).toContain(result.response?.status);
    }
    for (const id of createdOptionIds) {
      const result =
        await adminA.sdk.taxiCatalogControllerRemovePassengerOptionV1({
          path: { id },
        });
      expect([204, 404]).toContain(result.response?.status);
    }
    for (const id of createdCityIds) {
      const result = await adminA.sdk.taxiCatalogControllerRemoveCityV1({
        path: { id },
      });
      // Deleting a city cascades every price pair involving it.
      expect([204, 404]).toContain(result.response?.status);
    }

    // 2. Restore matrix prices that existed before the suite (see the
    //    residue note in the header).
    if (matrixBackup) {
      for (const pair of matrixBackup.prices) {
        const result = await adminA.sdk.taxiPriceMatrixControllerSetPairPriceV1(
          {
            path: { fromCityId: pair.fromCityId, toCityId: pair.toCityId },
            body: { price: pair.price },
          },
        );
        expect(result.response?.status).toBe(200);
      }
    }

    // 3. Finally drop the test-spawned ADMIN account — after its key did
    //    the dictionary cleanup above.
    if (adminAUserId) {
      await admin.removeAccountAsAdmin(adminAUserId);
    }
  });

  /* ----------------------------- access control ----------------------------- */

  it('requires an admin key on every taxi admin endpoint', async () => {
    plain.logout();
    const anonCities = await plain.sdk.taxiCatalogControllerListCitiesV1({});
    expect(anonCities.response?.status).toBe(401);
    expect(messageOf(anonCities.error)).toMatch(/API key is required/i);

    const anonCreate = await plain.sdk.taxiCatalogControllerCreateCityV1({
      body: { name: 'e2e-аноним', distanceKm: 1 },
    });
    expect(anonCreate.response?.status).toBe(401);

    const anonOrders = await plain.sdk.taxiOrdersControllerListV1({});
    expect(anonOrders.response?.status).toBe(401);

    const anonMatrix = await plain.sdk.taxiPriceMatrixControllerGetMatrixV1({});
    expect(anonMatrix.response?.status).toBe(401);

    plain.loginByApiKey(plainKey);
    const forbidden = await plain.sdk.taxiCatalogControllerListCitiesV1({});
    expect(forbidden.response?.status).toBe(403);
    expect(messageOf(forbidden.error)).toMatch(/Admin access required/i);

    const forbiddenOrders = await plain.sdk.taxiOrdersControllerListV1({});
    expect(forbiddenOrders.response?.status).toBe(403);

    const forbiddenMatrix =
      await plain.sdk.taxiPriceMatrixControllerGetMatrixV1({});
    expect(forbiddenMatrix.response?.status).toBe(403);
  });

  /* -------------------------------- cities ---------------------------------- */

  it('manages cities: create, list, patch, delete with 409/400 negatives', async () => {
    const name = `e2e-Город-${admin.randomSha7}`;
    const created = unwrap(
      await adminA.sdk.taxiCatalogControllerCreateCityV1({
        body: { name, distanceKm: 1000 },
      }),
      'POST /taxi/cities',
    );
    expect(created.name).toBe(name);
    expect(created.distanceKm).toBe(1000);
    expect(created.isActive).toBe(true);
    createdCityIds.push(created.id);

    const list = unwrap(
      await adminA.sdk.taxiCatalogControllerListCitiesV1({}),
      'GET /taxi/cities',
    );
    expect(list.cities.some((city) => city.id === created.id)).toBe(true);

    const duplicate = await adminA.sdk.taxiCatalogControllerCreateCityV1({
      body: { name, distanceKm: 500 },
    });
    expect(duplicate.response?.status).toBe(409);
    expect(messageOf(duplicate.error)).toMatch(/already exists/i);

    const emptyName = await adminA.sdk.taxiCatalogControllerCreateCityV1({
      body: { name: '   ', distanceKm: 500 },
    });
    expect(emptyName.response?.status).toBe(400);

    const negativeKm = await adminA.sdk.taxiCatalogControllerCreateCityV1({
      body: { name: `${name}-2`, distanceKm: -5 },
    });
    expect(negativeKm.response?.status).toBe(400);

    const renamed = unwrap(
      await adminA.sdk.taxiCatalogControllerUpdateCityV1({
        path: { id: created.id },
        body: { name: `${name}-v2`, distanceKm: 1050 },
      }),
      'PATCH /taxi/cities/:id',
    );
    expect(renamed.name).toBe(`${name}-v2`);
    expect(renamed.distanceKm).toBe(1050);

    const after = unwrap(
      await adminA.sdk.taxiCatalogControllerListCitiesV1({}),
      'GET /taxi/cities (after patch)',
    );
    const found = after.cities.find((city) => city.id === created.id);
    expect(found?.name).toBe(`${name}-v2`);

    const removed = await adminA.sdk.taxiCatalogControllerRemoveCityV1({
      path: { id: created.id },
    });
    expect(removed.response?.status).toBe(204);

    const cleaned = unwrap(
      await adminA.sdk.taxiCatalogControllerListCitiesV1({}),
      'GET /taxi/cities (after delete)',
    );
    expect(cleaned.cities.some((city) => city.id === created.id)).toBe(false);
  });

  /* ------------------------------- services --------------------------------- */

  it('manages extra services: car-feature flag, duplicates, invalid surcharge', async () => {
    const name = `e2e-Услуга-${admin.randomSha7}`;
    const created = unwrap(
      await adminA.sdk.taxiCatalogControllerCreateServiceV1({
        body: { name, surcharge: 150, isCarFeature: true },
      }),
      'POST /taxi/services',
    );
    expect(created.isActive).toBe(true);
    expect(created.isCarFeature).toBe(true);
    createdServiceIds.push(created.id);

    const duplicate = await adminA.sdk.taxiCatalogControllerCreateServiceV1({
      body: { name, surcharge: 100 },
    });
    expect(duplicate.response?.status).toBe(409);

    const negative = await adminA.sdk.taxiCatalogControllerCreateServiceV1({
      body: { name: `${name}-2`, surcharge: -1 },
    });
    expect(negative.response?.status).toBe(400);

    const emptyName = await adminA.sdk.taxiCatalogControllerCreateServiceV1({
      body: { name: '', surcharge: 100 },
    });
    expect(emptyName.response?.status).toBe(400);

    const updated = unwrap(
      await adminA.sdk.taxiCatalogControllerUpdateServiceV1({
        path: { id: created.id },
        body: { surcharge: 200 },
      }),
      'PATCH /taxi/services/:id',
    );
    expect(updated.surcharge).toBe(200);

    const removed = await adminA.sdk.taxiCatalogControllerRemoveServiceV1({
      path: { id: created.id },
    });
    expect(removed.response?.status).toBe(204);
  });

  /* --------------------------- departure slots ------------------------------ */

  it('manages departure slots: unique time, invalid format', async () => {
    // A sha-derived time outside the seeded 08:00/12:00/16:00/20:00 set, so
    // an interrupted earlier run cannot collide with a fixed value.
    const slotTime = slotTimeFromSha(admin.randomSha7);
    const created = unwrap(
      await adminA.sdk.taxiCatalogControllerCreateDepartureSlotV1({
        body: { time: slotTime },
      }),
      'POST /taxi/departure-slots',
    );
    expect(created.time).toBe(slotTime);
    createdSlotIds.push(created.id);

    const duplicate =
      await adminA.sdk.taxiCatalogControllerCreateDepartureSlotV1({
        body: { time: slotTime },
      });
    expect(duplicate.response?.status).toBe(409);

    const invalid = await adminA.sdk.taxiCatalogControllerCreateDepartureSlotV1(
      { body: { time: '25:00' } },
    );
    expect(invalid.response?.status).toBe(400);

    const updated = unwrap(
      await adminA.sdk.taxiCatalogControllerUpdateDepartureSlotV1({
        path: { id: created.id },
        body: { time: '09:45' },
      }),
      'PATCH /taxi/departure-slots/:id',
    );
    expect(updated.time).toBe('09:45');

    const removed = await adminA.sdk.taxiCatalogControllerRemoveDepartureSlotV1(
      { path: { id: created.id } },
    );
    expect(removed.response?.status).toBe(204);
  });

  /* --------------------------- passenger options ---------------------------- */

  it('manages passenger options: positive counts only, duplicates conflict', async () => {
    // Above the seeded 1..4 set; derived from the run's sha so an
    // interrupted earlier run cannot collide with a fixed value.
    const count = 6 + (Number.parseInt(admin.randomSha7.slice(0, 2), 16) % 4);
    const created = unwrap(
      await adminA.sdk.taxiCatalogControllerCreatePassengerOptionV1({
        body: { count },
      }),
      'POST /taxi/passenger-options',
    );
    expect(created.count).toBe(count);
    createdOptionIds.push(created.id);

    const duplicate =
      await adminA.sdk.taxiCatalogControllerCreatePassengerOptionV1({
        body: { count },
      });
    expect(duplicate.response?.status).toBe(409);

    const zero = await adminA.sdk.taxiCatalogControllerCreatePassengerOptionV1({
      body: { count: 0 },
    });
    expect(zero.response?.status).toBe(400);

    const updated = unwrap(
      await adminA.sdk.taxiCatalogControllerUpdatePassengerOptionV1({
        path: { id: created.id },
        body: { count: count + 1 },
      }),
      'PATCH /taxi/passenger-options/:id',
    );
    expect(updated.count).toBe(count + 1);

    const removed =
      await adminA.sdk.taxiCatalogControllerRemovePassengerOptionV1({
        path: { id: created.id },
      });
    expect(removed.response?.status).toBe(204);
  });

  /* ------------------------- drivers with their cars ------------------------ */

  it('manages drivers and nested cars: features, duplicate plate, busy rules', async () => {
    // A car-feature service and a plain one for the negative case.
    const feature = unwrap(
      await adminA.sdk.taxiCatalogControllerCreateServiceV1({
        body: {
          name: `e2e-Оснащение-${admin.randomSha7}`,
          surcharge: 0,
          isCarFeature: true,
        },
      }),
      'POST /taxi/services (feature)',
    );
    createdServiceIds.push(feature.id);
    const plainService = unwrap(
      await adminA.sdk.taxiCatalogControllerCreateServiceV1({
        body: { name: `e2e-Обычная-${admin.randomSha7}`, surcharge: 50 },
      }),
      'POST /taxi/services (plain)',
    );
    createdServiceIds.push(plainService.id);

    const driver = unwrap(
      await adminA.sdk.taxiCatalogControllerCreateDriverV1({
        body: {
          fullName: `e2e-Водитель-${admin.randomSha7}`,
          phone: '+7-900-000-00-00',
        },
      }),
      'POST /taxi/drivers',
    );
    expect(driver.isActive).toBe(true);
    createdDriverIds.push(driver.id);

    const plate = `Е${admin.randomSha7.toUpperCase()}77`;
    const car = unwrap(
      await adminA.sdk.taxiCatalogControllerCreateCarV1({
        path: { driverId: driver.id },
        body: {
          model: 'e2e-Toyota Alphard',
          plate,
          seats: 4,
          color: 'чёрный',
          featureServiceIds: [feature.id],
        },
      }),
      'POST /taxi/drivers/:id/cars',
    );
    expect(car.plate).toBe(plate);
    expect(car.features.map((item) => item.name)).toContain(feature.name);

    const carsOfDriver = unwrap(
      await adminA.sdk.taxiCatalogControllerListCarsV1({
        path: { driverId: driver.id },
      }),
      'GET /taxi/drivers/:id/cars',
    );
    expect(carsOfDriver.cars.some((item) => item.id === car.id)).toBe(true);

    const duplicatePlate = await adminA.sdk.taxiCatalogControllerCreateCarV1({
      path: { driverId: driver.id },
      body: { model: 'e2e-Дубль', plate, seats: 2 },
    });
    expect(duplicatePlate.response?.status).toBe(409);
    expect(messageOf(duplicatePlate.error)).toMatch(/plate already exists/i);

    const zeroSeats = await adminA.sdk.taxiCatalogControllerCreateCarV1({
      path: { driverId: driver.id },
      body: {
        model: 'e2e-Без мест',
        plate: `Е${admin.randomSha7.toUpperCase()}01`,
        seats: 0,
      },
    });
    expect(zeroSeats.response?.status).toBe(400);

    const notAFeature = await adminA.sdk.taxiCatalogControllerCreateCarV1({
      path: { driverId: driver.id },
      body: {
        model: 'e2e-Не оснащение',
        plate: `Е${admin.randomSha7.toUpperCase()}02`,
        seats: 2,
        featureServiceIds: [plainService.id],
      },
    });
    expect(notAFeature.response?.status).toBe(400);

    const updatedCar = unwrap(
      await adminA.sdk.taxiCatalogControllerUpdateCarV1({
        path: { driverId: driver.id, carId: car.id },
        body: { seats: 5, featureServiceIds: [feature.id] },
      }),
      'PATCH /taxi/drivers/:id/cars/:carId',
    );
    expect(updatedCar.seats).toBe(5);

    const updatedDriver = unwrap(
      await adminA.sdk.taxiCatalogControllerUpdateDriverV1({
        path: { id: driver.id },
        body: { phone: '+7-900-000-00-01' },
      }),
      'PATCH /taxi/drivers/:id',
    );
    expect(updatedDriver.phone).toBe('+7-900-000-00-01');

    const removedCar = await adminA.sdk.taxiCatalogControllerRemoveCarV1({
      path: { driverId: driver.id, carId: car.id },
    });
    expect(removedCar.response?.status).toBe(204);

    const removedDriver = await adminA.sdk.taxiCatalogControllerRemoveDriverV1({
      path: { id: driver.id },
    });
    expect(removedDriver.response?.status).toBe(204);

    const driversLeft = unwrap(
      await adminA.sdk.taxiCatalogControllerListDriversV1({}),
      'GET /taxi/drivers',
    );
    expect(driversLeft.drivers.some((item) => item.id === driver.id)).toBe(
      false,
    );
  });

  /* ------------------------------ price matrix ------------------------------ */

  it('stores one symmetric price per pair and validates inputs', async () => {
    const setPrice = unwrap(
      await adminA.sdk.taxiPriceMatrixControllerSetPairPriceV1({
        path: { fromCityId: cityA.id, toCityId: cityB.id },
        body: { price: 5000 },
      }),
      'PUT /taxi/price-matrix (A→B)',
    );
    expect(setPrice.price).toBe(5000);

    let matrix = unwrap(
      await adminA.sdk.taxiPriceMatrixControllerGetMatrixV1({}),
      'GET /taxi/price-matrix',
    );
    expect(pairPriceOf(matrix, cityA.id, cityB.id)).toBe(5000);

    // Reverse order addresses the same normalized row.
    const reversed = unwrap(
      await adminA.sdk.taxiPriceMatrixControllerSetPairPriceV1({
        path: { fromCityId: cityB.id, toCityId: cityA.id },
        body: { price: 5100 },
      }),
      'PUT /taxi/price-matrix (B→A)',
    );
    expect(reversed.price).toBe(5100);

    matrix = unwrap(
      await adminA.sdk.taxiPriceMatrixControllerGetMatrixV1({}),
      'GET /taxi/price-matrix (after reverse)',
    );
    expect(pairPriceOf(matrix, cityA.id, cityB.id)).toBe(5100);
    const rowsForPair = matrix.prices.filter(
      (price) =>
        (price.fromCityId === cityA.id && price.toCityId === cityB.id) ||
        (price.fromCityId === cityB.id && price.toCityId === cityA.id),
    );
    expect(rowsForPair).toHaveLength(1);

    const sameCity = await adminA.sdk.taxiPriceMatrixControllerSetPairPriceV1({
      path: { fromCityId: cityA.id, toCityId: cityA.id },
      body: { price: 100 },
    });
    expect(sameCity.response?.status).toBe(400);

    const negative = await adminA.sdk.taxiPriceMatrixControllerSetPairPriceV1({
      path: { fromCityId: cityA.id, toCityId: cityB.id },
      body: { price: -100 },
    });
    expect(negative.response?.status).toBe(400);

    const fractional = await adminA.sdk.taxiPriceMatrixControllerSetPairPriceV1(
      {
        path: { fromCityId: cityA.id, toCityId: cityB.id },
        body: { price: 99.5 },
      },
    );
    expect(fractional.response?.status).toBe(400);

    const unknownCity =
      await adminA.sdk.taxiPriceMatrixControllerSetPairPriceV1({
        path: { fromCityId: cityA.id, toCityId: 'no-such-city' },
        body: { price: 100 },
      });
    expect(unknownCity.response?.status).toBe(404);
  });

  it('auto-calculates every pair from the extreme-cities price', async () => {
    // A known pre-existing price that must be overwritten, not summed.
    unwrap(
      await adminA.sdk.taxiPriceMatrixControllerSetPairPriceV1({
        path: { fromCityId: cityA.id, toCityId: cityB.id },
        body: { price: 9999 },
      }),
      'PUT /taxi/price-matrix (pre auto-calc)',
    );

    // Seeded extremes: Москва 0 km is the minimum; cityB (1200 km) is the
    // maximum. 4800 / 1200 = 4 ₽/km — every intermediate pair lands on an
    // exact integer, so the rounding tolerance is trivially satisfied.
    const before = unwrap(
      await adminA.sdk.taxiPriceMatrixControllerGetMatrixV1({}),
      'GET /taxi/price-matrix (before auto-calc)',
    );
    const moscow = before.cities.find((city) => city.name === 'Москва');
    const tver = before.cities.find((city) => city.name === 'Тверь');
    const spb = before.cities.find((city) => city.name === 'Санкт-Петербург');
    expect(moscow).toBeDefined();
    expect(tver).toBeDefined();
    expect(spb).toBeDefined();
    expect(moscow!.distanceKm).toBe(0);
    expect(cityB.distanceKm).toBeGreaterThan(spb!.distanceKm);

    const result = unwrap(
      await adminA.sdk.taxiPriceMatrixControllerAutoCalcV1({
        body: { price: 4800 },
      }),
      'POST /taxi/price-matrix/auto-calc',
    );
    expect(result.pairs).toBeGreaterThan(0);

    const matrix = unwrap(
      await adminA.sdk.taxiPriceMatrixControllerGetMatrixV1({}),
      'GET /taxi/price-matrix (after auto-calc)',
    );
    // Extreme pair receives the entered price exactly.
    expect(pairPriceOf(matrix, moscow!.id, cityB.id)).toBe(4800);
    // Intermediate pairs: round(|Δkm| × 4800 / 1200).
    expect(pairPriceOf(matrix, cityA.id, cityB.id)).toBe(800); // 200 km, overwritten from 9999
    expect(pairPriceOf(matrix, moscow!.id, cityA.id)).toBe(4000); // 1000 km
    expect(pairPriceOf(matrix, tver!.id, cityB.id)).toBe(4132); // 1033 km
    expect(pairPriceOf(matrix, spb!.id, cityA.id)).toBe(1200); // 300 km
  });

  /* ----------------------- orders submitted by the wizard ------------------- */

  /**
   * Registers a fresh USER, re-logs the shared rider helper into it and
   * returns the email the admin order list will show for the passenger.
   */
  const registerRider = async (tag: string): Promise<string> => {
    admin.loginAsAdmin();
    const registered = await admin.registerAccount(
      `test_${admin.randomSha7}_${tag}@example.com`,
    );
    createdUsers.push(registered.user.id);
    rider.loginByApiKey(registered.apiKey.key);
    return registered.user.email;
  };

  /**
   * Waits for a BOT message newer than `previousId`. The backend normally
   * persists the plugin reply before the POST returns, but the periodic
   * recovery sweep may claim a just-created task first and deliver the
   * reply a moment later (bot-plugins.service.ts, SWEEP_INTERVAL_MS) — the
   * poll absorbs that race.
   */
  const waitForBotReply = async (
    previousId: string | null,
  ): Promise<ChatMessageDto> => {
    const deadline = Date.now() + 10_000;
    for (;;) {
      const history = unwrap(
        await rider.sdk.chatControllerGetMessagesV1({}),
        'GET /chat/messages',
      );
      const reply = [...history].reverse().find((m) => m.senderRole === 'BOT');
      if (reply && reply.id !== previousId) {
        // Design D4: every wizard step must stay within the platform's
        // 12-button cap — the dispatcher silently drops invalid replies, so
        // a violation here means a broken (unanswered) step elsewhere.
        expect(reply.buttons?.length ?? 0).toBeLessThanOrEqual(12);
        return reply;
      }
      if (Date.now() > deadline) {
        throw new Error(
          `the taxi plugin did not reply within 10s (previous bot message: ${previousId ?? 'none'})`,
        );
      }
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
  };

  /** Performs one wizard interaction and waits for its fresh reply. */
  const wizardStep = async (
    previousId: string | null,
    action: () => Promise<void>,
  ): Promise<ChatMessageDto> => {
    await action();
    return waitForBotReply(previousId);
  };

  const buttonOf = (
    reply: ChatMessageDto,
    callbackData: string,
  ): { title: string; callbackData: string } | undefined =>
    reply.buttons?.find((button) => button.callbackData === callbackData);

  /** Payload match that tolerates the page suffix on svc buttons. */
  const matchesPayload = (
    button: { callbackData: string },
    target: string,
  ): boolean =>
    button.callbackData === target ||
    button.callbackData.startsWith(`${target}:`);

  /**
   * Finds a wizard button across the step's pages (design D4: long
   * dictionaries render in 8-item portions): walks forward via the highest
   * `taxi:page:` nav button until the target becomes visible, mimicking a
   * real user paging through the step.
   */
  const findButtonAcrossPages = async (
    startReply: ChatMessageDto,
    target: string,
  ): Promise<{
    reply: ChatMessageDto;
    button: { title: string; callbackData: string };
  }> => {
    let reply = startReply;
    for (let hop = 0; hop < 10; hop += 1) {
      const button = reply.buttons?.find((b) => matchesPayload(b, target));
      if (button) {
        return { reply, button };
      }
      const navPages = (reply.buttons ?? [])
        .map((b) => /^taxi:page:(\d+)$/.exec(b.callbackData))
        .filter((match): match is RegExpExecArray => match !== null)
        .map((match) => Number(match[1]));
      if (navPages.length === 0) {
        throw new Error(
          `wizard button ${target} unreachable: no page navigation on "${reply.content.slice(0, 60)}"`,
        );
      }
      reply = await wizardStep(reply.id, () =>
        press(`taxi:page:${Math.max(...navPages)}`),
      );
    }
    throw new Error(`wizard button ${target} not found within 10 page hops`);
  };

  /** Presses a wizard button through whatever page currently holds it. */
  const pressViaPages = async (
    reply: ChatMessageDto,
    target: string,
  ): Promise<ChatMessageDto> => {
    const found = await findButtonAcrossPages(reply, target);
    return wizardStep(found.reply.id, () => press(found.button.callbackData));
  };

  /** Sends a text as the rider; the plugin reply is persisted inline. */
  const sendText = async (content: string): Promise<void> => {
    unwrap(
      await rider.sdk.chatControllerSendMessageV1({ body: { content } }),
      `POST /chat/messages (${content})`,
    );
  };

  /** Presses a wizard button as the rider. */
  const press = async (callbackData: string): Promise<void> => {
    unwrap(
      await rider.sdk.chatControllerSubmitButtonCallbackV1({
        body: { callbackData },
      }),
      `POST /chat/button-callbacks (${callbackData})`,
    );
  };

  /**
   * Drives one rider through the whole wizard and returns the final BOT
   * reply ("Order #... submitted!"). Every intermediate step is asserted
   * so a broken flow fails close to its cause.
   */
  const submitOrder = async (fx: {
    fromCityId: string;
    toCityId: string;
    slotId: string;
    serviceId: string;
    passengerOptionId: string;
  }): Promise<ChatMessageDto> => {
    let reply = await wizardStep(null, () => sendText('/taxi'));
    expect(reply.content).toContain('Step 1/6');

    // Every selection goes through the page walker: dictionaries longer
    // than one page hide later options behind «Далее» (design D4).
    reply = await pressViaPages(reply, `taxi:from:${fx.fromCityId}`);
    expect(reply.content).toContain('Step 2/6');

    reply = await pressViaPages(reply, `taxi:to:${fx.toCityId}`);
    expect(reply.content).toContain('Step 3/6');

    reply = await pressViaPages(reply, `taxi:slot:${fx.slotId}`);
    expect(reply.content).toContain('Step 4/6');

    reply = await pressViaPages(reply, `taxi:pax:${fx.passengerOptionId}`);
    expect(reply.content).toContain('Step 5/6');

    // The fixture service may live on a later page; the toggle re-renders
    // that page with the ✓ marker (its payload carries the current page).
    reply = await pressViaPages(reply, `taxi:svc:${fx.serviceId}`);
    expect(reply.content).toContain('Step 5/6');
    const marked = await findButtonAcrossPages(
      reply,
      `taxi:svc:${fx.serviceId}`,
    );
    expect(marked.button.title.startsWith('✓ ')).toBe(true);

    reply = await wizardStep(marked.reply.id, () => press('taxi:done'));
    expect(reply.content).toContain('Step 6/6');
    expect(buttonOf(reply, 'taxi:confirm')).toBeDefined();

    return wizardStep(reply.id, () => press('taxi:confirm'));
  };

  // Two full wizard drives live here — far above the default 5s test budget.
  it('lists a wizard order with its snapshot, flows the status and frees the car', async () => {
    // Wizard fixture: car-feature service, slot, driver + car, pair price.
    const service = unwrap(
      await adminA.sdk.taxiCatalogControllerCreateServiceV1({
        body: {
          name: `e2e-Кресло-${admin.randomSha7}`,
          surcharge: 150,
          isCarFeature: true,
        },
      }),
      'POST /taxi/services (wizard)',
    );
    createdServiceIds.push(service.id);

    const wizardSlotTime = slotTimeFromSha(admin.randomSha7);
    const slot = unwrap(
      await adminA.sdk.taxiCatalogControllerCreateDepartureSlotV1({
        body: { time: wizardSlotTime },
      }),
      'POST /taxi/departure-slots (wizard)',
    );
    createdSlotIds.push(slot.id);

    const driver = unwrap(
      await adminA.sdk.taxiCatalogControllerCreateDriverV1({
        body: {
          fullName: `e2e-Шофёр-${admin.randomSha7}`,
          phone: '+7-900-111-11-11',
        },
      }),
      'POST /taxi/drivers (wizard)',
    );
    createdDriverIds.push(driver.id);

    const plate = `Е${admin.randomSha7.toUpperCase()}99`;
    const car = unwrap(
      await adminA.sdk.taxiCatalogControllerCreateCarV1({
        path: { driverId: driver.id },
        body: {
          model: 'e2e-Hyundai Staria',
          plate,
          seats: 4,
          color: 'белый',
          featureServiceIds: [service.id],
        },
      }),
      'POST /taxi/drivers/:id/cars (wizard)',
    );

    unwrap(
      await adminA.sdk.taxiPriceMatrixControllerSetPairPriceV1({
        path: { fromCityId: cityA.id, toCityId: cityB.id },
        body: { price: 5000 },
      }),
      'PUT /taxi/price-matrix (wizard route)',
    );

    // The wizard's passenger step: seeded option "2 passengers" (read-only).
    const options = unwrap(
      await adminA.sdk.taxiCatalogControllerListPassengerOptionsV1({}),
      'GET /taxi/passenger-options',
    );
    const twoPassengers = options.options.find((option) => option.count === 2);
    expect(twoPassengers).toBeDefined();

    const riderOneEmail = await registerRider('taxi-order-one');
    const reply = await submitOrder({
      fromCityId: cityA.id,
      toCityId: cityB.id,
      slotId: slot.id,
      serviceId: service.id,
      passengerOptionId: twoPassengers!.id,
    });
    // Order ids are cuids, so the shortened suffix is base36.
    expect(reply.content).toMatch(/Order #[0-9A-Z]{6} submitted!/);
    expect(reply.content).toContain(car.model);
    expect(reply.content).toContain(plate);
    expect(reply.content).toContain(driver.fullName);

    // The admin list shows the full immutable snapshot.
    const active = unwrap(
      await adminA.sdk.taxiOrdersControllerListV1({}),
      'GET /taxi/orders (default)',
    );
    const order = active.orders.find(
      (item) => item.passengerEmail === riderOneEmail,
    );
    expect(order).toBeDefined();
    expect(order!.status).toBe('NEW');
    expect(order!.fromCityName).toBe(cityA.name);
    expect(order!.toCityName).toBe(cityB.name);
    expect(order!.departureSlotLabel).toBe(wizardSlotTime);
    expect(order!.passengerCount).toBe(2);
    expect(order!.services).toEqual([
      { id: service.id, name: service.name, surcharge: 150 },
    ]);
    expect(order!.priceBase).toBe(5000);
    expect(order!.priceTotal).toBe(5150);
    expect(order!.carSnapshot).toEqual({
      driverName: driver.fullName,
      model: car.model,
      plate,
      color: 'белый',
    });
    expect(order!.createdAt).toBeDefined();

    // NEW → CONFIRMED keeps the car busy.
    const confirmed = unwrap(
      await adminA.sdk.taxiOrdersControllerUpdateStatusV1({
        path: { id: order!.id },
        body: { status: 'CONFIRMED' },
      }),
      'PATCH /taxi/orders/:id (CONFIRMED)',
    );
    expect(confirmed.status).toBe('CONFIRMED');

    const busyCar = await adminA.sdk.taxiCatalogControllerRemoveCarV1({
      path: { driverId: driver.id, carId: car.id },
    });
    expect(busyCar.response?.status).toBe(400);
    expect(messageOf(busyCar.error)).toMatch(/busy/i);

    // Cities cited by submitted orders cannot be deleted either.
    const blockedCity = await adminA.sdk.taxiCatalogControllerRemoveCityV1({
      path: { id: cityA.id },
    });
    expect(blockedCity.response?.status).toBe(400);
    expect(messageOf(blockedCity.error)).toMatch(/cannot be deleted/i);

    // Status and id validation.
    const unknownStatus = await adminA.sdk.taxiOrdersControllerUpdateStatusV1({
      path: { id: order!.id },
      body: { status: BOGUS_STATUS },
    });
    expect(unknownStatus.response?.status).toBe(400);

    const unknownOrder = await adminA.sdk.taxiOrdersControllerUpdateStatusV1({
      path: { id: 'no-such-order' },
      body: { status: 'CONFIRMED' },
    });
    expect(unknownOrder.response?.status).toBe(404);

    // COMPLETED releases the car — verified by the reassignment below.
    const completed = unwrap(
      await adminA.sdk.taxiOrdersControllerUpdateStatusV1({
        path: { id: order!.id },
        body: { status: 'COMPLETED' },
      }),
      'PATCH /taxi/orders/:id (COMPLETED)',
    );
    expect(completed.status).toBe('COMPLETED');

    // Default filter hides the completed order; the explicit one finds it.
    const stillActive = unwrap(
      await adminA.sdk.taxiOrdersControllerListV1({}),
      'GET /taxi/orders (default, after COMPLETED)',
    );
    expect(
      stillActive.orders.some((item) => item.passengerEmail === riderOneEmail),
    ).toBe(false);

    const finished = unwrap(
      await adminA.sdk.taxiOrdersControllerListV1({
        query: { status: 'COMPLETED' },
      }),
      'GET /taxi/orders?status=COMPLETED',
    );
    expect(finished.orders.some((item) => item.id === order!.id)).toBe(true);

    // The released car is picked again by the next wizard order: the same
    // plate reappears, proving COMPLETED freed it for assignment.
    const riderTwoEmail = await registerRider('taxi-order-two');
    await submitOrder({
      fromCityId: cityA.id,
      toCityId: cityB.id,
      slotId: slot.id,
      serviceId: service.id,
      passengerOptionId: twoPassengers!.id,
    });
    const afterSecond = unwrap(
      await adminA.sdk.taxiOrdersControllerListV1({}),
      'GET /taxi/orders (second order)',
    );
    const second = afterSecond.orders.find(
      (item) => item.passengerEmail === riderTwoEmail,
    );
    expect(second).toBeDefined();
    expect(second!.status).toBe('NEW');
    expect(second!.carSnapshot?.plate).toBe(plate);

    // Dictionary edits after submission do not change the snapshot.
    const originalName = cityA.name;
    unwrap(
      await adminA.sdk.taxiCatalogControllerUpdateCityV1({
        path: { id: cityA.id },
        body: { name: `${originalName}-переименован` },
      }),
      'PATCH /taxi/cities/:id (rename after order)',
    );
    const afterRename = unwrap(
      await adminA.sdk.taxiOrdersControllerListV1({}),
      'GET /taxi/orders (after rename)',
    );
    const renamedOrder = afterRename.orders.find(
      (item) => item.id === second!.id,
    );
    expect(renamedOrder?.fromCityName).toBe(originalName);

    // A stopped wizard leaves a DRAFT that is invisible to the admin list.
    const riderThreeEmail = await registerRider('taxi-draft');
    const draftReply = await wizardStep(null, () => sendText('/taxi'));
    expect(draftReply.content).toContain('Step 1/6');

    const withDraft = unwrap(
      await adminA.sdk.taxiOrdersControllerListV1({}),
      'GET /taxi/orders (with draft)',
    );
    expect(
      withDraft.orders.some((item) => item.passengerEmail === riderThreeEmail),
    ).toBe(false);

    const draftFilter = await adminA.sdk.taxiOrdersControllerListV1({
      query: { status: DRAFT_STATUS },
    });
    expect(draftFilter.response?.status).toBe(400);
    expect(messageOf(draftFilter.error)).toMatch(/status must be one of/i);
  }, 30_000);
});

/** Deterministic HH:MM outside the seeded 08:00/12:00/16:00/20:00 set. */
function slotTimeFromSha(sha: string): string {
  const hour = Number.parseInt(sha.slice(0, 2), 16) % 24;
  const minute = Number.parseInt(sha.slice(2, 4), 16) % 60;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

/**
 * Status values the API contract forbids, used by the negative 400
 * scenarios: the generated SDK types the field strictly, but the service
 * must still reject garbage gracefully.
 */
const BOGUS_STATUS = 'BOGUS' as unknown as 'NEW';
const DRAFT_STATUS = 'DRAFT' as unknown as 'NEW';

/** Normalized pair price from the matrix or undefined when unset. */
function pairPriceOf(
  matrix: TaxiPriceMatrixDto,
  a: string,
  b: string,
): number | undefined {
  const [from, to] = a < b ? [a, b] : [b, a];
  return matrix.prices.find(
    (price) => price.fromCityId === from && price.toCityId === to,
  )?.price;
}
