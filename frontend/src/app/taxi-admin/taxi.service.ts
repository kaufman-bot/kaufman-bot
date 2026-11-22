import { Injectable, inject, signal } from '@angular/core';
import { SessionService } from '../session.service';
// SDK generated from the backend swagger.json (see backend/openapi-ts.config.ts,
// design D10). Paths inside are absolute (`/api/v1/...`), so an empty baseUrl
// keeps every request same-origin: dev-proxy in `ng serve`, reverse proxy in prod.
import type {
  AutoCalcResultDto,
  CreateTaxiCarRequestDto,
  CreateTaxiCityRequestDto,
  CreateTaxiDepartureSlotRequestDto,
  CreateTaxiDriverRequestDto,
  CreateTaxiExtraServiceRequestDto,
  CreateTaxiPassengerOptionRequestDto,
  TaxiCityDto,
  TaxiDepartureSlotDto,
  TaxiDriverDto,
  TaxiExtraServiceDto,
  TaxiOrderDto,
  TaxiPassengerOptionDto,
  TaxiPriceMatrixDto,
  UpdateTaxiCarRequestDto,
  UpdateTaxiCityRequestDto,
  UpdateTaxiDepartureSlotRequestDto,
  UpdateTaxiDriverRequestDto,
  UpdateTaxiExtraServiceRequestDto,
  UpdateTaxiOrderStatusRequestDto,
  UpdateTaxiPassengerOptionRequestDto,
} from '../../../../backend/test/generated/client';
import { Sdk } from '../../../../backend/test/generated/client';
import {
  createClient,
  createConfig,
} from '../../../../backend/test/generated/client/client/index';

/** Re-exported DTO types so pages import the API contract from one place. */
export type {
  AutoCalcResultDto,
  CreateTaxiCarRequestDto,
  CreateTaxiCityRequestDto,
  CreateTaxiDepartureSlotRequestDto,
  CreateTaxiDriverRequestDto,
  CreateTaxiExtraServiceRequestDto,
  CreateTaxiPassengerOptionRequestDto,
  TaxiCarDto,
  TaxiCityDto,
  TaxiDepartureSlotDto,
  TaxiDriverDto,
  TaxiExtraServiceDto,
  TaxiOrderDto,
  TaxiPassengerOptionDto,
  TaxiPriceMatrixCityDto,
  TaxiPriceMatrixDto,
  TaxiPricePairDto,
  UpdateTaxiCarRequestDto,
  UpdateTaxiCityRequestDto,
  UpdateTaxiDepartureSlotRequestDto,
  UpdateTaxiDriverRequestDto,
  UpdateTaxiExtraServiceRequestDto,
  UpdateTaxiOrderStatusRequestDto,
  UpdateTaxiPassengerOptionRequestDto,
} from '../../../../backend/test/generated/client';

/** Statuses the admin may switch a submitted order to. */
export type TaxiOrderStatus = TaxiOrderDto['status'];

/**
 * API failure carrying a human-readable Russian message. The wording mirrors
 * `utils/api-error.ts` (which works on `HttpErrorResponse`): the hey-api client
 * throws plain result fields instead, so the mapping is repeated here.
 */
export class TaxiApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'TaxiApiError';
  }
}

/** Pulls the `message` out of an `ApiErrorDto` body (string or string[]). */
function extractMessage(body: unknown): string | null {
  if (!body || typeof body !== 'object') {
    return null;
  }
  const message = (body as { message?: unknown }).message;
  if (typeof message === 'string' && message.trim()) {
    return message.trim();
  }
  if (Array.isArray(message)) {
    const parts = message.filter(
      (item): item is string => typeof item === 'string' && !!item.trim(),
    );
    if (parts.length > 0) {
      return parts.join(', ');
    }
  }
  return null;
}

/** Maps an SDK failure to the same wording as `describeApiError`. */
function describeSdkError(error: unknown, response?: Response): string {
  if (!response) {
    return 'Сервер недоступен — проверьте, что бэкенд запущен';
  }
  if (response.status === 401 || response.status === 403) {
    return 'API-ключ недействителен, отозван или истёк';
  }
  if (response.status === 404) {
    return 'Ресурс не найден';
  }
  if (response.status >= 500) {
    return 'Ошибка на сервере, попробуйте позже';
  }
  return extractMessage(error) ?? `Ошибка запроса (${response.status})`;
}

/** Unwraps the hey-api `{ data | error }` result into plain data or TaxiApiError. */
async function unwrap<T>(
  result: Promise<{ data?: T; error?: unknown; response?: Response }>,
): Promise<T> {
  const res = await result;
  if (res.error !== undefined) {
    throw new TaxiApiError(
      describeSdkError(res.error, res.response),
      res.response?.status,
    );
  }
  return res.data as T;
}

/**
 * Builds a browser-dedicated hey-api client: relative baseUrl (same origin as
 * the UI) plus the x-api-key header and the 401 → session expiry handling that
 * `authInterceptor` provides for HttpClient calls but a raw fetch client lacks.
 * Each TaxiService instance gets its own client, so Jest test instances never
 * share interceptor state.
 */
function createFrontendClient(session: SessionService) {
  const sdkClient = createClient(createConfig({ baseUrl: '' }));
  sdkClient.interceptors.request.use((request) => {
    const apiKey = session.apiKey();
    if (apiKey) {
      request.headers.set('x-api-key', apiKey);
    }
    return request;
  });
  sdkClient.interceptors.response.use((response) => {
    // Mirror authInterceptor: a rejected key ends the session immediately.
    if (response.status === 401) {
      session.expire();
    }
    return response;
  });
  return sdkClient;
}

/**
 * HTTP gateway of the taxi admin section. Read methods refresh reactive
 * signals and swallow errors into per-resource `*Error` signals; write
 * methods re-throw `TaxiApiError` so pages can show the message near the
 * form, and reload the corresponding list on success.
 */
@Injectable({ providedIn: 'root' })
export class TaxiService {
  private readonly sdk = new Sdk({
    client: createFrontendClient(inject(SessionService)),
  });

  /* --------------------------------- state --------------------------------- */

  readonly cities = signal<TaxiCityDto[]>([]);
  readonly citiesLoading = signal(false);
  readonly citiesError = signal<string | null>(null);

  readonly services = signal<TaxiExtraServiceDto[]>([]);
  readonly servicesLoading = signal(false);
  readonly servicesError = signal<string | null>(null);

  readonly slots = signal<TaxiDepartureSlotDto[]>([]);
  readonly slotsLoading = signal(false);
  readonly slotsError = signal<string | null>(null);

  readonly passengerOptions = signal<TaxiPassengerOptionDto[]>([]);
  readonly passengerOptionsLoading = signal(false);
  readonly passengerOptionsError = signal<string | null>(null);

  readonly drivers = signal<TaxiDriverDto[]>([]);
  readonly driversLoading = signal(false);
  readonly driversError = signal<string | null>(null);

  readonly matrix = signal<TaxiPriceMatrixDto | null>(null);
  readonly matrixLoading = signal(false);
  readonly matrixError = signal<string | null>(null);

  readonly orders = signal<TaxiOrderDto[]>([]);
  readonly ordersLoading = signal(false);
  readonly ordersError = signal<string | null>(null);

  /* ------------------------------ cities CRUD ------------------------------ */

  async loadCities(): Promise<void> {
    this.citiesLoading.set(true);
    this.citiesError.set(null);
    try {
      const dto = await unwrap(this.sdk.taxiCatalogControllerListCitiesV1());
      this.cities.set(dto.cities);
    } catch (error) {
      this.citiesError.set(
        error instanceof Error ? error.message : String(error),
      );
    } finally {
      this.citiesLoading.set(false);
    }
  }

  async createCity(body: CreateTaxiCityRequestDto): Promise<void> {
    await unwrap(this.sdk.taxiCatalogControllerCreateCityV1({ body }));
    await this.loadCities();
  }

  async updateCity(id: string, body: UpdateTaxiCityRequestDto): Promise<void> {
    await unwrap(
      this.sdk.taxiCatalogControllerUpdateCityV1({ path: { id }, body }),
    );
    await this.loadCities();
  }

  async removeCity(id: string): Promise<void> {
    await unwrap(this.sdk.taxiCatalogControllerRemoveCityV1({ path: { id } }));
    await this.loadCities();
  }

  /* ----------------------------- services CRUD ----------------------------- */

  async loadServices(): Promise<void> {
    this.servicesLoading.set(true);
    this.servicesError.set(null);
    try {
      const dto = await unwrap(this.sdk.taxiCatalogControllerListServicesV1());
      this.services.set(dto.services);
    } catch (error) {
      this.servicesError.set(
        error instanceof Error ? error.message : String(error),
      );
    } finally {
      this.servicesLoading.set(false);
    }
  }

  async createService(body: CreateTaxiExtraServiceRequestDto): Promise<void> {
    await unwrap(this.sdk.taxiCatalogControllerCreateServiceV1({ body }));
    await this.loadServices();
  }

  async updateService(
    id: string,
    body: UpdateTaxiExtraServiceRequestDto,
  ): Promise<void> {
    await unwrap(
      this.sdk.taxiCatalogControllerUpdateServiceV1({ path: { id }, body }),
    );
    await this.loadServices();
  }

  async removeService(id: string): Promise<void> {
    await unwrap(
      this.sdk.taxiCatalogControllerRemoveServiceV1({ path: { id } }),
    );
    await this.loadServices();
  }

  /* ------------------------ departure slots CRUD --------------------------- */

  async loadSlots(): Promise<void> {
    this.slotsLoading.set(true);
    this.slotsError.set(null);
    try {
      const dto = await unwrap(
        this.sdk.taxiCatalogControllerListDepartureSlotsV1(),
      );
      this.slots.set(dto.slots);
    } catch (error) {
      this.slotsError.set(
        error instanceof Error ? error.message : String(error),
      );
    } finally {
      this.slotsLoading.set(false);
    }
  }

  async createSlot(body: CreateTaxiDepartureSlotRequestDto): Promise<void> {
    await unwrap(this.sdk.taxiCatalogControllerCreateDepartureSlotV1({ body }));
    await this.loadSlots();
  }

  async updateSlot(
    id: string,
    body: UpdateTaxiDepartureSlotRequestDto,
  ): Promise<void> {
    await unwrap(
      this.sdk.taxiCatalogControllerUpdateDepartureSlotV1({
        path: { id },
        body,
      }),
    );
    await this.loadSlots();
  }

  async removeSlot(id: string): Promise<void> {
    await unwrap(
      this.sdk.taxiCatalogControllerRemoveDepartureSlotV1({ path: { id } }),
    );
    await this.loadSlots();
  }

  /* ----------------------- passenger options CRUD -------------------------- */

  async loadPassengerOptions(): Promise<void> {
    this.passengerOptionsLoading.set(true);
    this.passengerOptionsError.set(null);
    try {
      const dto = await unwrap(
        this.sdk.taxiCatalogControllerListPassengerOptionsV1(),
      );
      this.passengerOptions.set(dto.options);
    } catch (error) {
      this.passengerOptionsError.set(
        error instanceof Error ? error.message : String(error),
      );
    } finally {
      this.passengerOptionsLoading.set(false);
    }
  }

  async createPassengerOption(
    body: CreateTaxiPassengerOptionRequestDto,
  ): Promise<void> {
    await unwrap(
      this.sdk.taxiCatalogControllerCreatePassengerOptionV1({ body }),
    );
    await this.loadPassengerOptions();
  }

  async updatePassengerOption(
    id: string,
    body: UpdateTaxiPassengerOptionRequestDto,
  ): Promise<void> {
    await unwrap(
      this.sdk.taxiCatalogControllerUpdatePassengerOptionV1({
        path: { id },
        body,
      }),
    );
    await this.loadPassengerOptions();
  }

  async removePassengerOption(id: string): Promise<void> {
    await unwrap(
      this.sdk.taxiCatalogControllerRemovePassengerOptionV1({ path: { id } }),
    );
    await this.loadPassengerOptions();
  }

  /* -------------------------- drivers and cars ----------------------------- */

  async loadDrivers(): Promise<void> {
    this.driversLoading.set(true);
    this.driversError.set(null);
    try {
      const dto = await unwrap(this.sdk.taxiCatalogControllerListDriversV1());
      this.drivers.set(dto.drivers);
    } catch (error) {
      this.driversError.set(
        error instanceof Error ? error.message : String(error),
      );
    } finally {
      this.driversLoading.set(false);
    }
  }

  async createDriver(body: CreateTaxiDriverRequestDto): Promise<void> {
    await unwrap(this.sdk.taxiCatalogControllerCreateDriverV1({ body }));
    await this.loadDrivers();
  }

  async updateDriver(
    id: string,
    body: UpdateTaxiDriverRequestDto,
  ): Promise<void> {
    await unwrap(
      this.sdk.taxiCatalogControllerUpdateDriverV1({ path: { id }, body }),
    );
    await this.loadDrivers();
  }

  async removeDriver(id: string): Promise<void> {
    await unwrap(
      this.sdk.taxiCatalogControllerRemoveDriverV1({ path: { id } }),
    );
    await this.loadDrivers();
  }

  async createCar(
    driverId: string,
    body: CreateTaxiCarRequestDto,
  ): Promise<void> {
    await unwrap(
      this.sdk.taxiCatalogControllerCreateCarV1({ path: { driverId }, body }),
    );
    await this.loadDrivers();
  }

  async updateCar(
    driverId: string,
    carId: string,
    body: UpdateTaxiCarRequestDto,
  ): Promise<void> {
    await unwrap(
      this.sdk.taxiCatalogControllerUpdateCarV1({
        path: { driverId, carId },
        body,
      }),
    );
    await this.loadDrivers();
  }

  async removeCar(driverId: string, carId: string): Promise<void> {
    await unwrap(
      this.sdk.taxiCatalogControllerRemoveCarV1({
        path: { driverId, carId },
      }),
    );
    await this.loadDrivers();
  }

  /* ------------------------------ price matrix ----------------------------- */

  async loadMatrix(): Promise<void> {
    this.matrixLoading.set(true);
    this.matrixError.set(null);
    try {
      this.matrix.set(
        await unwrap(this.sdk.taxiPriceMatrixControllerGetMatrixV1()),
      );
    } catch (error) {
      this.matrixError.set(
        error instanceof Error ? error.message : String(error),
      );
    } finally {
      this.matrixLoading.set(false);
    }
  }

  async setPairPrice(
    fromCityId: string,
    toCityId: string,
    price: number,
  ): Promise<void> {
    await unwrap(
      this.sdk.taxiPriceMatrixControllerSetPairPriceV1({
        path: { fromCityId, toCityId },
        body: { price },
      }),
    );
    await this.loadMatrix();
  }

  async autoCalc(price: number): Promise<AutoCalcResultDto> {
    const result = await unwrap(
      this.sdk.taxiPriceMatrixControllerAutoCalcV1({ body: { price } }),
    );
    await this.loadMatrix();
    return result;
  }

  /* -------------------------------- orders --------------------------------- */

  async loadOrders(status?: TaxiOrderStatus): Promise<void> {
    this.ordersLoading.set(true);
    this.ordersError.set(null);
    try {
      const dto = await unwrap(
        this.sdk.taxiOrdersControllerListV1({
          query: status ? { status } : undefined,
        }),
      );
      this.orders.set(dto.orders);
    } catch (error) {
      this.ordersError.set(
        error instanceof Error ? error.message : String(error),
      );
    } finally {
      this.ordersLoading.set(false);
    }
  }

  async updateOrderStatus(
    id: string,
    body: UpdateTaxiOrderStatusRequestDto,
  ): Promise<void> {
    const updated = await unwrap(
      this.sdk.taxiOrdersControllerUpdateStatusV1({ path: { id }, body }),
    );
    // Patch in place: keeps the current filter visible without a refetch.
    this.orders.update((list) =>
      list.map((order) => (order.id === updated.id ? updated : order)),
    );
  }
}
