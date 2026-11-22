import { CommonModule } from '@angular/common';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { TaxiCityDto } from './taxi.service';
import { TaxiService } from './taxi.service';

/**
 * Admin CRUD of taxi cities (design D8): table + signal-driven form
 * (create/edit) + deletion with confirmation. 400/409 API failures surface
 * as human-readable messages from `TaxiApiError`.
 */
@Component({
  selector: 'app-taxi-cities',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <header class="page-header">
      <h1>Города</h1>
      <p class="hint">
        Километраж — отметка вдоль маршрута от первого пункта; по ней строится
        матрица цен.
      </p>
    </header>

    @if (service.citiesError()) {
      <p class="list-error">{{ service.citiesError() }}</p>
    }

    <table class="entity-table">
      <thead>
        <tr>
          <th>Название</th>
          <th>Км от первой точки</th>
          <th>Активен</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        @for (city of service.cities(); track city.id) {
          <tr>
            <td>{{ city.name }}</td>
            <td class="mono">{{ city.distanceKm }}</td>
            <td>{{ city.isActive ? '✓' : '—' }}</td>
            <td class="row-actions">
              <button type="button" class="link" (click)="onEdit(city)">
                Редактировать
              </button>
              <button
                type="button"
                class="link danger"
                (click)="onDelete(city)"
              >
                Удалить
              </button>
            </td>
          </tr>
        }
      </tbody>
    </table>
    @if (
      service.cities().length === 0 &&
      !service.citiesLoading() &&
      !service.citiesError()
    ) {
      <p class="empty">Справочник пуст — добавьте первый город.</p>
    }
    @if (deleteError()) {
      <p class="form-error">{{ deleteError() }}</p>
    }

    <form class="entity-form" (ngSubmit)="onSubmit()">
      <h3>{{ editingId() ? 'Редактировать город' : 'Новый город' }}</h3>

      <label>
        Название <span class="req">*</span>
        <input
          type="text"
          name="name"
          [ngModel]="formName()"
          (ngModelChange)="formName.set($event)"
        />
      </label>

      <label>
        Километраж, км <span class="req">*</span>
        <input
          type="text"
          inputmode="numeric"
          name="distanceKm"
          [ngModel]="formDistance()"
          (ngModelChange)="formDistance.set($event)"
        />
        @if (submitAttempted() && distanceError()) {
          <span class="field-error">{{ distanceError() }}</span>
        }
      </label>

      <label class="inline">
        <input
          type="checkbox"
          name="isActive"
          [ngModel]="formActive()"
          (ngModelChange)="formActive.set($event)"
        />
        Активен (виден в визарде)
      </label>

      @if (submitAttempted() && nameError()) {
        <p class="field-error">{{ nameError() }}</p>
      }
      @if (formError()) {
        <p class="form-error">{{ formError() }}</p>
      }

      <div class="form-actions">
        <button type="submit" [disabled]="submitting()">
          {{ editingId() ? 'Сохранить' : 'Добавить' }}
        </button>
        @if (editingId()) {
          <button type="button" class="link" (click)="resetForm()">
            Отменить правку
          </button>
        }
      </div>
    </form>
  `,
  styles: [
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
    `,
  ],
})
export class TaxiCitiesComponent implements OnInit {
  readonly service = inject(TaxiService);

  readonly formName = signal('');
  readonly formDistance = signal('');
  readonly formActive = signal(true);
  readonly editingId = signal<string | null>(null);
  readonly submitAttempted = signal(false);
  readonly submitting = signal(false);
  readonly formError = signal<string | null>(null);
  readonly deleteError = signal<string | null>(null);

  readonly nameError = computed(() =>
    this.formName().trim() ? null : 'Введите название города',
  );

  readonly distanceError = computed(() => {
    const value = this.formDistance().trim();
    if (!value) {
      return 'Введите километраж';
    }
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < 0) {
      return 'Километраж — целое число ≥ 0';
    }
    return null;
  });

  readonly formValid = computed(
    () => !this.nameError() && !this.distanceError(),
  );

  ngOnInit(): void {
    void this.service.loadCities();
  }

  onSubmit(): void {
    this.submitAttempted.set(true);
    this.formError.set(null);
    if (!this.formValid() || this.submitting()) {
      return;
    }

    const body = {
      name: this.formName().trim(),
      distanceKm: Number(this.formDistance().trim()),
      isActive: this.formActive(),
    };
    const id = this.editingId();

    this.submitting.set(true);
    const operation = id
      ? this.service.updateCity(id, body)
      : this.service.createCity(body);
    operation
      .then(() => this.resetForm())
      .catch((error: unknown) => {
        this.formError.set(
          error instanceof Error ? error.message : String(error),
        );
      })
      .finally(() => this.submitting.set(false));
  }

  onEdit(city: TaxiCityDto): void {
    this.editingId.set(city.id);
    this.formName.set(city.name);
    this.formDistance.set(String(city.distanceKm));
    this.formActive.set(city.isActive);
    this.formError.set(null);
    this.deleteError.set(null);
    this.submitAttempted.set(false);
  }

  resetForm(): void {
    this.editingId.set(null);
    this.formName.set('');
    this.formDistance.set('');
    this.formActive.set(true);
    this.formError.set(null);
    this.submitAttempted.set(false);
  }

  onDelete(city: TaxiCityDto): void {
    if (
      !window.confirm(
        `Удалить город «${city.name}»? Цены пар с ним удалятся, ` +
          `черновики визарда сбросятся.`,
      )
    ) {
      return;
    }
    this.deleteError.set(null);
    this.service.removeCity(city.id).catch((error: unknown) => {
      this.deleteError.set(
        error instanceof Error ? error.message : String(error),
      );
    });
    if (this.editingId() === city.id) {
      this.resetForm();
    }
  }
}
