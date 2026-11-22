import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TaxiPricesComponent } from './prices.component';
import { TaxiService } from './taxi.service';

const seededMatrix = {
  cities: [
    { id: 'c1', name: 'Москва', distanceKm: 0 },
    { id: 'c2', name: 'Клин', distanceKm: 85 },
    { id: 'c3', name: 'Тверь', distanceKm: 167 },
  ],
  prices: [
    { fromCityId: 'c1', toCityId: 'c2', price: 2500 },
    { fromCityId: 'c1', toCityId: 'c3', price: 4900 },
    { fromCityId: 'c2', toCityId: 'c3', price: 2400 },
  ],
};

const makeServiceMock = () => ({
  matrix: () => seededMatrix,
  matrixLoading: () => false,
  matrixError: () => null,
  loadMatrix: jest.fn().mockResolvedValue(undefined),
  autoCalc: jest.fn().mockResolvedValue({ pairs: 3 }),
  setPairPrice: jest.fn().mockResolvedValue(undefined),
});

describe('TaxiPricesComponent', () => {
  let fixture: ComponentFixture<TaxiPricesComponent>;
  let serviceMock: ReturnType<typeof makeServiceMock>;

  beforeEach(async () => {
    serviceMock = makeServiceMock();
    await TestBed.configureTestingModule({
      imports: [TaxiPricesComponent],
      providers: [{ provide: TaxiService, useValue: serviceMock }],
    }).compileComponents();

    fixture = TestBed.createComponent(TaxiPricesComponent);
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

  it('renders the pair rows with city names and distances', () => {
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const rows = Array.from(
      compiled.querySelectorAll('.entity-table tbody tr'),
    ).map((row) => row.textContent ?? '');
    expect(rows).toHaveLength(3);
    expect(rows[0]).toContain('Москва → Клин');
    expect(rows[0]).toContain('85 км');
    expect(rows[0]).toContain('2500');
    expect(rows[1]).toContain('Москва → Тверь');
    expect(rows[1]).toContain('167 км');
    expect(rows[1]).toContain('4900');
    expect(serviceMock.loadMatrix).toHaveBeenCalled();
  });

  it('auto-calc submits the extreme-city price to the service', async () => {
    fixture.detectChanges();
    await whenStable();

    const compiled = fixture.nativeElement as HTMLElement;
    const priceInput = compiled.querySelector(
      'input[name="autoPrice"]',
    ) as HTMLInputElement;
    priceInput.value = '4900';
    priceInput.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    (
      compiled.querySelector('form.entity-form') as HTMLFormElement
    ).requestSubmit();
    await flushPromises();

    expect(serviceMock.autoCalc).toHaveBeenCalledWith(4900);
    const info = compiled.querySelector('.form-actions .hint');
    expect(info?.textContent).toContain('Пересчитано пар: 3');
  });

  it('rejects a non-numeric extreme-city price without calling the service', async () => {
    fixture.detectChanges();
    await whenStable();

    const compiled = fixture.nativeElement as HTMLElement;
    const priceInput = compiled.querySelector(
      'input[name="autoPrice"]',
    ) as HTMLInputElement;
    priceInput.value = '4900.50';
    priceInput.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    (
      compiled.querySelector('form.entity-form') as HTMLFormElement
    ).requestSubmit();
    await flushPromises();

    expect(serviceMock.autoCalc).not.toHaveBeenCalled();
    const error = compiled.querySelector('.field-error');
    expect(error?.textContent).toContain('Цена — целое число ≥ 0');
  });

  it('edits a pair price through the service', async () => {
    fixture.detectChanges();
    await whenStable();

    const compiled = fixture.nativeElement as HTMLElement;
    const editButton = Array.from(
      compiled.querySelectorAll<HTMLButtonElement>('.row-actions .link'),
    ).find((button) => button.textContent?.includes('Изменить'));
    editButton!.click();
    fixture.detectChanges();
    await whenStable();

    const priceInput = compiled.querySelector(
      'input[name="pairPrice"]',
    ) as HTMLInputElement;
    expect(priceInput.value).toBe('2500');
    priceInput.value = '2600';
    priceInput.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    const saveButton = Array.from(
      compiled.querySelectorAll<HTMLButtonElement>('.row-actions .link'),
    ).find((button) => button.textContent?.includes('Сохранить'));
    saveButton!.click();
    await flushPromises();

    expect(serviceMock.setPairPrice).toHaveBeenCalledWith('c1', 'c2', 2600);
  });
});
