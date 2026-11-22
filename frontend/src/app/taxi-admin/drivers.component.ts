import { CommonModule } from '@angular/common';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { TaxiCarDto, TaxiDriverDto } from './taxi.service';
import { TaxiService } from './taxi.service';

/** Styles shared verbatim by the taxi admin pages (see services.component). */
const pageStyles = [
  `
    .page-header {
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

    .driver-card {
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 1rem;
      margin-bottom: 1.5rem;
    }

    .driver-card h2 {
      margin: 0 0 0.25rem;
      font-size: 1.125rem;
    }

    .driver-meta {
      color: #64748b;
      font-size: 0.875rem;
      margin: 0 0 0.75rem;
    }

    .feature-list {
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
      font-size: 0.875rem;
    }

    .feature-list label {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }
  `,
];

/**
 * Admin page of taxi drivers with their nested cars (design D8): driver
 * cards each carrying a car table, an inline add-car form (seats + car-
 * feature checkboxes) and deletion with confirmation. Car-feature services
 * come from the services dictionary (`isCarFeature`), matching design D11.
 */
@Component({
  selector: 'app-taxi-drivers',
  standalone: true,
  imports: [CommonModule, FormsModule],
  styles: pageStyles,
  template: `
    <header class="page-header">
      <h1>Водители</h1>
      <p class="hint">
        Машины с вместимостью и возможностями-услугами участвуют в
        автоматическом назначении при подтверждении заказа.
      </p>
    </header>

    @if (service.driversError()) {
      <p class="list-error">{{ service.driversError() }}</p>
    }

    @for (driver of service.drivers(); track driver.id) {
      <section class="driver-card">
        <h2>{{ driver.fullName }}</h2>
        <p class="driver-meta">
          {{ driver.phone }} · {{ driver.isActive ? 'активен' : 'скрыт' }} ·
          машин: {{ driver.cars.length }}
        </p>

        <table class="entity-table">
          <thead>
            <tr>
              <th>Модель</th>
              <th>Госномер</th>
              <th>Цвет</th>
              <th>Мест</th>
              <th>Возможности</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            @for (car of driver.cars; track car.id) {
              <tr>
                <td>{{ car.model }}</td>
                <td class="mono">{{ car.plate }}</td>
                <td>{{ car.color || '—' }}</td>
                <td>{{ car.seats }}</td>
                <td>{{ carFeaturesLabel(car) }}</td>
                <td class="row-actions">
                  <button
                    type="button"
                    class="link danger"
                    (click)="onCarDelete(driver, car)"
                  >
                    Удалить
                  </button>
                </td>
              </tr>
            }
          </tbody>
        </table>
        @if (driver.cars.length === 0) {
          <p class="empty">Машин нет — добавьте первую.</p>
        }

        <button type="button" class="link" (click)="openCarForm(driver.id)">
          + Добавить машину
        </button>

        @if (carFormDriverId() === driver.id) {
          <form class="entity-form" (ngSubmit)="onCarSubmit()">
            <h3>Новая машина</h3>

            <label>
              Модель <span class="req">*</span>
              <input
                type="text"
                name="model"
                [ngModel]="carModel()"
                (ngModelChange)="carModel.set($event)"
              />
              @if (carSubmitAttempted() && carModelError()) {
                <span class="field-error">{{ carModelError() }}</span>
              }
            </label>

            <label>
              Госномер <span class="req">*</span>
              <input
                type="text"
                name="plate"
                [ngModel]="carPlate()"
                (ngModelChange)="carPlate.set($event)"
              />
              @if (carSubmitAttempted() && carPlateError()) {
                <span class="field-error">{{ carPlateError() }}</span>
              }
            </label>

            <label>
              Цвет (необязательно)
              <input
                type="text"
                name="color"
                [ngModel]="carColor()"
                (ngModelChange)="carColor.set($event)"
              />
            </label>

            <label>
              Вместимость, мест <span class="req">*</span>
              <input
                type="text"
                inputmode="numeric"
                name="seats"
                [ngModel]="carSeats()"
                (ngModelChange)="carSeats.set($event)"
              />
              @if (carSubmitAttempted() && carSeatsError()) {
                <span class="field-error">{{ carSeatsError() }}</span>
              }
            </label>

            @if (carFeatures().length > 0) {
              <div class="feature-list">
                Возможности машины:
                @for (feature of carFeatures(); track feature.id) {
                  <label>
                    <input
                      type="checkbox"
                      [checked]="carFeatureIds().includes(feature.id)"
                      (change)="toggleCarFeature(feature.id)"
                    />
                    {{ feature.name }}
                  </label>
                }
              </div>
            } @else {
              <p class="empty">
                Нет услуг-возможностей — создайте их в разделе «Услуги».
              </p>
            }

            @if (carFormError()) {
              <p class="form-error">{{ carFormError() }}</p>
            }

            <div class="form-actions">
              <button type="submit" [disabled]="carSubmitting()">
                Добавить
              </button>
              <button type="button" class="link" (click)="closeCarForm()">
                Отменить
              </button>
            </div>
          </form>
        }
      </section>
    }
    @if (
      service.drivers().length === 0 &&
      !service.driversLoading() &&
      !service.driversError()
    ) {
      <p class="empty">Водители не заведены — добавьте первого.</p>
    }
    @if (driverDeleteError()) {
      <p class="form-error">{{ driverDeleteError() }}</p>
    }
    @if (carDeleteError()) {
      <p class="form-error">{{ carDeleteError() }}</p>
    }

    <form class="entity-form" (ngSubmit)="onDriverSubmit()">
      <h3>
        {{ editingDriverId() ? 'Редактировать водителя' : 'Новый водитель' }}
      </h3>

      <label>
        ФИО <span class="req">*</span>
        <input
          type="text"
          name="fullName"
          [ngModel]="formFullName()"
          (ngModelChange)="formFullName.set($event)"
        />
        @if (driverSubmitAttempted() && driverNameError()) {
          <span class="field-error">{{ driverNameError() }}</span>
        }
      </label>

      <label>
        Телефон <span class="req">*</span>
        <input
          type="text"
          name="phone"
          [ngModel]="formPhone()"
          (ngModelChange)="formPhone.set($event)"
        />
        @if (driverSubmitAttempted() && driverPhoneError()) {
          <span class="field-error">{{ driverPhoneError() }}</span>
        }
      </label>

      <label class="inline">
        <input
          type="checkbox"
          name="isActive"
          [ngModel]="formActive()"
          (ngModelChange)="formActive.set($event)"
        />
        Активен (доступен для заказов)
      </label>

      @if (driverFormError()) {
        <p class="form-error">{{ driverFormError() }}</p>
      }

      <div class="form-actions">
        <button type="submit" [disabled]="driverSubmitting()">
          {{ editingDriverId() ? 'Сохранить' : 'Добавить' }}
        </button>
        @if (editingDriverId()) {
          <button type="button" class="link" (click)="resetDriverForm()">
            Отменить правку
          </button>
        }
      </div>
    </form>
  `,
})
export class TaxiDriversComponent implements OnInit {
  readonly service = inject(TaxiService);

  /* ----------------------------- driver form ------------------------------ */

  readonly formFullName = signal('');
  readonly formPhone = signal('');
  readonly formActive = signal(true);
  readonly editingDriverId = signal<string | null>(null);
  readonly driverSubmitAttempted = signal(false);
  readonly driverSubmitting = signal(false);
  readonly driverFormError = signal<string | null>(null);
  readonly driverDeleteError = signal<string | null>(null);

  readonly driverNameError = computed(() =>
    this.formFullName().trim() ? null : 'Введите ФИО',
  );
  readonly driverPhoneError = computed(() =>
    this.formPhone().trim() ? null : 'Введите телефон',
  );
  readonly driverFormValid = computed(
    () => !this.driverNameError() && !this.driverPhoneError(),
  );

  /* ------------------------------ car form -------------------------------- */

  readonly carFormDriverId = signal<string | null>(null);
  readonly carModel = signal('');
  readonly carPlate = signal('');
  readonly carColor = signal('');
  readonly carSeats = signal('');
  readonly carFeatureIds = signal<string[]>([]);
  readonly carSubmitAttempted = signal(false);
  readonly carSubmitting = signal(false);
  readonly carFormError = signal<string | null>(null);
  readonly carDeleteError = signal<string | null>(null);

  /** Only the car-feature services make sense as car equipment checkboxes. */
  readonly carFeatures = computed(() =>
    this.service.services().filter((service) => service.isCarFeature),
  );

  readonly carModelError = computed(() =>
    this.carModel().trim() ? null : 'Введите модель',
  );
  readonly carPlateError = computed(() =>
    this.carPlate().trim() ? null : 'Введите госномер',
  );
  readonly carSeatsError = computed(() => {
    const value = this.carSeats().trim();
    if (!value) {
      return 'Введите вместимость';
    }
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < 1) {
      return 'Вместимость — целое число ≥ 1';
    }
    return null;
  });
  readonly carFormValid = computed(
    () =>
      !this.carModelError() && !this.carPlateError() && !this.carSeatsError(),
  );

  ngOnInit(): void {
    void this.service.loadDrivers();
    // Feature checkboxes need the services dictionary.
    void this.service.loadServices();
  }

  /* ----------------------------- driver CRUD ------------------------------ */

  onDriverSubmit(): void {
    this.driverSubmitAttempted.set(true);
    this.driverFormError.set(null);
    if (!this.driverFormValid() || this.driverSubmitting()) {
      return;
    }

    const body = {
      fullName: this.formFullName().trim(),
      phone: this.formPhone().trim(),
      isActive: this.formActive(),
    };
    const id = this.editingDriverId();

    this.driverSubmitting.set(true);
    const operation = id
      ? this.service.updateDriver(id, body)
      : this.service.createDriver(body);
    operation
      .then(() => this.resetDriverForm())
      .catch((error: unknown) => {
        this.driverFormError.set(
          error instanceof Error ? error.message : String(error),
        );
      })
      .finally(() => this.driverSubmitting.set(false));
  }

  onDriverEdit(driver: TaxiDriverDto): void {
    this.editingDriverId.set(driver.id);
    this.formFullName.set(driver.fullName);
    this.formPhone.set(driver.phone);
    this.formActive.set(driver.isActive);
    this.driverFormError.set(null);
    this.driverDeleteError.set(null);
    this.driverSubmitAttempted.set(false);
  }

  resetDriverForm(): void {
    this.editingDriverId.set(null);
    this.formFullName.set('');
    this.formPhone.set('');
    this.formActive.set(true);
    this.driverFormError.set(null);
    this.driverSubmitAttempted.set(false);
  }

  onDriverDelete(driver: TaxiDriverDto): void {
    if (
      !window.confirm(
        `Удалить водителя «${driver.fullName}»? Его машины удалятся вместе с ним.`,
      )
    ) {
      return;
    }
    this.driverDeleteError.set(null);
    this.service.removeDriver(driver.id).catch((error: unknown) => {
      this.driverDeleteError.set(
        error instanceof Error ? error.message : String(error),
      );
    });
    if (this.editingDriverId() === driver.id) {
      this.resetDriverForm();
    }
  }

  /* ------------------------------- car CRUD ------------------------------- */

  openCarForm(driverId: string): void {
    this.carFormDriverId.set(driverId);
    this.carModel.set('');
    this.carPlate.set('');
    this.carColor.set('');
    this.carSeats.set('');
    this.carFeatureIds.set([]);
    this.carFormError.set(null);
    this.carSubmitAttempted.set(false);
  }

  closeCarForm(): void {
    this.carFormDriverId.set(null);
  }

  toggleCarFeature(serviceId: string): void {
    this.carFeatureIds.update((ids) =>
      ids.includes(serviceId)
        ? ids.filter((id) => id !== serviceId)
        : [...ids, serviceId],
    );
  }

  onCarSubmit(): void {
    this.carSubmitAttempted.set(true);
    this.carFormError.set(null);
    const driverId = this.carFormDriverId();
    if (!driverId || !this.carFormValid() || this.carSubmitting()) {
      return;
    }

    const body: {
      model: string;
      plate: string;
      seats: number;
      featureServiceIds: string[];
      color?: string;
    } = {
      model: this.carModel().trim(),
      plate: this.carPlate().trim(),
      seats: Number(this.carSeats().trim()),
      featureServiceIds: [...this.carFeatureIds()],
    };
    const color = this.carColor().trim();
    if (color) {
      body.color = color;
    }

    this.carSubmitting.set(true);
    this.service
      .createCar(driverId, body)
      .then(() => this.closeCarForm())
      .catch((error: unknown) => {
        this.carFormError.set(
          error instanceof Error ? error.message : String(error),
        );
      })
      .finally(() => this.carSubmitting.set(false));
  }

  onCarDelete(driver: TaxiDriverDto, car: { id: string; plate: string }): void {
    if (!window.confirm(`Удалить машину «${car.plate}»?`)) {
      return;
    }
    this.carDeleteError.set(null);
    this.service.removeCar(driver.id, car.id).catch((error: unknown) => {
      this.carDeleteError.set(
        error instanceof Error ? error.message : String(error),
      );
    });
  }

  /** Comma-joined feature names of a car or a dash (arrow functions are not allowed in templates). */
  carFeaturesLabel(car: TaxiCarDto): string {
    return car.features.map((feature) => feature.name).join(', ') || '—';
  }
}
