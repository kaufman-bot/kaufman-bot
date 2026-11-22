import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TaxiCitiesComponent } from './cities.component';
import { TaxiApiError, TaxiService } from './taxi.service';

const seededCities = [
  { id: 'c1', name: 'Москва', distanceKm: 0, isActive: true, sortOrder: 0 },
  { id: 'c2', name: 'Тверь', distanceKm: 167, isActive: true, sortOrder: 1 },
];

const makeServiceMock = () => ({
  cities: () => seededCities,
  citiesLoading: () => false,
  citiesError: () => null,
  loadCities: jest.fn().mockResolvedValue(undefined),
  createCity: jest.fn().mockResolvedValue(undefined),
  updateCity: jest.fn().mockResolvedValue(undefined),
  removeCity: jest.fn().mockResolvedValue(undefined),
});

describe('TaxiCitiesComponent', () => {
  let fixture: ComponentFixture<TaxiCitiesComponent>;
  let serviceMock: ReturnType<typeof makeServiceMock>;

  beforeEach(async () => {
    serviceMock = makeServiceMock();
    await TestBed.configureTestingModule({
      imports: [TaxiCitiesComponent],
      providers: [{ provide: TaxiService, useValue: serviceMock }],
    }).compileComponents();

    fixture = TestBed.createComponent(TaxiCitiesComponent);
  });

  /** Flushes pending microtasks (service promise chains) before asserting. */
  const flushPromises = async (): Promise<void> => {
    await new Promise((resolve) => setTimeout(resolve, 0));
    fixture.detectChanges();
  };

  const fillForm = async (name: string, distanceKm: string): Promise<void> => {
    // NgModel откладывает `control.setValue(bindingValue)` микротаской на каждое
    // изменение [ngModel]-биндинга (включая первый рендер). Пока она не
    // отработала, программный ввод затирается устаревшим значением модели —
    // перед заполнением формы ждём стабилизации зоны.
    await fixture.whenStable();

    const compiled = fixture.nativeElement as HTMLElement;
    const nameInput = compiled.querySelector(
      'input[name="name"]',
    ) as HTMLInputElement;
    nameInput.value = name;
    nameInput.dispatchEvent(new Event('input'));
    const distanceInput = compiled.querySelector(
      'input[name="distanceKm"]',
    ) as HTMLInputElement;
    distanceInput.value = distanceKm;
    distanceInput.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  };

  /** jsdom не сабмитит форму кликом по кнопке type=submit — сабмитим явно. */
  const submitForm = (): void => {
    const compiled = fixture.nativeElement as HTMLElement;
    (
      compiled.querySelector('form.entity-form') as HTMLFormElement
    ).requestSubmit();
  };

  it('renders the city rows from the service', () => {
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const rows = Array.from(
      compiled.querySelectorAll('.entity-table tbody tr'),
    ).map((row) => row.textContent ?? '');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toContain('Москва');
    expect(rows[0]).toContain('0');
    expect(rows[1]).toContain('Тверь');
    expect(rows[1]).toContain('167');
    expect(serviceMock.loadCities).toHaveBeenCalled();
  });

  it('adds a city through the service on submit', async () => {
    fixture.detectChanges();
    await fillForm('Клин', '85');

    submitForm();
    await flushPromises();

    expect(serviceMock.createCity).toHaveBeenCalledWith({
      name: 'Клин',
      distanceKm: 85,
      isActive: true,
    });
    // Reload after create — ответственность сервиса; mock его не эмулирует,
    // поэтому здесь ровно один вызов (начальная загрузка из ngOnInit).
    expect(serviceMock.loadCities).toHaveBeenCalledTimes(1);
  });

  it('shows the duplicate-city error returned by the API', async () => {
    serviceMock.createCity.mockRejectedValueOnce(
      new TaxiApiError('Город «Клин» уже существует'),
    );
    fixture.detectChanges();
    await fillForm('Клин', '85');

    submitForm();
    await flushPromises();

    const compiled = fixture.nativeElement as HTMLElement;
    const error = compiled.querySelector('.form-error');
    expect(error?.textContent).toContain('Город «Клин» уже существует');
  });

  it('deletes a city only after confirmation', async () => {
    const confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(false);
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const deleteButton = compiled.querySelector(
      '.link.danger',
    ) as HTMLButtonElement;
    deleteButton.click();

    expect(confirmSpy).toHaveBeenCalledWith(
      expect.stringContaining('Удалить город «Москва»?'),
    );
    expect(serviceMock.removeCity).not.toHaveBeenCalled();

    confirmSpy.mockReturnValue(true);
    deleteButton.click();
    await flushPromises();

    expect(serviceMock.removeCity).toHaveBeenCalledWith('c1');
    confirmSpy.mockRestore();
  });
});
