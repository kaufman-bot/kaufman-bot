import { CommonModule } from '@angular/common';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { TaxiExtraServiceDto } from './taxi.service';
import { TaxiService } from './taxi.service';

/** Styles shared verbatim by the four dictionary pages of the section. */
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
  `,
];

/**
 * Admin CRUD of taxi extra services (design D8): table + signal-driven form
 * (create/edit) + deletion with confirmation. `isCarFeature` marks the
 * services that act as car equipment for the auto-assignment.
 */
@Component({
  selector: 'app-taxi-services',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <header class="page-header">
      <h1>Услуги</h1>
      <p class="hint">
        «Возможность машины» — услуга требует оснащения (детское кресло и т.п.)
        и участвует в автоподборе машины; остальные просто добавляются к цене.
      </p>
    </header>

    @if (service.servicesError()) {
      <p class="list-error">{{ service.servicesError() }}</p>
    }

    <table class="entity-table">
      <thead>
        <tr>
          <th>Услуга</th>
          <th>Наценка, ₽</th>
          <th>Возможность машины</th>
          <th>Активна</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        @for (item of service.services(); track item.id) {
          <tr>
            <td>{{ item.name }}</td>
            <td class="mono">{{ item.surcharge }}</td>
            <td>{{ item.isCarFeature ? '✓' : '—' }}</td>
            <td>{{ item.isActive ? '✓' : '—' }}</td>
            <td class="row-actions">
              <button type="button" class="link" (click)="onEdit(item)">
                Редактировать
              </button>
              <button
                type="button"
                class="link danger"
                (click)="onDelete(item)"
              >
                Удалить
              </button>
            </td>
          </tr>
        }
      </tbody>
    </table>
    @if (
      service.services().length === 0 &&
      !service.servicesLoading() &&
      !service.servicesError()
    ) {
      <p class="empty">Справочник пуст — добавьте первую услугу.</p>
    }
    @if (deleteError()) {
      <p class="form-error">{{ deleteError() }}</p>
    }

    <form class="entity-form" (ngSubmit)="onSubmit()">
      <h3>{{ editingId() ? 'Редактировать услугу' : 'Новая услуга' }}</h3>

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
        Наценка, ₽ <span class="req">*</span>
        <input
          type="text"
          inputmode="numeric"
          name="surcharge"
          [ngModel]="formSurcharge()"
          (ngModelChange)="formSurcharge.set($event)"
        />
        @if (submitAttempted() && surchargeError()) {
          <span class="field-error">{{ surchargeError() }}</span>
        }
      </label>

      <label class="inline">
        <input
          type="checkbox"
          name="isCarFeature"
          [ngModel]="formCarFeature()"
          (ngModelChange)="formCarFeature.set($event)"
        />
        Возможность машины (влияет на автоподбор)
      </label>

      <label class="inline">
        <input
          type="checkbox"
          name="isActive"
          [ngModel]="formActive()"
          (ngModelChange)="formActive.set($event)"
        />
        Активна (видна в визарде)
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
  styles: pageStyles,
})
export class TaxiServicesComponent implements OnInit {
  readonly service = inject(TaxiService);

  readonly formName = signal('');
  readonly formSurcharge = signal('');
  readonly formCarFeature = signal(false);
  readonly formActive = signal(true);
  readonly editingId = signal<string | null>(null);
  readonly submitAttempted = signal(false);
  readonly submitting = signal(false);
  readonly formError = signal<string | null>(null);
  readonly deleteError = signal<string | null>(null);

  readonly nameError = computed(() =>
    this.formName().trim() ? null : 'Введите название услуги',
  );

  readonly surchargeError = computed(() => {
    const value = this.formSurcharge().trim();
    if (!value) {
      return 'Введите наценку';
    }
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < 0) {
      return 'Наценка — целое число ≥ 0';
    }
    return null;
  });

  readonly formValid = computed(
    () => !this.nameError() && !this.surchargeError(),
  );

  ngOnInit(): void {
    void this.service.loadServices();
  }

  onSubmit(): void {
    this.submitAttempted.set(true);
    this.formError.set(null);
    if (!this.formValid() || this.submitting()) {
      return;
    }

    const body = {
      name: this.formName().trim(),
      surcharge: Number(this.formSurcharge().trim()),
      isCarFeature: this.formCarFeature(),
      isActive: this.formActive(),
    };
    const id = this.editingId();

    this.submitting.set(true);
    const operation = id
      ? this.service.updateService(id, body)
      : this.service.createService(body);
    operation
      .then(() => this.resetForm())
      .catch((error: unknown) => {
        this.formError.set(
          error instanceof Error ? error.message : String(error),
        );
      })
      .finally(() => this.submitting.set(false));
  }

  onEdit(item: TaxiExtraServiceDto): void {
    this.editingId.set(item.id);
    this.formName.set(item.name);
    this.formSurcharge.set(String(item.surcharge));
    this.formCarFeature.set(item.isCarFeature);
    this.formActive.set(item.isActive);
    this.formError.set(null);
    this.deleteError.set(null);
    this.submitAttempted.set(false);
  }

  resetForm(): void {
    this.editingId.set(null);
    this.formName.set('');
    this.formSurcharge.set('');
    this.formCarFeature.set(false);
    this.formActive.set(true);
    this.formError.set(null);
    this.submitAttempted.set(false);
  }

  onDelete(item: TaxiExtraServiceDto): void {
    if (!window.confirm(`Удалить услугу «${item.name}»?`)) {
      return;
    }
    this.deleteError.set(null);
    this.service.removeService(item.id).catch((error: unknown) => {
      this.deleteError.set(
        error instanceof Error ? error.message : String(error),
      );
    });
    if (this.editingId() === item.id) {
      this.resetForm();
    }
  }
}
