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

import { CommonModule } from '@angular/common';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { TaxiPassengerOptionDto } from './taxi.service';
import { TaxiService } from './taxi.service';

/**
 * Admin CRUD of passenger-count options (design D8): table + signal-driven
 * form (create/edit) + deletion with confirmation.
 */
@Component({
  selector: 'app-taxi-passenger-options',
  standalone: true,
  imports: [CommonModule, FormsModule],
  styles: pageStyles,
  template: `
    <header class="page-header">
      <h1>Кол-во человек</h1>
      <p class="hint">
        Варианты количества пассажиров, из которых выбирает визард; по
        максимальному значению подбирается вместимость машины.
      </p>
    </header>

    @if (service.passengerOptionsError()) {
      <p class="list-error">{{ service.passengerOptionsError() }}</p>
    }

    <table class="entity-table">
      <thead>
        <tr>
          <th>Пассажиров</th>
          <th>Активен</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        @for (option of service.passengerOptions(); track option.id) {
          <tr>
            <td class="mono">{{ option.count }}</td>
            <td>{{ option.isActive ? '✓' : '—' }}</td>
            <td class="row-actions">
              <button type="button" class="link" (click)="onEdit(option)">
                Редактировать
              </button>
              <button
                type="button"
                class="link danger"
                (click)="onDelete(option)"
              >
                Удалить
              </button>
            </td>
          </tr>
        }
      </tbody>
    </table>
    @if (
      service.passengerOptions().length === 0 &&
      !service.passengerOptionsLoading() &&
      !service.passengerOptionsError()
    ) {
      <p class="empty">Справочник пуст — добавьте первый вариант.</p>
    }
    @if (deleteError()) {
      <p class="form-error">{{ deleteError() }}</p>
    }

    <form class="entity-form" (ngSubmit)="onSubmit()">
      <h3>{{ editingId() ? 'Редактировать вариант' : 'Новый вариант' }}</h3>

      <label>
        Количество пассажиров <span class="req">*</span>
        <input
          type="text"
          inputmode="numeric"
          name="count"
          [ngModel]="formCount()"
          (ngModelChange)="formCount.set($event)"
        />
        @if (submitAttempted() && countError()) {
          <span class="field-error">{{ countError() }}</span>
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
})
export class TaxiPassengerOptionsComponent implements OnInit {
  readonly service = inject(TaxiService);

  readonly formCount = signal('');
  readonly formActive = signal(true);
  readonly editingId = signal<string | null>(null);
  readonly submitAttempted = signal(false);
  readonly submitting = signal(false);
  readonly formError = signal<string | null>(null);
  readonly deleteError = signal<string | null>(null);

  readonly countError = computed(() => {
    const value = this.formCount().trim();
    if (!value) {
      return 'Введите количество';
    }
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < 1) {
      return 'Количество — целое число ≥ 1';
    }
    return null;
  });

  readonly formValid = computed(() => !this.countError());

  ngOnInit(): void {
    void this.service.loadPassengerOptions();
  }

  onSubmit(): void {
    this.submitAttempted.set(true);
    this.formError.set(null);
    if (!this.formValid() || this.submitting()) {
      return;
    }

    const body = {
      count: Number(this.formCount().trim()),
      isActive: this.formActive(),
    };
    const id = this.editingId();

    this.submitting.set(true);
    const operation = id
      ? this.service.updatePassengerOption(id, body)
      : this.service.createPassengerOption(body);
    operation
      .then(() => this.resetForm())
      .catch((error: unknown) => {
        this.formError.set(
          error instanceof Error ? error.message : String(error),
        );
      })
      .finally(() => this.submitting.set(false));
  }

  onEdit(option: TaxiPassengerOptionDto): void {
    this.editingId.set(option.id);
    this.formCount.set(String(option.count));
    this.formActive.set(option.isActive);
    this.formError.set(null);
    this.deleteError.set(null);
    this.submitAttempted.set(false);
  }

  resetForm(): void {
    this.editingId.set(null);
    this.formCount.set('');
    this.formActive.set(true);
    this.formError.set(null);
    this.submitAttempted.set(false);
  }

  onDelete(option: TaxiPassengerOptionDto): void {
    if (!window.confirm(`Удалить вариант «${option.count} чел.»?`)) {
      return;
    }
    this.deleteError.set(null);
    this.service.removePassengerOption(option.id).catch((error: unknown) => {
      this.deleteError.set(
        error instanceof Error ? error.message : String(error),
      );
    });
    if (this.editingId() === option.id) {
      this.resetForm();
    }
  }
}
