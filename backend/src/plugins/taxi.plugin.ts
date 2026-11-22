import { Injectable } from '@nestjs/common';
import type { KeyboardButtonDto } from '../dto/keyboard.dto.js';
import type {
  Language,
  TaxiCity,
  TaxiOrder,
  User,
} from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { TaxiCarAssignmentService } from '../services/taxi-car-assignment.service.js';
import { TaxiPriceMatrixService } from '../services/taxi-price-matrix.service.js';
import { normalizeLanguage } from '../utils/language.js';
import {
  BotPlugin,
  BotPluginContext,
  BotPluginReply,
  BotPluginSourceKind,
} from './bot-plugin.interface.js';

/** Command that starts (or resumes) the taxi wizard (case-insensitive). */
const TRIGGER = '/taxi';

/** Namespace of every taxi wizard button payload (design D4). */
const CALLBACK_PREFIX = 'taxi:';

/** Payload actions and the draft step each one belongs to. */
const ACTION_STEP: Record<string, number> = {
  from: 1,
  to: 2,
  slot: 3,
  pax: 4,
  svc: 5,
  done: 5,
  confirm: 6,
};

/**
 * Dictionary items per page on the wizard's list steps (design D4). Sized so
 * the worst page — 8 items + back + next + done + cancel — is exactly
 * MAX_BUTTONS: a dictionary of any size renders without tripping
 * validateButtons, which the dispatcher would otherwise swallow silently
 * (step reply dropped, the user sees nothing after the press).
 */
const PAGE_SIZE = 8;

/**
 * User-facing strings of the wizard, keyed by the user's active language
 * (design D4, same pattern as SettingsPlugin). Placeholders in curly braces
 * are filled by `fill`.
 */
const TEXTS: Record<
  Language,
  {
    noCities: string;
    from: string;
    to: string;
    toUnavailable: string;
    slot: string;
    slotUnavailable: string;
    pax: string;
    paxUnavailable: string;
    svc: string;
    svcDone: string;
    confirm: string;
    confirmBtn: string;
    cancelBtn: string;
    backBtn: string;
    nextBtn: string;
    pageOf: string;
    confirmDetails: string;
    confirmServicesNone: string;
    success: string;
    noPrice: string;
    noCar: string;
    cancelled: string;
    inactive: string;
  }
> = {
  en: {
    noCities: 'No routes available: there are no active cities yet.',
    from: 'Step 1/6: Where do you leave from?',
    to: 'Step 2/6: Where are you heading?',
    toUnavailable: 'No destination city can be chosen right now.',
    slot: 'Step 3/6: Departure time?',
    slotUnavailable: 'No departure times are configured right now.',
    pax: 'Step 4/6: How many passengers?',
    paxUnavailable: 'No passenger-count options are configured right now.',
    svc: 'Step 5/6: Extra services (optional):',
    svcDone: 'Done',
    confirm: 'Step 6/6: Confirmation',
    confirmBtn: 'Confirm',
    cancelBtn: 'Cancel',
    backBtn: 'Back',
    nextBtn: 'Next',
    pageOf: 'page {page} of {pages}',
    confirmDetails:
      'Route: {from} → {to}\nDeparture: {slot}\nPassengers: {pax}\n' +
      'Services: {services}\nBase price: {base} ₽\nTotal: {total} ₽',
    confirmServicesNone: '—',
    success:
      'Order #{id} submitted! Total: {total} ₽\nCar: {car}, {plate}' +
      '{colorSuffix}\nDriver: {driver}',
    noPrice: 'No price is set for this route yet. Start over: send /taxi.',
    noCar:
      'There is no free car matching your request (seats or equipment) ' +
      'right now. Change the request via /taxi or try again later — ' +
      'your draft is kept.',
    cancelled: 'The taxi wizard is cancelled, the draft is deleted.',
    inactive:
      'The taxi wizard is not active or the button is stale. ' +
      'Send /taxi to start over.',
  },
  ru: {
    noCities: 'Маршруты недоступны: пока нет активных населённых пунктов.',
    from: 'Шаг 1/6: Откуда едем?',
    to: 'Шаг 2/6: Куда едем?',
    toUnavailable: 'Сейчас нечего выбрать пунктом назначения.',
    slot: 'Шаг 3/6: Время выезда?',
    slotUnavailable: 'Сейчас нечего выбрать временем выезда.',
    pax: 'Шаг 4/6: Сколько человек поедет?',
    paxUnavailable: 'Сейчас нечего выбрать количеством человек.',
    svc: 'Шаг 5/6: Доп. услуги (по желанию):',
    svcDone: 'Готово',
    confirm: 'Шаг 6/6: Подтверждение',
    confirmBtn: 'Подтвердить',
    cancelBtn: 'Отмена',
    backBtn: 'Назад',
    nextBtn: 'Далее',
    pageOf: 'страница {page} из {pages}',
    confirmDetails:
      'Маршрут: {from} → {to}\nВремя выезда: {slot}\nПассажиров: {pax}\n' +
      'Услуги: {services}\nБазовая цена: {base} ₽\nИтого: {total} ₽',
    confirmServicesNone: '—',
    success:
      'Заказ №{id} оформлен! Итого: {total} ₽\nМашина: {car}, {plate}' +
      '{colorSuffix}\nВодитель: {driver}',
    noPrice:
      'Для выбранного маршрута пока не задана цена. Начните заново: /taxi.',
    noCar:
      'Сейчас нет свободной машины под ваш запрос (вместимость или ' +
      'оснащение). Измените запрос через /taxi или повторите позже — ' +
      'черновик сохранён.',
    cancelled: 'Визард такси отменён, черновик удалён.',
    inactive:
      'Визард такси неактивен или кнопка устарела. Отправьте /taxi, ' +
      'чтобы начать заново.',
  },
};

/** Marker prefixed to the button of a selected extra service. */
const SELECTED_MARKER = '✓ ';

/** Fills `{placeholder}` occurrences with the given values. */
function fill(template: string, values: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in values ? values[key] : match,
  );
}

/** Draft's `serviceIds` JSON as a plain string array. */
function draftServiceIds(draft: TaxiOrder): string[] {
  return Array.isArray(draft.serviceIds) ? (draft.serviceIds as string[]) : [];
}

/** Payload page number sanitized: anything invalid falls back to page 1. */
function parsePage(raw: string | undefined): number {
  const page = Number.parseInt(raw ?? '', 10);
  return Number.isFinite(page) && page >= 1 ? page : 1;
}

/**
 * The taxi-order wizard (design D4): a 6-step state machine stored on the
 * user's single DRAFT TaxiOrder row, driven by `taxi:*` button payloads.
 * Every outcome — including refusals — is returned as a BotPluginReply,
 * never thrown, so the dispatcher can persist it as a bot message.
 */
@Injectable()
export class TaxiPlugin implements BotPlugin {
  readonly name = 'taxi';
  readonly handlesCallbacks = true;

  constructor(
    private readonly prisma: PrismaService,
    private readonly priceMatrix: TaxiPriceMatrixService,
    private readonly assignment: TaxiCarAssignmentService,
  ) {}

  canHandle(content: string, kind: BotPluginSourceKind): boolean {
    if (kind === 'BUTTON') {
      return content.startsWith(CALLBACK_PREFIX);
    }
    return content.trim().toLowerCase() === TRIGGER;
  }

  async handle(context: BotPluginContext): Promise<BotPluginReply> {
    const texts = TEXTS[normalizeLanguage(context.user.language) ?? 'en'];
    try {
      if (context.kind === 'TEXT') {
        return await this.handleStart(context.user, texts);
      }
      return await this.handleButton(context.user, context.content, texts);
    } catch (error) {
      // Plugins must never break the chat pipeline: any unexpected failure
      // (dictionary changed mid-flight, transient DB error) degrades to the
      // polite "wizard inactive" reply.
      console.error(
        `[TaxiPlugin] failed to handle "${context.content}":`,
        error,
      );
      return texts.inactive;
    }
  }

  /* ------------------------------ /taxi command ------------------------------ */

  private async handleStart(
    user: User,
    texts: (typeof TEXTS)[Language],
  ): Promise<BotPluginReply> {
    const cities = await this.activeCities();
    if (cities.length === 0) {
      return texts.noCities;
    }
    const draft = await this.prisma.taxiOrder.findFirst({
      where: { userId: user.id, status: 'DRAFT' },
    });
    if (draft) {
      // Resume exactly where the user stopped; selections are preserved.
      return this.renderStep(draft, user, texts);
    }
    const created = await this.prisma.taxiOrder.create({
      data: {
        userId: user.id,
        status: 'DRAFT',
        draftStep: 1,
        serviceIds: [],
      },
    });
    return this.renderStep(created, user, texts);
  }

  /* ------------------------------- buttons ---------------------------------- */

  private async handleButton(
    user: User,
    payload: string,
    texts: (typeof TEXTS)[Language],
  ): Promise<BotPluginReply> {
    const [action, id, pagePart] = payload
      .slice(CALLBACK_PREFIX.length)
      .split(':');

    if (action === 'cancel') {
      return this.handleCancel(user, texts);
    }
    if (action === 'page') {
      // `taxi:page:<n>` has only two segments — the page rides in `id`,
      // unlike `taxi:svc:<serviceId>:<page>` where pagePart is the page.
      return this.handlePage(user, id, texts);
    }

    const step = ACTION_STEP[action];
    if (step === undefined) {
      return texts.inactive;
    }

    const draft = await this.prisma.taxiOrder.findFirst({
      where: { userId: user.id, status: 'DRAFT' },
    });
    // No active wizard, stale button from an old message, or a press for a
    // step the draft has not reached — same polite reply, no state change.
    if (!draft || draft.draftStep !== step) {
      return texts.inactive;
    }

    switch (action) {
      case 'from':
        return this.selectCity(draft, id, 'fromCityId', 2, user, texts);
      case 'to':
        return this.selectCity(draft, id, 'toCityId', 3, user, texts);
      case 'slot':
        return this.selectSlot(draft, id, user, texts);
      case 'pax':
        return this.selectPassengers(draft, id, user, texts);
      case 'svc':
        return this.toggleService(draft, id, user, texts, parsePage(pagePart));
      case 'done':
        return this.finishServices(draft, user, texts);
      case 'confirm':
        return this.confirm(draft, user, texts);
      default:
        return texts.inactive;
    }
  }

  private async handleCancel(
    user: User,
    texts: (typeof TEXTS)[Language],
  ): Promise<BotPluginReply> {
    const draft = await this.prisma.taxiOrder.findFirst({
      where: { userId: user.id, status: 'DRAFT' },
    });
    if (!draft) {
      return texts.inactive;
    }
    await this.prisma.taxiOrder.delete({ where: { id: draft.id } });
    return texts.cancelled;
  }

  /**
   * Page navigation (`taxi:page:<n>`, design D4): re-renders the current
   * dictionary step (steps 1..5) at the requested page. Pages outside the
   * actual range clamp to the edge, so a catalog that shrank under an old
   * message still answers with a valid screen instead of the stale-button
   * refusal; on the confirmation step (or without a draft) the press is
   * stale by definition.
   */
  private async handlePage(
    user: User,
    pagePart: string | undefined,
    texts: (typeof TEXTS)[Language],
  ): Promise<BotPluginReply> {
    const draft = await this.prisma.taxiOrder.findFirst({
      where: { userId: user.id, status: 'DRAFT' },
    });
    if (!draft || draft.draftStep > 5) {
      return texts.inactive;
    }
    return this.renderStep(draft, user, texts, parsePage(pagePart));
  }

  private async selectCity(
    draft: TaxiOrder,
    cityId: string | undefined,
    field: 'fromCityId' | 'toCityId',
    nextStep: number,
    user: User,
    texts: (typeof TEXTS)[Language],
  ): Promise<BotPluginReply> {
    const city = cityId
      ? (await this.activeCities()).find((c) => c.id === cityId)
      : undefined;
    if (!city) {
      return texts.inactive;
    }
    const updated = await this.prisma.taxiOrder.update({
      where: { id: draft.id },
      data: { [field]: city.id, draftStep: nextStep },
    });
    return this.renderStep(updated, user, texts);
  }

  private async selectSlot(
    draft: TaxiOrder,
    slotId: string | undefined,
    user: User,
    texts: (typeof TEXTS)[Language],
  ): Promise<BotPluginReply> {
    const slot = slotId
      ? await this.prisma.taxiDepartureSlot.findFirst({
          where: { id: slotId, isActive: true },
        })
      : null;
    if (!slot) {
      return texts.inactive;
    }
    const updated = await this.prisma.taxiOrder.update({
      where: { id: draft.id },
      data: { departureSlotId: slot.id, draftStep: 4 },
    });
    return this.renderStep(updated, user, texts);
  }

  private async selectPassengers(
    draft: TaxiOrder,
    optionId: string | undefined,
    user: User,
    texts: (typeof TEXTS)[Language],
  ): Promise<BotPluginReply> {
    const option = optionId
      ? await this.prisma.taxiPassengerOption.findFirst({
          where: { id: optionId, isActive: true },
        })
      : null;
    if (!option) {
      return texts.inactive;
    }
    const updated = await this.prisma.taxiOrder.update({
      where: { id: draft.id },
      data: { passengerCount: option.count, draftStep: 5 },
    });
    return this.renderStep(updated, user, texts);
  }

  private async toggleService(
    draft: TaxiOrder,
    serviceId: string | undefined,
    user: User,
    texts: (typeof TEXTS)[Language],
    page: number,
  ): Promise<BotPluginReply> {
    const service = serviceId
      ? await this.prisma.taxiExtraService.findFirst({
          where: { id: serviceId, isActive: true },
        })
      : null;
    if (!service) {
      return texts.inactive;
    }
    const ids = draftServiceIds(draft);
    const next = ids.includes(service.id)
      ? ids.filter((id) => id !== service.id)
      : [...ids, service.id];
    const updated = await this.prisma.taxiOrder.update({
      where: { id: draft.id },
      data: { serviceIds: next },
    });
    // The toggle re-renders the same page the pressed button came from (the
    // page rides in the payload — design D4), so the marker is visible where
    // the user just was.
    return this.renderStep(updated, user, texts, page);
  }

  private async finishServices(
    draft: TaxiOrder,
    user: User,
    texts: (typeof TEXTS)[Language],
  ): Promise<BotPluginReply> {
    const updated = await this.prisma.taxiOrder.update({
      where: { id: draft.id },
      data: { draftStep: 6 },
    });
    return this.renderStep(updated, user, texts);
  }

  /* ------------------------------- confirm ---------------------------------- */

  private async confirm(
    draft: TaxiOrder,
    user: User,
    texts: (typeof TEXTS)[Language],
  ): Promise<BotPluginReply> {
    if (!draft.fromCityId || !draft.toCityId) {
      return texts.inactive;
    }
    const [from, to] = await Promise.all([
      this.prisma.taxiCity.findUnique({ where: { id: draft.fromCityId } }),
      this.prisma.taxiCity.findUnique({ where: { id: draft.toCityId } }),
    ]);
    if (!from || !to) {
      return texts.noPrice;
    }
    const slot = draft.departureSlotId
      ? await this.prisma.taxiDepartureSlot.findUnique({
          where: { id: draft.departureSlotId },
        })
      : null;

    const selectedIds = draftServiceIds(draft);
    const services = await this.prisma.taxiExtraService.findMany({
      where: { id: { in: selectedIds }, isActive: true },
      orderBy: [{ sortOrder: 'asc' }],
    });
    // Plain objects (not DTO instances) so the value fits Prisma's
    // InputJsonValue without an index-signature fight.
    const serviceSnapshot = services.map((service) => ({
      id: service.id,
      name: service.name,
      surcharge: service.surcharge,
    }));

    const priceBase = await this.priceMatrix.pairPrice(from.id, to.id);
    if (priceBase === null) {
      // Spec: заказ не сохраняется, черновик остаётся.
      return texts.noPrice;
    }
    const priceTotal =
      priceBase + services.reduce((sum, service) => sum + service.surcharge, 0);
    const requiredFeatureIds = services
      .filter((service) => service.isCarFeature)
      .map((service) => service.id);

    if (!draft.passengerCount) {
      return texts.inactive;
    }

    // Assignment + confirmation in one transaction (design D11).
    const order = await this.prisma.$transaction(async (tx) => {
      const car = await this.assignment.findFreeCar(
        draft.passengerCount as number,
        requiredFeatureIds,
        tx,
      );
      if (!car) {
        return null;
      }
      return tx.taxiOrder.update({
        where: { id: draft.id },
        data: {
          status: 'NEW',
          draftStep: 6,
          carId: car.id,
          fromCityName: from.name,
          toCityName: to.name,
          departureSlotLabel: slot?.time ?? null,
          serviceSnapshot,
          priceBase,
          priceTotal,
          carSnapshot: {
            driverName: car.driver.fullName,
            model: car.model,
            plate: car.plate,
            color: car.color,
          },
          confirmedAt: new Date(),
        },
      });
    });

    if (!order) {
      // No free car: refusal, draft stays at the confirmation step.
      return texts.noCar;
    }
    return fill(texts.success, {
      id: order.id.slice(-6).toUpperCase(),
      total: String(priceTotal),
      car: (order.carSnapshot as { model: string }).model,
      plate: (order.carSnapshot as { plate: string }).plate,
      colorSuffix: '',
      driver: (order.carSnapshot as { driverName: string }).driverName,
    });
  }

  /* ---------------------------- step rendering ------------------------------ */

  private async activeCities(): Promise<TaxiCity[]> {
    return this.prisma.taxiCity.findMany({
      where: { isActive: true },
      orderBy: [{ distanceKm: 'asc' }],
    });
  }

  private async renderStep(
    draft: TaxiOrder,
    user: User,
    texts: (typeof TEXTS)[Language],
    page = 1,
  ): Promise<BotPluginReply> {
    switch (draft.draftStep) {
      case 1: {
        const cities = await this.activeCities();
        return this.pagedReply(
          cities.map((city): KeyboardButtonDto => ({
            title: city.name,
            callbackData: `taxi:from:${city.id}`,
          })),
          page,
          texts.from,
          texts,
        );
      }
      case 2: {
        const cities = (await this.activeCities()).filter(
          (city) => city.id !== draft.fromCityId,
        );
        if (cities.length === 0) {
          return texts.toUnavailable;
        }
        return this.pagedReply(
          cities.map((city): KeyboardButtonDto => ({
            title: city.name,
            callbackData: `taxi:to:${city.id}`,
          })),
          page,
          texts.to,
          texts,
        );
      }
      case 3: {
        const slots = await this.prisma.taxiDepartureSlot.findMany({
          where: { isActive: true },
          orderBy: [{ sortOrder: 'asc' }, { time: 'asc' }],
        });
        if (slots.length === 0) {
          return texts.slotUnavailable;
        }
        return this.pagedReply(
          slots.map((slot): KeyboardButtonDto => ({
            title: slot.time,
            callbackData: `taxi:slot:${slot.id}`,
          })),
          page,
          texts.slot,
          texts,
        );
      }
      case 4: {
        const options = await this.prisma.taxiPassengerOption.findMany({
          where: { isActive: true },
          orderBy: [{ sortOrder: 'asc' }, { count: 'asc' }],
        });
        if (options.length === 0) {
          return texts.paxUnavailable;
        }
        return this.pagedReply(
          options.map((option): KeyboardButtonDto => ({
            title: String(option.count),
            callbackData: `taxi:pax:${option.id}`,
          })),
          page,
          texts.pax,
          texts,
        );
      }
      case 5: {
        const services = await this.prisma.taxiExtraService.findMany({
          where: { isActive: true },
          orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        });
        const selected = draftServiceIds(draft);
        return this.pagedReply(
          services.map((service): KeyboardButtonDto => ({
            title: `${selected.includes(service.id) ? SELECTED_MARKER : ''}${service.name} (+${service.surcharge} ₽)`,
            callbackData: `taxi:svc:${service.id}:${page}`,
          })),
          page,
          texts.svc,
          texts,
          { title: texts.svcDone, callbackData: 'taxi:done' },
        );
      }
      default:
        return this.renderConfirmation(draft, texts);
    }
  }

  /**
   * Renders one page of a dictionary step (design D4): at most PAGE_SIZE
   * item buttons plus navigation and control buttons, staying within
   * MAX_BUTTONS on every page — 8 items + back + next + done + cancel = 12.
   * The page lives in the button payloads only; the draft row is untouched,
   * and the title gains a «page N of M» suffix only when paginated.
   */
  private pagedReply(
    items: KeyboardButtonDto[],
    page: number,
    title: string,
    texts: (typeof TEXTS)[Language],
    done?: KeyboardButtonDto,
  ): BotPluginReply {
    const pages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
    const current = Math.min(Math.max(1, page), pages);
    const buttons: KeyboardButtonDto[] = items.slice(
      (current - 1) * PAGE_SIZE,
      current * PAGE_SIZE,
    );
    if (current > 1) {
      buttons.push({
        title: texts.backBtn,
        callbackData: `taxi:page:${current - 1}`,
      });
    }
    if (current < pages) {
      buttons.push({
        title: texts.nextBtn,
        callbackData: `taxi:page:${current + 1}`,
      });
    }
    if (done) {
      buttons.push(done);
    }
    buttons.push({ title: texts.cancelBtn, callbackData: 'taxi:cancel' });
    return {
      text:
        pages > 1
          ? `${title} (${fill(texts.pageOf, {
              page: String(current),
              pages: String(pages),
            })})`
          : title,
      buttons,
    };
  }

  private async renderConfirmation(
    draft: TaxiOrder,
    texts: (typeof TEXTS)[Language],
  ): Promise<BotPluginReply> {
    const [from, to] = await Promise.all([
      draft.fromCityId
        ? this.prisma.taxiCity.findUnique({ where: { id: draft.fromCityId } })
        : null,
      draft.toCityId
        ? this.prisma.taxiCity.findUnique({ where: { id: draft.toCityId } })
        : null,
    ]);
    const slot = draft.departureSlotId
      ? await this.prisma.taxiDepartureSlot.findUnique({
          where: { id: draft.departureSlotId },
        })
      : null;
    const selectedIds = draftServiceIds(draft);
    const services = await this.prisma.taxiExtraService.findMany({
      where: { id: { in: selectedIds }, isActive: true },
      orderBy: [{ sortOrder: 'asc' }],
    });

    const priceBase =
      from && to ? await this.priceMatrix.pairPrice(from.id, to.id) : null;
    if (priceBase === null) {
      // No price for the pair: refuse but keep the draft (spec).
      return texts.noPrice;
    }
    const surcharges = services.reduce(
      (sum, service) => sum + service.surcharge,
      0,
    );
    return {
      text: `${texts.confirm}\n\n${fill(texts.confirmDetails, {
        from: from?.name ?? '—',
        to: to?.name ?? '—',
        slot: slot?.time ?? '—',
        pax: String(draft.passengerCount ?? '—'),
        services:
          services.map((service) => service.name).join(', ') ||
          texts.confirmServicesNone,
        base: String(priceBase),
        total: String(priceBase + surcharges),
      })}`,
      buttons: [
        { title: texts.confirmBtn, callbackData: 'taxi:confirm' },
        { title: texts.cancelBtn, callbackData: 'taxi:cancel' },
      ],
    };
  }
}
