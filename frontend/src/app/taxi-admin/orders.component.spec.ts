import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TaxiOrdersComponent } from './orders.component';
import type { TaxiOrderDto } from './taxi.service';
import { TaxiApiError, TaxiService } from './taxi.service';

const seededOrders: TaxiOrderDto[] = [
  {
    id: 'o1',
    status: 'NEW',
    passengerEmail: 'ann@example.com',
    passengerId: 'u1',
    fromCityName: 'Москва',
    toCityName: 'Тверь',
    departureSlotLabel: '08:00 — 09:00',
    passengerCount: 3,
    services: [
      { id: 's1', name: 'Детское кресло', surcharge: 500 },
      { id: 's2', name: 'Перевозка лыж', surcharge: 300 },
    ],
    priceBase: 4900,
    priceTotal: 5700,
    carSnapshot: {
      driverName: 'Иван Иванов',
      model: 'Toyota Alphard',
      plate: 'А123ВС77',
      color: 'чёрный',
    },
    createdAt: '2026-11-20T08:00:00.000Z',
    confirmedAt: null,
  },
  {
    id: 'o2',
    status: 'CONFIRMED',
    passengerEmail: 'boris@example.com',
    passengerId: 'u2',
    fromCityName: 'Клин',
    toCityName: 'Тверь',
    departureSlotLabel: null,
    passengerCount: null,
    services: [],
    priceBase: 2400,
    priceTotal: 2400,
    carSnapshot: null,
    createdAt: '2026-11-21T09:30:00.000Z',
    confirmedAt: '2026-11-21T10:00:00.000Z',
  },
];

const makeServiceMock = () => ({
  // Настоящий сигнал: при неудачной смене статуса страница клонирует строку
  // через orders.update(), чтобы вернуть select к сохранённому статусу.
  orders: signal<TaxiOrderDto[]>(seededOrders),
  ordersLoading: () => false,
  ordersError: () => null,
  loadOrders: jest.fn().mockResolvedValue(undefined),
  updateOrderStatus: jest.fn().mockResolvedValue(undefined),
});

describe('TaxiOrdersComponent', () => {
  let fixture: ComponentFixture<TaxiOrdersComponent>;
  let serviceMock: ReturnType<typeof makeServiceMock>;

  beforeEach(async () => {
    serviceMock = makeServiceMock();
    await TestBed.configureTestingModule({
      imports: [TaxiOrdersComponent],
      providers: [{ provide: TaxiService, useValue: serviceMock }],
    }).compileComponents();

    fixture = TestBed.createComponent(TaxiOrdersComponent);
  });

  /** Flushes pending microtasks (service promise chains) before asserting. */
  const flushPromises = async (): Promise<void> => {
    await new Promise((resolve) => setTimeout(resolve, 0));
    fixture.detectChanges();
  };

  /** NgModel пишет значение в control микротаской — ждём её перед вводом. */
  const whenStable = async (): Promise<void> => {
    await fixture.whenStable();
    fixture.detectChanges();
  };

  it('renders the order rows from the service', () => {
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const rows = Array.from(
      compiled.querySelectorAll('.entity-table tbody tr'),
    ).map((row) => row.textContent ?? '');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toContain('ann@example.com');
    expect(rows[0]).toContain('Москва → Тверь');
    expect(rows[0]).toContain('08:00 — 09:00');
    expect(rows[0]).toContain('Детское кресло, Перевозка лыж');
    expect(rows[0]).toContain('5700');
    expect(rows[0]).toContain('Toyota Alphard (А123ВС77), Иван Иванов');
    expect(rows[1]).toContain('boris@example.com');
    expect(rows[1]).toContain('Клин → Тверь');
    // Load without a status — дефолтный фильтр бэкенда (активные заказы).
    expect(serviceMock.loadOrders).toHaveBeenCalledWith();
    // Mock не эмулирует перезагрузку после смены фильтра, поэтому вызов один.
    expect(serviceMock.loadOrders).toHaveBeenCalledTimes(1);
  });

  it('reloads the orders when the status filter changes', async () => {
    fixture.detectChanges();
    await whenStable();

    const compiled = fixture.nativeElement as HTMLElement;
    const filter = compiled.querySelector(
      'select[name="statusFilter"]',
    ) as HTMLSelectElement;
    filter.value = 'COMPLETED';
    filter.dispatchEvent(new Event('change'));
    await flushPromises();

    expect(serviceMock.loadOrders).toHaveBeenLastCalledWith('COMPLETED');
  });

  it('switches the order status through the service', async () => {
    fixture.detectChanges();
    await whenStable();

    const compiled = fixture.nativeElement as HTMLElement;
    const statusSelect = compiled.querySelector(
      'select[name="orderStatus"]',
    ) as HTMLSelectElement;
    statusSelect.value = 'CONFIRMED';
    statusSelect.dispatchEvent(new Event('change'));
    await flushPromises();

    expect(serviceMock.updateOrderStatus).toHaveBeenCalledWith('o1', {
      status: 'CONFIRMED',
    });
  });

  it('shows the API error and restores the row status on failure', async () => {
    // mockRejectedValueOnce создаёт reject через Promise другого реалма —
    // цепочка await компонента (zone-patched) оставляет его необработанным.
    serviceMock.updateOrderStatus.mockImplementationOnce(async () => {
      throw new TaxiApiError('Заказ уже завершён');
    });
    fixture.detectChanges();
    await whenStable();

    const compiled = fixture.nativeElement as HTMLElement;
    const statusSelect = compiled.querySelector(
      'select[name="orderStatus"]',
    ) as HTMLSelectElement;
    statusSelect.value = 'CANCELLED';
    statusSelect.dispatchEvent(new Event('change'));
    await flushPromises();

    const error = compiled.querySelector('.form-error');
    expect(error?.textContent).toContain('Заказ уже завершён');
    // Строка клонируется — select перепривязывается к сохранённому статусу.
    const restoredSelect = compiled.querySelector(
      'select[name="orderStatus"]',
    ) as HTMLSelectElement;
    expect(restoredSelect.value).toBe('NEW');
  });
});
