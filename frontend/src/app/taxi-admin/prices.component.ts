import { CommonModule } from '@angular/common';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { TaxiPriceMatrixCityDto } from './taxi.service';
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
 * Admin view of the taxi price matrix (design D5/D6): the auto-calc card
 * (price of the trip between the extreme cities, the rest of the pairs are
 * derived proportionally) plus the pairs table with per-row price editing.
 * Prices are stored per unordered pair and are symmetric by construction.
 */
@Component({
  selector: 'app-taxi-prices',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <header class="page-header">
      <h1>Матрица цен</h1>
      <p class="hint">
        Цена хранится для каждой пары городов (направления симметричны). Укажите
        цену поездки между крайними пунктами — остальные пары рассчитаются
        пропорционально расстоянию.
      </p>
    </header>

    @if (service.matrixError()) {
      <p class="list-error">{{ service.matrixError() }}</p>
    }
    @if (service.matrixLoading()) {
      <p class="empty">Загрузка…</p>
    }

    @if (service.matrix(); as matrix) {
      <form class="entity-form" (ngSubmit)="onAutoCalcSubmit()">
        <h3>Рассчитать автоматически</h3>
        <label>
          Цена поездки между крайними пунктами, ₽ <span class="req">*</span>
          <input
            type="text"
            inputmode="numeric"
            name="autoPrice"
            [ngModel]="autoPrice()"
            (ngModelChange)="autoPrice.set($event)"
          />
          @if (autoCalcAttempted() && autoPriceError()) {
            <span class="field-error">{{ autoPriceError() }}</span>
          }
        </label>
        <div class="form-actions">
          <button type="submit" [disabled]="autoCalcRunning()">
            {{ autoCalcRunning() ? 'Расчёт…' : 'Рассчитать автоматически' }}
          </button>
          @if (autoCalcInfo()) {
            <span class="hint">{{ autoCalcInfo() }}</span>
          }
        </div>
        @if (autoCalcError()) {
          <p class="form-error">{{ autoCalcError() }}</p>
        }
      </form>

      <table class="entity-table">
        <thead>
          <tr>
            <th>Направление</th>
            <th>Расстояние</th>
            <th>Цена, ₽</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          @for (
            pair of matrix.prices;
            track pair.fromCityId + '->' + pair.toCityId
          ) {
            @if (cityById()[pair.fromCityId]; as from) {
              @if (cityById()[pair.toCityId]; as to) {
                <tr>
                  <td>{{ from.name }} → {{ to.name }}</td>
                  <td>{{ pairDistance(from, to) }}</td>
                  <td class="mono">
                    @if (
                      editingPairKey() ===
                      pairKey(pair.fromCityId, pair.toCityId)
                    ) {
                      <input
                        type="text"
                        inputmode="numeric"
                        name="pairPrice"
                        [ngModel]="pairPriceInput()"
                        (ngModelChange)="pairPriceInput.set($event)"
                      />
                    } @else {
                      {{ pair.price }}
                    }
                  </td>
                  <td>
                    <div class="row-actions">
                      @if (
                        editingPairKey() ===
                        pairKey(pair.fromCityId, pair.toCityId)
                      ) {
                        <button
                          class="link"
                          (click)="savePair(pair.fromCityId, pair.toCityId)"
                        >
                          Сохранить
                        </button>
                        <button class="link" (click)="cancelPairEdit()">
                          Отмена
                        </button>
                      } @else {
                        <button
                          class="link"
                          (click)="
                            startPairEdit(
                              pair.fromCityId,
                              pair.toCityId,
                              pair.price
                            )
                          "
                        >
                          Изменить
                        </button>
                      }
                    </div>
                  </td>
                </tr>
              }
            }
          } @empty {
            <tr>
              <td colspan="4" class="empty">
                Добавьте города — пары появятся автоматически.
              </td>
            </tr>
          }
        </tbody>
      </table>
      @if (pairError()) {
        <p class="form-error">{{ pairError() }}</p>
      }
    } @else if (!service.matrixLoading() && !service.matrixError()) {
      <p class="empty">Добавьте города — матрица цен появится автоматически.</p>
    }
  `,
  styles: pageStyles,
})
export class TaxiPricesComponent implements OnInit {
  readonly service = inject(TaxiService);

  /* Auto-calc form state. */
  readonly autoPrice = signal('');
  readonly autoCalcAttempted = signal(false);
  readonly autoCalcRunning = signal(false);
  readonly autoCalcInfo = signal<string | null>(null);
  readonly autoCalcError = signal<string | null>(null);

  /* Per-row price editing state (one pair is edited at a time). */
  readonly editingPairKey = signal<string | null>(null);
  readonly pairPriceInput = signal('');
  readonly pairSaving = signal(false);
  readonly pairError = signal<string | null>(null);

  /** City lookup by id for pair row labels (Record — bracket access works in templates, unlike Map). */
  readonly cityById = computed(() => {
    const cities: Record<string, TaxiPriceMatrixCityDto> = {};
    for (const city of this.service.matrix()?.cities ?? []) {
      cities[city.id] = city;
    }
    return cities;
  });

  readonly autoPriceError = computed(() =>
    /^\d+$/.test(this.autoPrice().trim()) ? null : 'Цена — целое число ≥ 0',
  );

  readonly pairPriceError = computed(() =>
    /^\d+$/.test(this.pairPriceInput().trim())
      ? null
      : 'Цена — целое число ≥ 0',
  );

  ngOnInit(): void {
    void this.service.loadMatrix();
  }

  /** Composite key of an unordered pair row. */
  pairKey(fromCityId: string, toCityId: string): string {
    return `${fromCityId}->${toCityId}`;
  }

  /** Distance between the pair's cities along the route, in km. */
  pairDistance(
    from: TaxiPriceMatrixCityDto,
    to: TaxiPriceMatrixCityDto,
  ): string {
    return `${Math.abs(to.distanceKm - from.distanceKm)} км`;
  }

  async onAutoCalcSubmit(): Promise<void> {
    this.autoCalcAttempted.set(true);
    if (this.autoPriceError()) {
      return;
    }
    this.autoCalcRunning.set(true);
    this.autoCalcError.set(null);
    this.autoCalcInfo.set(null);
    try {
      const result = await this.service.autoCalc(
        Number(this.autoPrice().trim()),
      );
      this.autoCalcInfo.set(`Пересчитано пар: ${result.pairs}`);
    } catch (error) {
      this.autoCalcError.set(
        error instanceof Error ? error.message : String(error),
      );
    } finally {
      this.autoCalcRunning.set(false);
    }
  }

  startPairEdit(fromCityId: string, toCityId: string, price: number): void {
    this.editingPairKey.set(this.pairKey(fromCityId, toCityId));
    this.pairPriceInput.set(String(price));
    this.pairError.set(null);
  }

  cancelPairEdit(): void {
    this.editingPairKey.set(null);
    this.pairPriceInput.set('');
    this.pairError.set(null);
  }

  async savePair(fromCityId: string, toCityId: string): Promise<void> {
    if (this.pairPriceError()) {
      this.pairError.set(this.pairPriceError());
      return;
    }
    this.pairSaving.set(true);
    this.pairError.set(null);
    try {
      await this.service.setPairPrice(
        fromCityId,
        toCityId,
        Number(this.pairPriceInput().trim()),
      );
      this.cancelPairEdit();
    } catch (error) {
      this.pairError.set(
        error instanceof Error ? error.message : String(error),
      );
    } finally {
      this.pairSaving.set(false);
    }
  }
}
