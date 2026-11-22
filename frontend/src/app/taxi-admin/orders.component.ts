import { CommonModule } from '@angular/common';
import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { TaxiOrderDto, TaxiOrderStatus } from './taxi.service';
import { TaxiService } from './taxi.service';

/** Styles shared verbatim by the four dictionary pages of the section. */
const pageStyles = [
  `
    .page-header {
      margin-bottom: 1rem;
    }

    .filter {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      font-size: 0.875rem;
      margin-bottom: 1rem;
    }

    .hint {
      color: #64748b;
      font-size: 0.875rem;
      margin: 0.25rem 0 0;
    }

    .entity-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 1.5rem;
    }

    .entity-table th,
    .entity-table td {
      padding: 0.5rem 0.75rem;
      border-bottom: 1px solid #e2e8f0;
      text-align: left;
    }

    .row-actions {
      display: flex;
      gap: 0.75rem;
    }

    .mono {
      font-family: monospace;
    }

    .link {
      background: none;
      border: none;
      color: #0ea5e9;
      cursor: pointer;
      padding: 0;
      font-size: 0.875rem;
    }

    .link.danger {
      color: #dc2626;
    }

    .entity-form {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
      max-width: 420px;
      padding: 1rem;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
    }

    .entity-form h3 {
      margin: 0;
    }

    .entity-form label {
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
      font-size: 0.875rem;
    }

    .entity-form label.inline {
      flex-direction: row;
      align-items: center;
      gap: 0.5rem;
    }

    .form-actions {
      display: flex;
      align-items: center;
      gap: 1rem;
    }

    .req {
      color: #dc2626;
    }

    .field-error {
      color: #dc2626;
      font-size: 0.8125rem;
    }

    .form-error,
    .list-error {
      color: #dc2626;
      font-size: 0.875rem;
    }

    .empty {
      color: #64748b;
    }
  `,
];

/** Russian labels of the statuses an order may be switched to. */
const STATUS_LABELS: Record<TaxiOrderStatus, string> = {
  NEW: 'Новая',
  CONFIRMED: 'Подтверждён',
  COMPLETED: 'Завершён',
  CANCELLED: 'Отменён',
};

/** Filter choices; the empty value is the default backend filter (active orders). */
const FILTER_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: '', label: 'Активные (новые и подтверждённые)' },
  { value: 'NEW', label: 'Новые' },
  { value: 'CONFIRMED', label: 'Подтверждённые' },
  { value: 'COMPLETED', label: 'Завершённые' },
  { value: 'CANCELLED', label: 'Отменённые' },
];

const STATUS_OPTIONS = (Object.keys(STATUS_LABELS) as TaxiOrderStatus[]).map(
  (status) => ({ value: status, label: STATUS_LABELS[status] }),
);

/**
 * Admin list of taxi orders (design D2/D11): route, price, services and the
 * assigned car come from immutable snapshots taken at confirmation time, so
 * later dictionary edits never change past orders. The status is the only
 * editable field — switching it calls the service and patches the row in
 * place, a failure restores the previous status.
 */
@Component({
  selector: 'app-taxi-orders',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <header class="page-header">
      <h1>Заказы</h1>
      <p class="hint">
        Маршрут, цена и машина фиксируются снапшотом при подтверждении заказа и
        не меняются при правках справочников. Менять можно только статус.
      </p>
    </header>

    <label class="filter">
      Статус
      <select
        name="statusFilter"
        [ngModel]="filterStatus()"
        (ngModelChange)="onFilterChange($event)"
      >
        @for (option of filterOptions; track option.value) {
          <option [value]="option.value">{{ option.label }}</option>
        }
      </select>
    </label>

    @if (service.ordersError()) {
      <p class="list-error">{{ service.ordersError() }}</p>
    }
    @if (service.ordersLoading()) {
      <p class="empty">Загрузка…</p>
    }

    <table class="entity-table">
      <thead>
        <tr>
          <th>Пассажир</th>
          <th>Маршрут</th>
          <th>Слот</th>
          <th>Чел.</th>
          <th>Услуги</th>
          <th>Цена, ₽</th>
          <th>Машина</th>
          <th>Статус</th>
          <th>Создан</th>
        </tr>
      </thead>
      <tbody>
        @for (order of service.orders(); track order) {
          <tr>
            <td>{{ order.passengerEmail }}</td>
            <td>{{ routeLabel(order) }}</td>
            <td>{{ order.departureSlotLabel ?? '—' }}</td>
            <td>{{ order.passengerCount ?? '—' }}</td>
            <td>{{ servicesLabel(order) }}</td>
            <td class="mono">{{ order.priceTotal ?? '—' }}</td>
            <td>{{ carLabel(order) }}</td>
            <td>
              <select
                name="orderStatus"
                [ngModel]="order.status"
                (ngModelChange)="onStatusChange(order, $event)"
              >
                @for (option of statusOptions; track option.value) {
                  <option [value]="option.value">{{ option.label }}</option>
                }
              </select>
            </td>
            <td>{{ order.createdAt | date: 'dd.MM.yyyy HH:mm' }}</td>
          </tr>
        } @empty {
          <tr>
            <td colspan="9" class="empty">Заказы не найдены.</td>
          </tr>
        }
      </tbody>
    </table>
    @if (statusError()) {
      <p class="form-error">{{ statusError() }}</p>
    }
  `,
  styles: pageStyles,
})
export class TaxiOrdersComponent implements OnInit {
  readonly service = inject(TaxiService);

  readonly filterOptions = FILTER_OPTIONS;
  readonly statusOptions = STATUS_OPTIONS;

  /** '' = the default backend filter (new + confirmed). */
  readonly filterStatus = signal('');
  readonly statusError = signal<string | null>(null);

  ngOnInit(): void {
    void this.service.loadOrders();
  }

  onFilterChange(rawStatus: '' | TaxiOrderStatus): void {
    this.filterStatus.set(rawStatus);
    void this.service.loadOrders(rawStatus || undefined);
  }

  async onStatusChange(order: TaxiOrderDto, rawStatus: string): Promise<void> {
    const status = rawStatus as TaxiOrderStatus;
    this.statusError.set(null);
    try {
      await this.service.updateOrderStatus(order.id, { status });
    } catch (error) {
      this.statusError.set(
        error instanceof Error ? error.message : String(error),
      );
      // Restore the row: clone it so [ngModel] re-binds the select to the
      // status actually stored on the server.
      this.service.orders.update((list) =>
        list.map((item) => (item.id === order.id ? { ...item } : item)),
      );
    }
  }

  /** `Откуда → Куда` from the confirmation-time snapshots. */
  routeLabel(order: TaxiOrderDto): string {
    if (!order.fromCityName && !order.toCityName) {
      return '—';
    }
    return `${order.fromCityName ?? '?'} → ${order.toCityName ?? '?'}`;
  }

  /** Comma-joined snapshot names of the selected extra services. */
  servicesLabel(order: TaxiOrderDto): string {
    return order.services.map((service) => service.name).join(', ') || '—';
  }

  /** Human-readable assigned car: model (plate), driver — or a dash. */
  carLabel(order: TaxiOrderDto): string {
    const car = order.carSnapshot;
    if (!car) {
      return '—';
    }
    return `${car.model} (${car.plate}), ${car.driverName}`;
  }
}
