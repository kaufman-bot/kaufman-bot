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
import type { TaxiDepartureSlotDto } from './taxi.service';
import { TaxiService } from './taxi.service';

/** Same `HH:MM` rule the backend enforces for departure slots. */
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * Admin CRUD of daily departure slots (design D8): table + signal-driven
 * form (create/edit) + deletion with confirmation.
 */
@Component({
  selector: 'app-taxi-departure-slots',
  standalone: true,
  imports: [CommonModule, FormsModule],
  styles: pageStyles,
  template: `
    <header class="page-header">
      <h1>Слоты выезда</h1>
      <p class="hint">
        Ежедневные времена выезда в формате ЧЧ:ММ (календарные даты не
        поддерживаются).
      </p>
    </header>

    @if (service.slotsError()) {
      <p class="list-error">{{ service.slotsError() }}</p>
    }

    <table class="entity-table">
      <thead>
        <tr>
          <th>Время</th>
          <th>Активен</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        @for (slot of service.slots(); track slot.id) {
          <tr>
            <td class="mono">{{ slot.time }}</td>
            <td>{{ slot.isActive ? '✓' : '—' }}</td>
            <td class="row-actions">
              <button type="button" class="link" (click)="onEdit(slot)">
                Редактировать
              </button>
              <button
                type="button"
                class="link danger"
                (click)="onDelete(slot)"
              >
                Удалить
              </button>
            </td>
          </tr>
        }
      </tbody>
    </table>
    @if (
      service.slots().length === 0 &&
      !service.slotsLoading() &&
      !service.slotsError()
    ) {
      <p class="empty">Справочник пуст — добавьте первый слот.</p>
    }
    @if (deleteError()) {
      <p class="form-error">{{ deleteError() }}</p>
    }

    <form class="entity-form" (ngSubmit)="onSubmit()">
      <h3>{{ editingId() ? 'Редактировать слот' : 'Новый слот' }}</h3>

      <label>
        Время (ЧЧ:ММ) <span class="req">*</span>
        <input
          type="text"
          name="time"
          placeholder="08:00"
          [ngModel]="formTime()"
          (ngModelChange)="formTime.set($event)"
        />
        @if (submitAttempted() && timeError()) {
          <span class="field-error">{{ timeError() }}</span>
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
export class TaxiDepartureSlotsComponent implements OnInit {
  readonly service = inject(TaxiService);

  readonly formTime = signal('');
  readonly formActive = signal(true);
  readonly editingId = signal<string | null>(null);
  readonly submitAttempted = signal(false);
  readonly submitting = signal(false);
  readonly formError = signal<string | null>(null);
  readonly deleteError = signal<string | null>(null);

  readonly timeError = computed(() => {
    const value = this.formTime().trim();
    if (!value) {
      return 'Введите время';
    }
    return TIME_PATTERN.test(value) ? null : 'Время — в формате ЧЧ:ММ';
  });

  readonly formValid = computed(() => !this.timeError());

  ngOnInit(): void {
    void this.service.loadSlots();
  }

  onSubmit(): void {
    this.submitAttempted.set(true);
    this.formError.set(null);
    if (!this.formValid() || this.submitting()) {
      return;
    }

    const body = {
      time: this.formTime().trim(),
      isActive: this.formActive(),
    };
    const id = this.editingId();

    this.submitting.set(true);
    const operation = id
      ? this.service.updateSlot(id, body)
      : this.service.createSlot(body);
    operation
      .then(() => this.resetForm())
      .catch((error: unknown) => {
        this.formError.set(
          error instanceof Error ? error.message : String(error),
        );
      })
      .finally(() => this.submitting.set(false));
  }

  onEdit(slot: TaxiDepartureSlotDto): void {
    this.editingId.set(slot.id);
    this.formTime.set(slot.time);
    this.formActive.set(slot.isActive);
    this.formError.set(null);
    this.deleteError.set(null);
    this.submitAttempted.set(false);
  }

  resetForm(): void {
    this.editingId.set(null);
    this.formTime.set('');
    this.formActive.set(true);
    this.formError.set(null);
    this.submitAttempted.set(false);
  }

  onDelete(slot: TaxiDepartureSlotDto): void {
    if (!window.confirm(`Удалить слот «${slot.time}»?`)) {
      return;
    }
    this.deleteError.set(null);
    this.service.removeSlot(slot.id).catch((error: unknown) => {
      this.deleteError.set(
        error instanceof Error ? error.message : String(error),
      );
    });
    if (this.editingId() === slot.id) {
      this.resetForm();
    }
  }
}
