import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type {
  ChatMessageDto,
  ChatStreamEventDto,
  TaxiCityDto,
} from './generated/client/types.gen.js';
import { ActivityHelper } from './utils/activity-helper.js';
import { unwrap } from './utils/api-result.js';

/**
 * Exact English replies the wizard sends for the refusal/exit branches
 * (TEXTS in src/plugins/taxi.plugin.ts) — fresh accounts default to `en`,
 * so the whole suite asserts the English contract.
 */
const NO_PRICE_TEXT =
  'No price is set for this route yet. Start over: send /taxi.';
const NO_CAR_TEXT =
  'There is no free car matching your request (seats or equipment) ' +
  'right now. Change the request via /taxi or try again later — ' +
  'your draft is kept.';
const CANCELLED_TEXT = 'The taxi wizard is cancelled, the draft is deleted.';

/**
 * E2E over the taxi ORDER WIZARD (running backend), driven like a real
 * chat client:
 *   - steps arrive both through the user's SSE stream (GET /chat/stream)
 *     and the persisted history after POST /chat/messages with `/taxi` and
 *     POST /chat/button-callbacks presses;
 *   - a half-finished draft is resumed by another `/taxi` and deleted by
 *     «Отмена»;
 *   - confirming an unpriced route is refused twice while the draft is
 *     kept, and no NEW order reaches the admin list;
 *   - the only free car is assigned to the first rider, a second rider is
 *     refused with the draft kept, and after the admin completes the first
 *     order (COMPLETED) the second rider's repeated confirm succeeds with
 *     the same car — the busy/free cycle through the wizard's own eyes.
 *
 * Fixture hygiene (skill `e2e-fixture-hygiene`): the suite creates only
 * its own cities (sha-suffixed), one service, one slot, one driver with a
 * car, and tracks every id for teardown; seeded dictionaries (Москва, the
 * 12:00 slot, the "2 passengers" option) are read-only — only *used*. The
 * single price row (A↔B) cascades away when the cities are deleted, so no
 * matrix restore is needed. Rider accounts are removed first (their orders
 * and drafts cascade, freeing cars and cities); the test-spawned ADMIN is
 * removed last. The SSE liveness probes are ordinary user chatter in the
 * rider's own conversation and disappear with the account.
 */
describe('Taxi wizard over the chat API (e2e, running backend)', () => {
  /** Seeded ADMIN — only used for `admin/users` side calls in this suite. */
  const admin = new ActivityHelper();
  /** Test-owned ADMIN — dictionary/matrix/order calls below. */
  const adminA = new ActivityHelper();
  /** Rider A: SSE/history, draft-resume and no-price scenarios. */
  const riderA = new ActivityHelper();
  /** Rider B: the no-free-car retry scenario. */
  const riderB = new ActivityHelper();

  /** Rider accounts removed first in teardown (their orders cascade). */
  const createdUsers: string[] = [];
  /** The test-spawned ADMIN's own account — removed last (its key cleans up). */
  let adminAUserId = '';
  const createdCityIds: string[] = [];
  const createdServiceIds: string[] = [];
  const createdSlotIds: string[] = [];
  const createdDriverIds: string[] = [];

  /** Test-spawned keys, re-presented in teardown. */
  let adminAKey = '';

  /** Wizard route cities (1000 km / 1200 km — both above the seeded 700). */
  let cityA!: TaxiCityDto;
  let cityB!: TaxiCityDto;

  let riderAEmail = '';
  let riderBEmail = '';

  beforeAll(async () => {
    await admin.ensureBackendRunning();
    admin.loginAsAdmin();

    const spawned = await admin.registerAccount(
      `test_${admin.randomSha7}_taxi_wizard@example.com`,
    );
    adminAUserId = spawned.user.id;
    await admin.sdk.adminUsersControllerUpdateV1({
      path: { id: spawned.user.id },
      body: { role: 'ADMIN' },
    });
    adminAKey = spawned.apiKey.key;
    adminA.loginByApiKey(adminAKey);

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

    const first = await admin.registerAccount(
      `test_${admin.randomSha7}_taxi_rider_a@example.com`,
    );
    createdUsers.push(first.user.id);
    riderAEmail = first.user.email;
    riderA.loginByApiKey(first.apiKey.key);

    const second = await admin.registerAccount(
      `test_${admin.randomSha7}_taxi_rider_b@example.com`,
    );
    createdUsers.push(second.user.id);
    riderBEmail = second.user.email;
    riderB.loginByApiKey(second.apiKey.key);
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
    for (const id of createdCityIds) {
      const result = await adminA.sdk.taxiCatalogControllerRemoveCityV1({
        path: { id },
      });
      // Deleting a city cascades every price pair involving it (the A↔B row).
      expect([204, 404]).toContain(result.response?.status);
    }

    // 2. Finally drop the test-spawned ADMIN account — after its key did
    //    the dictionary cleanup above.
    if (adminAUserId) {
      await admin.removeAccountAsAdmin(adminAUserId);
    }
  });

  /* ------------------------------ chat helpers ------------------------------ */

  /**
   * Waits for a BOT message newer than `previousId`. The backend normally
   * persists the plugin reply before the POST returns, but the periodic
   * recovery sweep may claim a just-created task first and deliver the
   * reply a moment later (bot-plugins.service.ts, SWEEP_INTERVAL_MS) — the
   * poll absorbs that race.
   */
  const waitForBotReply = async (
    rider: ActivityHelper,
    previousId: string | null,
  ): Promise<ChatMessageDto> => {
    const deadline = Date.now() + 10_000;
    for (;;) {
      const history = unwrap(
        await rider.sdk.chatControllerGetMessagesV1({}),
        'GET /chat/messages',
      );
      const reply = [...history]
        .reverse()
        .find((message) => message.senderRole === 'BOT');
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
    rider: ActivityHelper,
    previousId: string | null,
    action: () => Promise<void>,
  ): Promise<ChatMessageDto> => {
    await action();
    return waitForBotReply(rider, previousId);
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
    rider: ActivityHelper,
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
      reply = await wizardStep(rider, reply.id, () =>
        press(rider, `taxi:page:${Math.max(...navPages)}`),
      );
    }
    throw new Error(`wizard button ${target} not found within 10 page hops`);
  };

  /** Presses a wizard button through whatever page currently holds it. */
  const pressViaPages = async (
    rider: ActivityHelper,
    reply: ChatMessageDto,
    target: string,
  ): Promise<ChatMessageDto> => {
    const found = await findButtonAcrossPages(rider, reply, target);
    return wizardStep(rider, found.reply.id, () =>
      press(rider, found.button.callbackData),
    );
  };

  /** Sends a text as the rider; the plugin reply is persisted inline. */
  const sendText = async (
    rider: ActivityHelper,
    content: string,
  ): Promise<void> => {
    unwrap(
      await rider.sdk.chatControllerSendMessageV1({ body: { content } }),
      `POST /chat/messages (${content})`,
    );
  };

  /** Presses a wizard button as the rider. */
  const press = async (
    rider: ActivityHelper,
    callbackData: string,
  ): Promise<void> => {
    unwrap(
      await rider.sdk.chatControllerSubmitButtonCallbackV1({
        body: { callbackData },
      }),
      `POST /chat/button-callbacks (${callbackData})`,
    );
  };

  /**
   * Drives one rider through wizard steps 1..5 (from → to → slot →
   * passengers → optional service) and returns the services step reply, so
   * callers decide how the «Готово» press plays out — an unpriced route
   * refuses right at the confirmation screen (renderConfirmation), before
   * any «Подтвердить» button exists.
   */
  const driveToServices = async (
    rider: ActivityHelper,
    fx: {
      fromCityId: string;
      toCityId: string;
      slotId: string;
      passengerOptionId: string;
      serviceId?: string;
    },
  ): Promise<ChatMessageDto> => {
    let reply = await wizardStep(rider, null, () => sendText(rider, '/taxi'));
    expect(reply.content).toContain('Step 1/6');

    // Every selection goes through the page walker: dictionaries longer
    // than one page hide later options behind «Далее» (design D4).
    reply = await pressViaPages(rider, reply, `taxi:from:${fx.fromCityId}`);
    expect(reply.content).toContain('Step 2/6');

    reply = await pressViaPages(rider, reply, `taxi:to:${fx.toCityId}`);
    expect(reply.content).toContain('Step 3/6');

    reply = await pressViaPages(rider, reply, `taxi:slot:${fx.slotId}`);
    expect(reply.content).toContain('Step 4/6');

    reply = await pressViaPages(
      rider,
      reply,
      `taxi:pax:${fx.passengerOptionId}`,
    );
    expect(reply.content).toContain('Step 5/6');

    if (fx.serviceId) {
      // The fixture service may live on a later page; the toggle re-renders
      // that page with the ✓ marker (its payload carries the current page).
      reply = await pressViaPages(rider, reply, `taxi:svc:${fx.serviceId}`);
      expect(reply.content).toContain('Step 5/6');
      const marked = await findButtonAcrossPages(
        rider,
        reply,
        `taxi:svc:${fx.serviceId}`,
      );
      expect(marked.button.title.startsWith('✓ ')).toBe(true);
      reply = marked.reply;
    }
    return reply;
  };

  /** Presses «Готово» and returns the confirmation screen (priced routes). */
  const finishToConfirmation = async (
    rider: ActivityHelper,
    servicesReply: ChatMessageDto,
  ): Promise<ChatMessageDto> => {
    const reply = await wizardStep(rider, servicesReply.id, () =>
      press(rider, 'taxi:done'),
    );
    expect(reply.content).toContain('Step 6/6');
    expect(buttonOf(reply, 'taxi:confirm')).toBeDefined();
    return reply;
  };

  /* ------------------------------- SSE helpers ------------------------------ */

  /**
   * Waits for an SSE event matching `predicate` among the events received
   * after `fromIndex`. Returns the event plus the index to continue from,
   * or null when nothing matched within `timeoutMs`.
   */
  const waitForSseEvent = async (
    events: ChatStreamEventDto[],
    fromIndex: number,
    predicate: (event: ChatStreamEventDto) => boolean,
    description: string,
    timeoutMs = 10_000,
  ): Promise<{ event: ChatStreamEventDto; nextIndex: number } | null> => {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const index = events.slice(fromIndex).findIndex(predicate);
      if (index >= 0) {
        return {
          event: events[fromIndex + index],
          nextIndex: fromIndex + index + 1,
        };
      }
      if (Date.now() > deadline) {
        return null;
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  };

  /**
   * The SSE subscription is asynchronous: events published before the
   * server attaches the stream subscriber are simply missed. Sends probe
   * texts until one echoes back through the stream — the first echo proves
   * the connection is live, so the step assertions below never race it.
   * Returns the index after the echoed probe event.
   */
  const ensureSseLive = async (
    events: ChatStreamEventDto[],
  ): Promise<number> => {
    let fromIndex = 0;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const probe = `sse-probe-${attempt}`;
      unwrap(
        await riderA.sdk.chatControllerSendMessageV1({
          body: { content: probe },
        }),
        `POST /chat/messages (sse probe ${attempt})`,
      );
      const hit = await waitForSseEvent(
        events,
        fromIndex,
        (event) => event.senderRole === 'USER' && event.content === probe,
        `sse probe ${probe}`,
        2_000,
      );
      if (hit) {
        return hit.nextIndex;
      }
      fromIndex = events.length;
    }
    throw new Error('the SSE stream never became live (no probe echo)');
  };

  /* --------------------------------- tests ---------------------------------- */

  it('delivers wizard steps through the SSE stream and the message history', async () => {
    const events: ChatStreamEventDto[] = [];
    const subscription = riderA
      .sse<ChatStreamEventDto>({ url: '/api/v1/chat/stream' })
      .subscribe((event) => events.push(event));

    let reply: ChatMessageDto;
    try {
      const fromIndex = await ensureSseLive(events);

      reply = await wizardStep(riderA, null, () => sendText(riderA, '/taxi'));
      expect(reply.content).toContain('Step 1/6');

      const stepOne = await waitForSseEvent(
        events,
        fromIndex,
        (event) =>
          event.senderRole === 'BOT' && event.content.includes('Step 1/6'),
        'bot step 1/6',
      );
      expect(stepOne).not.toBeNull();
      expect(stepOne!.event.content).toContain('Where do you leave from?');

      reply = await pressViaPages(riderA, reply, `taxi:from:${cityA.id}`);
      expect(reply.content).toContain('Step 2/6');

      const stepTwo = await waitForSseEvent(
        events,
        stepOne!.nextIndex,
        (event) =>
          event.senderRole === 'BOT' && event.content.includes('Step 2/6'),
        'bot step 2/6',
      );
      expect(stepTwo).not.toBeNull();
      // The streamed step carries destination buttons and stays within the
      // platform cap (design D4).
      expect(stepTwo!.event.buttons?.length ?? 0).toBeLessThanOrEqual(12);
      expect(
        (stepTwo!.event.buttons ?? []).some((button) =>
          matchesPayload(button, 'taxi:to'),
        ),
      ).toBe(true);
    } finally {
      subscription.unsubscribe();
    }

    // The same steps are persisted for later history reads.
    const history = unwrap(
      await riderA.sdk.chatControllerGetMessagesV1({}),
      'GET /chat/messages',
    );
    const botContents = history
      .filter((message) => message.senderRole === 'BOT')
      .map((message) => message.content);
    expect(botContents.some((content) => content.includes('Step 1/6'))).toBe(
      true,
    );
    expect(botContents.some((content) => content.includes('Step 2/6'))).toBe(
      true,
    );

    // Cleanup: leave no draft for the next test.
    const cancelReply = await wizardStep(riderA, reply.id, () =>
      press(riderA, 'taxi:cancel'),
    );
    expect(cancelReply.content).toBe(CANCELLED_TEXT);
  }, 30_000);

  it('resumes a half-finished draft, hides the picked city and starts fresh after cancel', async () => {
    let reply = await wizardStep(riderA, null, () => sendText(riderA, '/taxi'));
    expect(reply.content).toContain('Step 1/6');

    reply = await pressViaPages(riderA, reply, `taxi:from:${cityA.id}`);
    expect(reply.content).toContain('Step 2/6');

    // Another /taxi resumes exactly at the saved step (task 5.1).
    reply = await wizardStep(riderA, reply.id, () => sendText(riderA, '/taxi'));
    expect(reply.content).toContain('Step 2/6');

    // The picked city is not offered as a destination — on any page.
    await expect(
      findButtonAcrossPages(riderA, reply, `taxi:to:${cityA.id}`),
    ).rejects.toThrow(/unreachable/);

    // Other cities stay reachable, proving the walk itself works.
    const cityBHit = await findButtonAcrossPages(
      riderA,
      reply,
      `taxi:to:${cityB.id}`,
    );
    expect(cityBHit.button.callbackData.startsWith('taxi:to:')).toBe(true);

    reply = await wizardStep(riderA, cityBHit.reply.id, () =>
      press(riderA, 'taxi:cancel'),
    );
    expect(reply.content).toBe(CANCELLED_TEXT);

    // After cancel the wizard starts from scratch.
    reply = await wizardStep(riderA, reply.id, () => sendText(riderA, '/taxi'));
    expect(reply.content).toContain('Step 1/6');

    reply = await wizardStep(riderA, reply.id, () =>
      press(riderA, 'taxi:cancel'),
    );
    expect(reply.content).toBe(CANCELLED_TEXT);
  }, 30_000);

  it('refuses an unpriced route at the confirmation screen and keeps the draft', async () => {
    // A city whose pair with the seeded Москва has no matrix row (the suite
    // never sets prices for it).
    const noPriceCity = unwrap(
      await adminA.sdk.taxiCatalogControllerCreateCityV1({
        body: { name: `e2e-Без-цены-${admin.randomSha7}`, distanceKm: 333 },
      }),
      'POST /taxi/cities (no price)',
    );
    createdCityIds.push(noPriceCity.id);

    const cities = unwrap(
      await adminA.sdk.taxiCatalogControllerListCitiesV1({}),
      'GET /taxi/cities',
    );
    const moscow = cities.cities.find((city) => city.name === 'Москва');
    expect(moscow).toBeDefined();

    const slots = unwrap(
      await adminA.sdk.taxiCatalogControllerListDepartureSlotsV1({}),
      'GET /taxi/departure-slots',
    );
    const noon = slots.slots.find((slot) => slot.time === '12:00');
    expect(noon).toBeDefined();

    const options = unwrap(
      await adminA.sdk.taxiCatalogControllerListPassengerOptionsV1({}),
      'GET /taxi/passenger-options',
    );
    const twoPassengers = options.options.find((option) => option.count === 2);
    expect(twoPassengers).toBeDefined();

    // The refusal fires as soon as the route reaches the confirmation
    // screen: «Готово» renders it through renderConfirmation, which refuses
    // before any «Подтвердить» button exists.
    const services = await driveToServices(riderA, {
      fromCityId: noPriceCity.id,
      toCityId: moscow!.id,
      slotId: noon!.id,
      passengerOptionId: twoPassengers!.id,
    });

    let reply = await wizardStep(riderA, services.id, () =>
      press(riderA, 'taxi:done'),
    );
    expect(reply.content).toBe(NO_PRICE_TEXT);

    // The draft is kept: /taxi resumes at the confirmation step and the
    // refusal repeats; the literal «Подтвердить» press refuses too.
    reply = await wizardStep(riderA, reply.id, () => sendText(riderA, '/taxi'));
    expect(reply.content).toBe(NO_PRICE_TEXT);
    reply = await wizardStep(riderA, reply.id, () =>
      press(riderA, 'taxi:confirm'),
    );
    expect(reply.content).toBe(NO_PRICE_TEXT);

    // No NEW order reached the admin list for this rider.
    const orders = unwrap(
      await adminA.sdk.taxiOrdersControllerListV1({}),
      'GET /taxi/orders (refusal)',
    );
    expect(
      orders.orders.some((order) => order.passengerEmail === riderAEmail),
    ).toBe(false);

    // Cleanup: delete the kept draft.
    reply = await wizardStep(riderA, reply.id, () =>
      press(riderA, 'taxi:cancel'),
    );
    expect(reply.content).toBe(CANCELLED_TEXT);
  }, 45_000);

  it('assigns the free car, refuses a busy route and frees the car via COMPLETED', async () => {
    // The route price (cascades away with the cities in teardown).
    unwrap(
      await adminA.sdk.taxiPriceMatrixControllerSetPairPriceV1({
        path: { fromCityId: cityA.id, toCityId: cityB.id },
        body: { price: 5000 },
      }),
      'PUT /taxi/price-matrix (wizard route)',
    );

    // Wizard fixtures: car-feature service, sha slot, driver + one 4-seat car.
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

    const slotTime = slotTimeFromSha(admin.randomSha7);
    const slot = unwrap(
      await adminA.sdk.taxiCatalogControllerCreateDepartureSlotV1({
        body: { time: slotTime },
      }),
      'POST /taxi/departure-slots (wizard)',
    );
    createdSlotIds.push(slot.id);

    const driver = unwrap(
      await adminA.sdk.taxiCatalogControllerCreateDriverV1({
        body: {
          fullName: `e2e-Шофёр-${admin.randomSha7}`,
          phone: '+7-900-333-33-33',
        },
      }),
      'POST /taxi/drivers (wizard)',
    );
    createdDriverIds.push(driver.id);

    const plate = `Е${admin.randomSha7.toUpperCase()}55`;
    const car = unwrap(
      await adminA.sdk.taxiCatalogControllerCreateCarV1({
        path: { driverId: driver.id },
        body: {
          model: 'e2e-Volkswagen Multivan',
          plate,
          seats: 4,
          color: 'белый',
          featureServiceIds: [service.id],
        },
      }),
      'POST /taxi/drivers/:id/cars (wizard)',
    );

    const options = unwrap(
      await adminA.sdk.taxiCatalogControllerListPassengerOptionsV1({}),
      'GET /taxi/passenger-options',
    );
    const twoPassengers = options.options.find((option) => option.count === 2);
    expect(twoPassengers).toBeDefined();

    // Rider A drives the whole wizard: the only free car is assigned.
    const confirmationA = await finishToConfirmation(
      riderA,
      await driveToServices(riderA, {
        fromCityId: cityA.id,
        toCityId: cityB.id,
        slotId: slot.id,
        passengerOptionId: twoPassengers!.id,
        serviceId: service.id,
      }),
    );
    const first = await wizardStep(riderA, confirmationA.id, () =>
      press(riderA, 'taxi:confirm'),
    );
    // Order ids are cuids, so the shortened suffix is base36.
    expect(first.content).toMatch(/Order #[0-9A-Z]{6} submitted!/);
    expect(first.content).toContain(car.model);
    expect(first.content).toContain(plate);
    expect(first.content).toContain(driver.fullName);

    const listed = unwrap(
      await adminA.sdk.taxiOrdersControllerListV1({}),
      'GET /taxi/orders (first)',
    );
    const firstOrder = listed.orders.find(
      (order) => order.passengerEmail === riderAEmail,
    );
    expect(firstOrder).toBeDefined();
    expect(firstOrder!.status).toBe('NEW');
    expect(firstOrder!.fromCityName).toBe(cityA.name);
    expect(firstOrder!.toCityName).toBe(cityB.name);
    expect(firstOrder!.departureSlotLabel).toBe(slotTime);
    expect(firstOrder!.passengerCount).toBe(2);
    expect(firstOrder!.services).toEqual([
      { id: service.id, name: service.name, surcharge: 150 },
    ]);
    expect(firstOrder!.priceBase).toBe(5000);
    expect(firstOrder!.priceTotal).toBe(5150);
    expect(firstOrder!.carSnapshot).toEqual({
      driverName: driver.fullName,
      model: car.model,
      plate,
      color: 'белый',
    });

    // Rider B drives the same feature-constrained route: the only car is
    // busy, so the confirmation is refused with the draft kept.
    const confirmationB = await finishToConfirmation(
      riderB,
      await driveToServices(riderB, {
        fromCityId: cityA.id,
        toCityId: cityB.id,
        slotId: slot.id,
        passengerOptionId: twoPassengers!.id,
        serviceId: service.id,
      }),
    );
    let replyB = await wizardStep(riderB, confirmationB.id, () =>
      press(riderB, 'taxi:confirm'),
    );
    expect(replyB.content).toBe(NO_CAR_TEXT);

    replyB = await wizardStep(riderB, replyB.id, () =>
      sendText(riderB, '/taxi'),
    );
    expect(replyB.content).toContain('Step 6/6');

    const during = unwrap(
      await adminA.sdk.taxiOrdersControllerListV1({}),
      'GET /taxi/orders (busy)',
    );
    expect(
      during.orders.some((order) => order.passengerEmail === riderBEmail),
    ).toBe(false);

    // Completing A's order frees the car (busy/free cycle, design D11).
    const completed = unwrap(
      await adminA.sdk.taxiOrdersControllerUpdateStatusV1({
        path: { id: firstOrder!.id },
        body: { status: 'COMPLETED' },
      }),
      'PATCH /taxi/orders/:id (COMPLETED)',
    );
    expect(completed.status).toBe('COMPLETED');

    // B's draft still sits at the confirmation step: the repeated press
    // succeeds now and receives the same, just-freed car.
    const retried = await wizardStep(riderB, replyB.id, () =>
      press(riderB, 'taxi:confirm'),
    );
    expect(retried.content).toMatch(/Order #[0-9A-Z]{6} submitted!/);
    expect(retried.content).toContain(plate);

    const after = unwrap(
      await adminA.sdk.taxiOrdersControllerListV1({}),
      'GET /taxi/orders (retry)',
    );
    const secondOrder = after.orders.find(
      (order) => order.passengerEmail === riderBEmail,
    );
    expect(secondOrder).toBeDefined();
    expect(secondOrder!.status).toBe('NEW');
    expect(secondOrder!.priceBase).toBe(5000);
    expect(secondOrder!.priceTotal).toBe(5150);
    expect(secondOrder!.carSnapshot?.plate).toBe(plate);
  }, 45_000);
});

/** Deterministic HH:MM outside the seeded 08:00/12:00/16:00/20:00 set. */
function slotTimeFromSha(sha: string): string {
  const hour = Number.parseInt(sha.slice(0, 2), 16) % 24;
  const minute = Number.parseInt(sha.slice(2, 4), 16) % 60;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}
