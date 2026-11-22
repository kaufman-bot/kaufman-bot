import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { User } from '../generated/prisma/client.js';
import { TaxiPlugin } from './taxi.plugin.js';

const makePrismaMock = () => {
  const cityFindMany = vi.fn().mockResolvedValue([]);
  const cityFindUnique = vi.fn();
  const slotFindMany = vi.fn().mockResolvedValue([]);
  const slotFindUnique = vi.fn();
  const slotFindFirst = vi.fn();
  const optionFindMany = vi.fn().mockResolvedValue([]);
  const optionFindFirst = vi.fn();
  const serviceFindMany = vi.fn().mockResolvedValue([]);
  const serviceFindFirst = vi.fn();
  const orderFindFirst = vi.fn();
  const orderCreate = vi.fn();
  const orderUpdate = vi.fn();
  const orderDelete = vi.fn();
  // The interactive-transaction callback receives the same delegates.
  const instance: any = {};
  const transaction = vi
    .fn()
    .mockImplementation(async (arg: unknown) =>
      typeof arg === 'function' ? arg(instance) : arg,
    );

  Object.assign(instance, {
    taxiCity: { findMany: cityFindMany, findUnique: cityFindUnique },
    taxiDepartureSlot: {
      findMany: slotFindMany,
      findUnique: slotFindUnique,
      findFirst: slotFindFirst,
    },
    taxiPassengerOption: {
      findMany: optionFindMany,
      findFirst: optionFindFirst,
    },
    taxiExtraService: {
      findMany: serviceFindMany,
      findFirst: serviceFindFirst,
    },
    taxiOrder: {
      findFirst: orderFindFirst,
      create: orderCreate,
      update: orderUpdate,
      delete: orderDelete,
    },
    $transaction: transaction,
  });

  return {
    instance,
    cityFindMany,
    cityFindUnique,
    slotFindMany,
    slotFindUnique,
    slotFindFirst,
    optionFindMany,
    optionFindFirst,
    serviceFindMany,
    serviceFindFirst,
    orderFindFirst,
    orderCreate,
    orderUpdate,
    orderDelete,
    transaction,
  };
};

const CITIES = [
  { id: 'c-msk', name: 'Москва', distanceKm: 0, isActive: true },
  { id: 'c-tvr', name: 'Тверь', distanceKm: 167, isActive: true },
  { id: 'c-spb', name: 'Санкт-Петербург', distanceKm: 700, isActive: true },
];

const SLOTS = [
  { id: 's-8', time: '08:00', isActive: true, sortOrder: 0 },
  { id: 's-12', time: '12:00', isActive: true, sortOrder: 1 },
];

const OPTIONS = [
  { id: 'o-1', count: 1, isActive: true, sortOrder: 0 },
  { id: 'o-2', count: 2, isActive: true, sortOrder: 1 },
];

const SERVICES = [
  {
    id: 'svc-seat',
    name: 'Детское кресло',
    surcharge: 300,
    isCarFeature: true,
    isActive: true,
    sortOrder: 0,
  },
  {
    id: 'svc-music',
    name: 'Музыка в салоне',
    surcharge: 0,
    isCarFeature: true,
    isActive: true,
    sortOrder: 1,
  },
];

const draftRow = (over: Record<string, unknown> = {}) => ({
  id: 'ord-draft',
  userId: 'user-1',
  status: 'DRAFT',
  draftStep: 1,
  passengerCount: null,
  serviceIds: [],
  fromCityId: null,
  toCityId: null,
  departureSlotId: null,
  fromCityName: null,
  toCityName: null,
  departureSlotLabel: null,
  serviceSnapshot: null,
  carSnapshot: null,
  priceBase: null,
  priceTotal: null,
  confirmedAt: null,
  createdAt: new Date(),
  ...over,
});

const userRow = (language: string): User =>
  ({ id: 'user-1', email: 'u@example.com', language }) as User;

const makePriceMatrix = () => ({ pairPrice: vi.fn().mockResolvedValue(4900) });
const makeAssignment = () => ({ findFreeCar: vi.fn().mockResolvedValue(null) });

describe('TaxiPlugin', () => {
  let prisma: ReturnType<typeof makePrismaMock>;
  let priceMatrix: ReturnType<typeof makePriceMatrix>;
  let assignment: ReturnType<typeof makeAssignment>;
  let plugin: TaxiPlugin;

  const ruUser = () => userRow('ru');

  beforeEach(() => {
    vi.clearAllMocks();
    prisma = makePrismaMock();
    priceMatrix = makePriceMatrix();
    assignment = makeAssignment();
    plugin = new TaxiPlugin(
      prisma.instance,
      priceMatrix as never,
      assignment as never,
    );
    prisma.cityFindMany.mockResolvedValue(CITIES);
    prisma.slotFindMany.mockResolvedValue(SLOTS);
    prisma.optionFindMany.mockResolvedValue(OPTIONS);
    prisma.serviceFindMany.mockResolvedValue(SERVICES);
    prisma.slotFindFirst.mockResolvedValue(SLOTS[0]);
    prisma.optionFindFirst.mockResolvedValue(OPTIONS[0]);
    prisma.serviceFindFirst.mockResolvedValue(SERVICES[0]);
    // Safe default: any state transition renders the next step.
    prisma.orderUpdate.mockResolvedValue(
      draftRow({ draftStep: 2, fromCityId: 'c-msk' }),
    );
  });

  /* ------------------------------ canHandle -------------------------------- */

  describe('canHandle', () => {
    it('claims /taxi text (case-insensitive, trimmed) and taxi: buttons only', () => {
      expect(plugin.canHandle('/taxi', 'TEXT')).toBe(true);
      expect(plugin.canHandle('  /TAXI  ', 'TEXT')).toBe(true);
      expect(plugin.canHandle('hello', 'TEXT')).toBe(false);
      expect(plugin.canHandle('/taxi:extra', 'TEXT')).toBe(false);
      expect(plugin.canHandle('taxi:done', 'BUTTON')).toBe(true);
      expect(plugin.canHandle('taxi:from:c1', 'BUTTON')).toBe(true);
      expect(plugin.canHandle('settings:language:en', 'BUTTON')).toBe(false);
      expect(plugin.canHandle('confirm:order:1', 'BUTTON')).toBe(false);
    });

    it('declares callback support', () => {
      expect(plugin.handlesCallbacks).toBe(true);
    });
  });

  /* ------------------------------- start ----------------------------------- */

  describe('/taxi start', () => {
    it('creates a draft and renders step 1 with active cities (ru)', async () => {
      prisma.orderFindFirst.mockResolvedValue(null);
      prisma.orderCreate.mockResolvedValue(draftRow());

      const reply = (await plugin.handle({
        user: ruUser(),
        content: '/taxi',
        kind: 'TEXT',
      })) as {
        text: string;
        buttons: Array<{ title: string; callbackData: string }>;
      };

      expect(reply.text).toBe('Шаг 1/6: Откуда едем?');
      expect(reply.buttons.map((b) => b.title)).toEqual([
        'Москва',
        'Тверь',
        'Санкт-Петербург',
        'Отмена',
      ]);
      expect(reply.buttons[0].callbackData).toBe('taxi:from:c-msk');
      expect(prisma.orderCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: 'user-1',
            status: 'DRAFT',
            draftStep: 1,
          }),
        }),
      );
    });

    it('answers "no routes" when no active cities exist', async () => {
      prisma.cityFindMany.mockResolvedValue([]);

      const reply = await plugin.handle({
        user: ruUser(),
        content: '/taxi',
        kind: 'TEXT',
      });

      expect(reply).toBe(
        'Маршруты недоступны: пока нет активных населённых пунктов.',
      );
      expect(prisma.orderCreate).not.toHaveBeenCalled();
    });

    it('resumes an existing draft from its current step', async () => {
      prisma.orderFindFirst.mockResolvedValue(
        draftRow({ draftStep: 2, fromCityId: 'c-msk' }),
      );

      const reply = (await plugin.handle({
        user: ruUser(),
        content: '/taxi',
        kind: 'TEXT',
      })) as {
        text: string;
        buttons: Array<{ title: string; callbackData: string }>;
      };

      expect(reply.text).toBe('Шаг 2/6: Куда едем?');
      // The saved departure is excluded; no new draft is created.
      expect(
        reply.buttons
          .map((b) => b.callbackData)
          .filter((p) => p.startsWith('taxi:to:')),
      ).toEqual(['taxi:to:c-tvr', 'taxi:to:c-spb']);
      expect(prisma.orderCreate).not.toHaveBeenCalled();
    });
  });

  /* --------------------------- step transitions ----------------------------- */

  describe('step transitions', () => {
    it('from → saves city, moves to step 2 excluding the departure', async () => {
      prisma.orderFindFirst.mockResolvedValue(draftRow({ draftStep: 1 }));
      prisma.orderUpdate.mockResolvedValue(
        draftRow({ draftStep: 2, fromCityId: 'c-msk' }),
      );

      const reply = (await plugin.handle({
        user: ruUser(),
        content: 'taxi:from:c-msk',
        kind: 'BUTTON',
      })) as {
        text: string;
        buttons: Array<{ title: string; callbackData: string }>;
      };

      expect(reply.text).toBe('Шаг 2/6: Куда едем?');
      expect(prisma.orderUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ fromCityId: 'c-msk', draftStep: 2 }),
        }),
      );
      const toPayloads = reply.buttons
        .map((b) => b.callbackData)
        .filter((p) => p.startsWith('taxi:to:'));
      expect(toPayloads).not.toContain('taxi:to:c-msk');
    });

    it('to → slot → pax chain advances the draft', async () => {
      prisma.orderFindFirst.mockResolvedValue(
        draftRow({ draftStep: 2, fromCityId: 'c-msk' }),
      );
      prisma.orderUpdate.mockResolvedValue(draftRow({ draftStep: 3 }));
      let reply = (await plugin.handle({
        user: ruUser(),
        content: 'taxi:to:c-spb',
        kind: 'BUTTON',
      })) as {
        text: string;
        buttons: Array<{ title: string; callbackData: string }>;
      };
      expect(reply.text).toBe('Шаг 3/6: Время выезда?');

      prisma.orderFindFirst.mockResolvedValue(draftRow({ draftStep: 3 }));
      prisma.orderUpdate.mockResolvedValue(draftRow({ draftStep: 4 }));
      reply = (await plugin.handle({
        user: ruUser(),
        content: 'taxi:slot:s-12',
        kind: 'BUTTON',
      })) as {
        text: string;
        buttons: Array<{ title: string; callbackData: string }>;
      };
      expect(reply.text).toBe('Шаг 4/6: Сколько человек поедет?');

      prisma.orderFindFirst.mockResolvedValue(draftRow({ draftStep: 4 }));
      prisma.orderUpdate.mockResolvedValue(
        draftRow({ draftStep: 5, passengerCount: 2 }),
      );
      reply = (await plugin.handle({
        user: ruUser(),
        content: 'taxi:pax:o-2',
        kind: 'BUTTON',
      })) as {
        text: string;
        buttons: Array<{ title: string; callbackData: string }>;
      };
      expect(reply.text).toBe('Шаг 5/6: Доп. услуги (по желанию):');
      expect(reply.buttons.map((b) => b.title)).toContain('Готово');
    });

    it('toggles a service with the ✓ marker and removes it on second press', async () => {
      prisma.orderFindFirst.mockResolvedValue(
        draftRow({ draftStep: 5, passengerCount: 2 }),
      );
      prisma.orderUpdate
        .mockResolvedValueOnce(
          draftRow({ draftStep: 5, serviceIds: ['svc-seat'] }),
        )
        .mockResolvedValueOnce(draftRow({ draftStep: 5, serviceIds: [] }));

      const added = (await plugin.handle({
        user: ruUser(),
        content: 'taxi:svc:svc-seat',
        kind: 'BUTTON',
      })) as { buttons: Array<{ title: string }> };
      expect(added.buttons.map((b) => b.title)).toContain(
        '✓ Детское кресло (+300 ₽)',
      );
      expect(prisma.orderUpdate).toHaveBeenLastCalledWith(
        expect.objectContaining({ data: { serviceIds: ['svc-seat'] } }),
      );

      // Second press sees the draft AFTER the first toggle: marker removed.
      prisma.orderFindFirst.mockResolvedValue(
        draftRow({ draftStep: 5, passengerCount: 2, serviceIds: ['svc-seat'] }),
      );
      await plugin.handle({
        user: ruUser(),
        content: 'taxi:svc:svc-seat',
        kind: 'BUTTON',
      });
      expect(prisma.orderUpdate).toHaveBeenLastCalledWith(
        expect.objectContaining({ data: { serviceIds: [] } }),
      );
    });
  });

  /* --------------------------- editLast flag (D12) -------------------------- */

  describe('editLast flag (chat-message-editing)', () => {
    it('marks step transitions as in-place edits', async () => {
      prisma.orderFindFirst.mockResolvedValue(draftRow({ draftStep: 1 }));
      prisma.orderUpdate.mockResolvedValue(
        draftRow({ draftStep: 2, fromCityId: 'c-msk' }),
      );

      const reply = (await plugin.handle({
        user: ruUser(),
        content: 'taxi:from:c-msk',
        kind: 'BUTTON',
      })) as { editLast?: boolean };

      expect(reply.editLast).toBe(true);
    });

    it('marks page navigation and the service toggle as in-place edits', async () => {
      prisma.orderFindFirst.mockResolvedValue(draftRow({ draftStep: 1 }));
      const pageReply = (await plugin.handle({
        user: ruUser(),
        content: 'taxi:page:1',
        kind: 'BUTTON',
      })) as { editLast?: boolean };
      expect(pageReply.editLast).toBe(true);

      prisma.orderFindFirst.mockResolvedValue(
        draftRow({ draftStep: 5, passengerCount: 2 }),
      );
      prisma.orderUpdate.mockResolvedValue(
        draftRow({ draftStep: 5, serviceIds: ['svc-seat'] }),
      );
      const toggleReply = (await plugin.handle({
        user: ruUser(),
        content: 'taxi:svc:svc-seat:1',
        kind: 'BUTTON',
      })) as { editLast?: boolean };
      expect(toggleReply.editLast).toBe(true);
    });

    it('marks the confirmation screen reached via Готово as an in-place edit', async () => {
      prisma.orderFindFirst.mockResolvedValue(
        draftRow({
          draftStep: 5,
          fromCityId: 'c-msk',
          toCityId: 'c-spb',
          departureSlotId: 's-12',
          passengerCount: 2,
        }),
      );
      prisma.orderUpdate.mockResolvedValue(
        draftRow({
          draftStep: 6,
          fromCityId: 'c-msk',
          toCityId: 'c-spb',
          departureSlotId: 's-12',
          passengerCount: 2,
        }),
      );
      prisma.cityFindUnique.mockResolvedValue(CITIES[0]);
      prisma.slotFindUnique.mockResolvedValue(SLOTS[1]);

      const reply = (await plugin.handle({
        user: ruUser(),
        content: 'taxi:done',
        kind: 'BUTTON',
      })) as { text: string; editLast?: boolean };

      expect(reply.text).toContain('Шаг 6/6: Подтверждение');
      expect(reply.editLast).toBe(true);
    });

    it('keeps the /taxi entry and terminal replies as new messages', async () => {
      prisma.orderFindFirst.mockResolvedValue(draftRow({ draftStep: 1 }));
      const startReply = (await plugin.handle({
        user: ruUser(),
        content: '/taxi',
        kind: 'TEXT',
      })) as { editLast?: boolean };
      expect(startReply.editLast).toBeUndefined();

      prisma.orderFindFirst.mockResolvedValue(draftRow({ draftStep: 4 }));
      const cancelReply = await plugin.handle({
        user: ruUser(),
        content: 'taxi:cancel',
        kind: 'BUTTON',
      });
      // Terminal replies are plain strings — no edit flag at all.
      expect(typeof cancelReply).toBe('string');
    });
  });

  /* -------------------------- back navigation (D13) ------------------------- */

  describe('back navigation (design D13)', () => {
    it('rolls the draft one step back and re-renders the previous step in place', async () => {
      prisma.orderFindFirst.mockResolvedValue(
        draftRow({ draftStep: 3, fromCityId: 'c-msk', toCityId: 'c-spb' }),
      );
      prisma.orderUpdate.mockResolvedValue(
        draftRow({ draftStep: 2, fromCityId: 'c-msk' }),
      );

      const reply = (await plugin.handle({
        user: ruUser(),
        content: 'taxi:back',
        kind: 'BUTTON',
      })) as { text: string; editLast?: boolean };

      expect(reply.text).toBe('Шаг 2/6: Куда едем?');
      expect(reply.editLast).toBe(true);
      // Saved fields are untouched — only the step marker rolls back.
      expect(prisma.orderUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'ord-draft' },
          data: { draftStep: 2 },
        }),
      );
    });

    it('shows «Назад» (taxi:back) on page 1 of steps ≥ 2 and page-nav «Назад» on later pages', async () => {
      // Ten cities minus the excluded departure = nine options → two pages.
      prisma.cityFindMany.mockResolvedValue(
        Array.from({ length: 10 }, (_, i) => ({
          id: `c-${i}`,
          name: `Город ${i}`,
          distanceKm: i,
          isActive: true,
        })),
      );
      prisma.orderFindFirst.mockResolvedValue(
        draftRow({ draftStep: 2, fromCityId: 'c-0' }),
      );
      const page1 = (await plugin.handle({
        user: ruUser(),
        content: '/taxi',
        kind: 'TEXT',
      })) as { buttons: Array<{ title: string; callbackData: string }> };
      expect(page1.buttons.find((b) => b.title === 'Назад')?.callbackData).toBe(
        'taxi:back',
      );

      const page2 = (await plugin.handle({
        user: ruUser(),
        content: 'taxi:page:2',
        kind: 'BUTTON',
      })) as { buttons: Array<{ title: string; callbackData: string }> };
      expect(page2.buttons.find((b) => b.title === 'Назад')?.callbackData).toBe(
        'taxi:page:1',
      );
    });

    it('step 1 has no «Назад» button', async () => {
      prisma.orderFindFirst.mockResolvedValue(null);
      prisma.orderCreate.mockResolvedValue(draftRow());

      const reply = (await plugin.handle({
        user: ruUser(),
        content: '/taxi',
        kind: 'TEXT',
      })) as { buttons: Array<{ title: string; callbackData: string }> };

      expect(reply.buttons.map((b) => b.callbackData)).not.toContain(
        'taxi:back',
      );
      expect(reply.buttons.find((b) => b.title === 'Назад')).toBeUndefined();
    });

    it('re-picking the departure resets every lower-priority field', async () => {
      prisma.orderFindFirst.mockResolvedValue(
        draftRow({
          draftStep: 1,
          fromCityId: 'c-msk',
          toCityId: 'c-spb',
          departureSlotId: 's-12',
          passengerCount: 2,
          serviceIds: ['svc-seat'],
        }),
      );
      prisma.orderUpdate.mockResolvedValue(
        draftRow({ draftStep: 2, fromCityId: 'c-tvr' }),
      );

      const reply = (await plugin.handle({
        user: ruUser(),
        content: 'taxi:from:c-tvr',
        kind: 'BUTTON',
      })) as { text: string };

      expect(reply.text).toBe('Шаг 2/6: Куда едем?');
      expect(prisma.orderUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            fromCityId: 'c-tvr',
            draftStep: 2,
            toCityId: null,
            departureSlotId: null,
            passengerCount: null,
            serviceIds: [],
          }),
        }),
      );
    });

    it('re-picking slot or passengers resets their lower fields only', async () => {
      prisma.orderFindFirst.mockResolvedValue(
        draftRow({ draftStep: 3, fromCityId: 'c-msk', toCityId: 'c-spb' }),
      );
      prisma.slotFindFirst.mockResolvedValue(SLOTS[1]);
      prisma.orderUpdate.mockResolvedValue(draftRow({ draftStep: 4 }));
      await plugin.handle({
        user: ruUser(),
        content: 'taxi:slot:s-12',
        kind: 'BUTTON',
      });
      expect(prisma.orderUpdate).toHaveBeenLastCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            departureSlotId: 's-12',
            draftStep: 4,
            passengerCount: null,
            serviceIds: [],
          }),
        }),
      );

      prisma.orderFindFirst.mockResolvedValue(draftRow({ draftStep: 4 }));
      prisma.optionFindFirst.mockResolvedValue(OPTIONS[1]);
      prisma.orderUpdate.mockResolvedValue(
        draftRow({ draftStep: 5, passengerCount: 2 }),
      );
      await plugin.handle({
        user: ruUser(),
        content: 'taxi:pax:o-2',
        kind: 'BUTTON',
      });
      expect(prisma.orderUpdate).toHaveBeenLastCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            passengerCount: 2,
            draftStep: 5,
            serviceIds: [],
          }),
        }),
      );
    });

    it('stale presses after a step-back stay inactive', async () => {
      // A step-4 button of the old screen after returning to step 1.
      prisma.orderFindFirst.mockResolvedValue(draftRow({ draftStep: 1 }));
      const lowerStep = await plugin.handle({
        user: ruUser(),
        content: 'taxi:pax:o-2',
        kind: 'BUTTON',
      });
      expect(String(lowerStep)).toContain('неактивен');

      // «Назад» itself has no button on step 1, on the confirmation or
      // without an active draft — all stale by definition.
      const fromStepOne = await plugin.handle({
        user: ruUser(),
        content: 'taxi:back',
        kind: 'BUTTON',
      });
      expect(String(fromStepOne)).toContain('неактивен');

      prisma.orderFindFirst.mockResolvedValue(
        draftRow({ draftStep: 6, fromCityId: 'c-msk', toCityId: 'c-spb' }),
      );
      const fromConfirmation = await plugin.handle({
        user: ruUser(),
        content: 'taxi:back',
        kind: 'BUTTON',
      });
      expect(String(fromConfirmation)).toContain('неактивен');

      prisma.orderFindFirst.mockResolvedValue(null);
      const noDraft = await plugin.handle({
        user: ruUser(),
        content: 'taxi:back',
        kind: 'BUTTON',
      });
      expect(String(noDraft)).toContain('неактивен');
      expect(prisma.orderUpdate).not.toHaveBeenCalled();
    });
  });

  /* ------------------------------ confirmation ------------------------------ */

  describe('confirmation', () => {
    const confirmedDraft = () =>
      draftRow({
        draftStep: 6,
        fromCityId: 'c-msk',
        toCityId: 'c-spb',
        departureSlotId: 's-12',
        passengerCount: 2,
        serviceIds: ['svc-seat'],
      });

    it('renders the confirmation summary with base price and surcharges', async () => {
      prisma.orderFindFirst.mockResolvedValue(
        draftRow({
          draftStep: 5,
          fromCityId: 'c-msk',
          toCityId: 'c-spb',
          departureSlotId: 's-12',
          passengerCount: 2,
          serviceIds: ['svc-seat'],
        }),
      );
      prisma.orderUpdate.mockResolvedValueOnce(
        draftRow({
          draftStep: 6,
          fromCityId: 'c-msk',
          toCityId: 'c-spb',
          departureSlotId: 's-12',
          passengerCount: 2,
          serviceIds: ['svc-seat'],
        }),
      );
      prisma.cityFindUnique.mockImplementation(
        async ({ where }) =>
          (
            ({ 'c-msk': CITIES[0], 'c-spb': CITIES[2] }) as Record<
              string,
              unknown
            >
          )[where.id],
      );
      prisma.slotFindUnique.mockResolvedValue(SLOTS[1]);
      prisma.serviceFindMany.mockResolvedValue([SERVICES[0]]);

      const reply = (await plugin.handle({
        user: ruUser(),
        content: 'taxi:done',
        kind: 'BUTTON',
      })) as { text: string };

      expect(reply.text).toContain('Шаг 6/6: Подтверждение');
      expect(reply.text).toContain('Москва → Санкт-Петербург');
      expect(reply.text).toContain('12:00');
      expect(reply.text).toContain('Детское кресло');
      // base 4900 + child seat 300
      expect(reply.text).toContain('5200');
    });

    it('confirms: assigns a car, stores NEW with snapshots and replies success', async () => {
      prisma.orderFindFirst.mockResolvedValue(confirmedDraft());
      prisma.cityFindUnique.mockImplementation(
        async ({ where }) =>
          (
            ({ 'c-msk': CITIES[0], 'c-spb': CITIES[2] }) as Record<
              string,
              unknown
            >
          )[where.id],
      );
      prisma.slotFindUnique.mockResolvedValue(SLOTS[1]);
      prisma.serviceFindMany.mockResolvedValue([SERVICES[0]]);
      assignment.findFreeCar.mockResolvedValue({
        id: 'car-1',
        model: 'Toyota Camry',
        plate: 'А123ВС77',
        color: 'чёрный',
        driver: { fullName: 'Иван Петров', isActive: true },
        features: [],
      });
      const confirmed = {
        ...confirmedDraft(),
        status: 'NEW',
        carId: 'car-1',
        priceTotal: 5200,
        carSnapshot: {
          driverName: 'Иван Петров',
          model: 'Toyota Camry',
          plate: 'А123ВС77',
          color: 'чёрный',
        },
      };
      prisma.orderUpdate.mockResolvedValue(confirmed);

      const reply = (await plugin.handle({
        user: ruUser(),
        content: 'taxi:confirm',
        kind: 'BUTTON',
      })) as { text: string };

      expect(String(reply)).toContain('Toyota Camry');
      expect(String(reply)).toContain('А123ВС77');
      expect(String(reply)).toContain('Иван Петров');
      expect(String(reply)).toContain('5200');
      // feature requirement passed to the assignment service
      expect(assignment.findFreeCar).toHaveBeenCalledWith(
        2,
        ['svc-seat'],
        expect.anything(),
      );
      const updateArgs = prisma.orderUpdate.mock.calls[0][0] as {
        data: Record<string, unknown>;
      };
      expect(updateArgs.data.status).toBe('NEW');
      expect(updateArgs.data.carId).toBe('car-1');
      expect(updateArgs.data.carSnapshot).toMatchObject({
        driverName: 'Иван Петров',
        plate: 'А123ВС77',
      });
    });

    it('refuses when the pair has no price; draft stays untouched', async () => {
      prisma.orderFindFirst.mockResolvedValue(confirmedDraft());
      prisma.cityFindUnique.mockResolvedValue(CITIES[0]);
      prisma.serviceFindMany.mockResolvedValue([]);
      priceMatrix.pairPrice.mockResolvedValue(null);

      const reply = await plugin.handle({
        user: ruUser(),
        content: 'taxi:confirm',
        kind: 'BUTTON',
      });

      expect(reply).toBe(
        'Для выбранного маршрута пока не задана цена. Начните заново: /taxi.',
      );
      expect(prisma.orderUpdate).not.toHaveBeenCalled();
    });

    it('refuses when no free car matches; draft remains at step 6', async () => {
      prisma.orderFindFirst.mockResolvedValue(confirmedDraft());
      prisma.cityFindUnique.mockResolvedValue(CITIES[0]);
      prisma.serviceFindMany.mockResolvedValue([]);
      assignment.findFreeCar.mockResolvedValue(null);

      const reply = await plugin.handle({
        user: ruUser(),
        content: 'taxi:confirm',
        kind: 'BUTTON',
      });

      expect(reply).toContain('нет свободной машины');
      expect(prisma.orderUpdate).not.toHaveBeenCalled();
    });
  });

  /* ------------------------------ cancel / stale ---------------------------- */

  describe('cancel and stale buttons', () => {
    it('cancel deletes the draft and confirms the cancellation', async () => {
      prisma.orderFindFirst.mockResolvedValue(draftRow({ draftStep: 4 }));

      const reply = await plugin.handle({
        user: ruUser(),
        content: 'taxi:cancel',
        kind: 'BUTTON',
      });

      expect(reply).toBe('Визард такси отменён, черновик удалён.');
      expect(prisma.orderDelete).toHaveBeenCalledWith({
        where: { id: 'ord-draft' },
      });
    });

    it('stale press (wrong step) returns the inactive reply and changes nothing', async () => {
      prisma.orderFindFirst.mockResolvedValue(draftRow({ draftStep: 3 }));

      const reply = await plugin.handle({
        user: ruUser(),
        content: 'taxi:from:c-msk',
        kind: 'BUTTON',
      });

      expect(reply).toContain('Визард такси неактивен');
      expect(prisma.orderUpdate).not.toHaveBeenCalled();
    });

    it('button press without any draft returns the inactive reply', async () => {
      prisma.orderFindFirst.mockResolvedValue(null);

      const reply = await plugin.handle({
        user: ruUser(),
        content: 'taxi:done',
        kind: 'BUTTON',
      });

      expect(reply).toContain('/taxi');
      expect(prisma.orderCreate).not.toHaveBeenCalled();
    });

    it('unknown payload action returns the inactive reply', async () => {
      const reply = await plugin.handle({
        user: ruUser(),
        content: 'taxi:bogus',
        kind: 'BUTTON',
      });
      expect(reply).toContain('неактивен');
    });
  });

  /* ------------------------------- pagination ------------------------------- */

  describe('pagination', () => {
    // design D4: dictionaries longer than PAGE_SIZE render in portions with
    // taxi:page navigation, never exceeding MAX_BUTTONS per message.
    type StepReply = {
      text: string;
      buttons: Array<{ title: string; callbackData: string }>;
    };

    const manyCities = (n: number) =>
      Array.from({ length: n }, (_, i) => ({
        id: `c-${i}`,
        name: `Город ${i}`,
        distanceKm: i,
        isActive: true,
      }));

    const startAt = async (draftStep: number): Promise<StepReply> => {
      prisma.orderFindFirst.mockResolvedValue(draftRow({ draftStep }));
      return (await plugin.handle({
        user: ruUser(),
        content: '/taxi',
        kind: 'TEXT',
      })) as StepReply;
    };

    it('renders 9 cities as two pages: 8 items + Далее + Отмена and a page suffix', async () => {
      prisma.cityFindMany.mockResolvedValue(manyCities(9));

      const reply = await startAt(1);

      expect(reply.text).toContain('Шаг 1/6');
      expect(reply.text).toContain('страница 1 из 2');
      expect(reply.buttons.map((b) => b.title)).toEqual([
        'Город 0',
        'Город 1',
        'Город 2',
        'Город 3',
        'Город 4',
        'Город 5',
        'Город 6',
        'Город 7',
        'Далее',
        'Отмена',
      ]);
      expect(reply.buttons.map((b) => b.callbackData)).not.toContain(
        'taxi:from:c-8',
      );
    });

    it('keeps the exact title on single-page steps', async () => {
      const reply = await startAt(1);

      expect(reply.text).toBe('Шаг 1/6: Откуда едем?');
    });

    it('navigates pages with taxi:page and shows Назад on page 2 without Далее', async () => {
      prisma.cityFindMany.mockResolvedValue(manyCities(9));

      await startAt(1);
      const page2 = (await plugin.handle({
        user: ruUser(),
        content: 'taxi:page:2',
        kind: 'BUTTON',
      })) as StepReply;

      expect(page2.text).toContain('страница 2 из 2');
      expect(page2.buttons.map((b) => b.title)).toEqual([
        'Город 8',
        'Назад',
        'Отмена',
      ]);
    });

    it('keeps every page within MAX_BUTTONS for a huge dictionary', async () => {
      prisma.cityFindMany.mockResolvedValue(manyCities(40));

      let reply = await startAt(1);
      let page = 1;
      for (;;) {
        expect(reply.buttons.length).toBeLessThanOrEqual(12);
        const next = reply.buttons.find(
          (b) => b.callbackData === `taxi:page:${page + 1}`,
        );
        if (!next) {
          break;
        }
        page += 1;
        reply = (await plugin.handle({
          user: ruUser(),
          content: next.callbackData,
          kind: 'BUTTON',
        })) as StepReply;
      }
      expect(page).toBe(5); // ceil(40 / 8)
    });

    it('clamps out-of-range and malformed page presses to the edge pages', async () => {
      prisma.cityFindMany.mockResolvedValue(manyCities(9));

      await startAt(1);
      const last = (await plugin.handle({
        user: ruUser(),
        content: 'taxi:page:99',
        kind: 'BUTTON',
      })) as { text: string };
      expect(last.text).toContain('страница 2 из 2');

      const first = (await plugin.handle({
        user: ruUser(),
        content: 'taxi:page:abc',
        kind: 'BUTTON',
      })) as { text: string };
      expect(first.text).toContain('страница 1 из 2');
    });

    it('svc toggle carries the page and re-renders it with the marker', async () => {
      prisma.serviceFindMany.mockResolvedValue(
        Array.from({ length: 12 }, (_, i) => ({
          id: `svc-${i}`,
          name: `Услуга ${i}`,
          surcharge: 10,
          isCarFeature: false,
          isActive: true,
          sortOrder: i,
        })),
      );
      prisma.serviceFindFirst.mockResolvedValue({
        id: 'svc-9',
        name: 'Услуга 9',
        surcharge: 10,
        isCarFeature: false,
        isActive: true,
        sortOrder: 9,
      });
      prisma.orderFindFirst.mockResolvedValue(
        draftRow({ draftStep: 5, passengerCount: 2 }),
      );
      prisma.orderUpdate.mockResolvedValue(
        draftRow({
          draftStep: 5,
          passengerCount: 2,
          serviceIds: ['svc-9'],
        }),
      );

      const reply = (await plugin.handle({
        user: ruUser(),
        content: 'taxi:svc:svc-9:2',
        kind: 'BUTTON',
      })) as { text: string; buttons: Array<{ title: string }> };

      expect(prisma.orderUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ data: { serviceIds: ['svc-9'] } }),
      );
      expect(reply.text).toContain('страница 2 из 2');
      expect(reply.buttons.map((b) => b.title)).toContain('✓ Услуга 9 (+10 ₽)');

      // The un-paged payload renders page 1, where the toggled service
      // (page 2) is absent — the marker must not leak onto the wrong page.
      const page1 = (await plugin.handle({
        user: ruUser(),
        content: 'taxi:svc:svc-9',
        kind: 'BUTTON',
      })) as { text: string; buttons: Array<{ title: string }> };
      expect(page1.text).toContain('страница 1 из 2');
      expect(page1.buttons.map((b) => b.title)).not.toContain(
        '✓ Услуга 9 (+10 ₽)',
      );
    });

    it('nav press on the confirmation step and without a draft stays inactive', async () => {
      prisma.orderFindFirst.mockResolvedValue(
        draftRow({
          draftStep: 6,
          fromCityId: 'c-msk',
          toCityId: 'c-spb',
          passengerCount: 2,
        }),
      );
      const stale = await plugin.handle({
        user: ruUser(),
        content: 'taxi:page:2',
        kind: 'BUTTON',
      });
      expect(String(stale)).toContain('неактивен');

      prisma.orderFindFirst.mockResolvedValue(null);
      const noDraft = await plugin.handle({
        user: ruUser(),
        content: 'taxi:page:2',
        kind: 'BUTTON',
      });
      expect(String(noDraft)).toContain('неактивен');
    });
  });

  /* -------------------------------- language -------------------------------- */

  describe('language', () => {
    it('renders en replies for an en user', async () => {
      prisma.orderFindFirst.mockResolvedValue(null);
      prisma.orderCreate.mockResolvedValue(draftRow());

      const reply = (await plugin.handle({
        user: userRow('en'),
        content: '/taxi',
        kind: 'TEXT',
      })) as { text: string };

      expect(reply.text).toBe('Step 1/6: Where do you leave from?');
    });
  });

  /* --------------------------- telegram payload cap -------------------------- */

  describe('callback_data size', () => {
    it('keeps every button payload within the Telegram 64-byte limit', async () => {
      prisma.orderFindFirst.mockResolvedValue(draftRow({ draftStep: 1 }));
      prisma.orderCreate.mockResolvedValue(draftRow());

      for (const content of [
        '/taxi',
        'taxi:from:c-msk',
        'taxi:to:c-tvr',
        'taxi:slot:s-12',
        'taxi:pax:o-1',
        'taxi:page:12',
        'taxi:svc:svc-seat:99',
      ]) {
        const reply = (await plugin.handle({
          user: ruUser(),
          content,
          kind: content === '/taxi' ? 'TEXT' : 'BUTTON',
        })) as { buttons?: Array<{ callbackData: string }> };
        for (const button of reply.buttons ?? []) {
          expect(
            Buffer.byteLength(button.callbackData, 'utf8'),
          ).toBeLessThanOrEqual(64);
          // design D4: cuid-based payloads stay far below the limit (~36 bytes)
          if (button.callbackData.startsWith('taxi:')) {
            expect(
              Buffer.byteLength(button.callbackData, 'utf8'),
            ).toBeLessThanOrEqual(40);
          }
        }
      }
    });
  });
});
