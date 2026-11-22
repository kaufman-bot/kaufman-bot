import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TaxiDriversComponent } from './drivers.component';
import type { TaxiDriverDto } from './taxi.service';
import { TaxiService } from './taxi.service';

const seededDriver = {
  id: 'd1',
  fullName: 'Шофёр Один',
  phone: '+7-900-000-00-01',
  isActive: true,
  cars: [],
} as unknown as TaxiDriverDto;

const makeServiceMock = () => ({
  drivers: () => [seededDriver],
  driversLoading: () => false,
  driversError: () => null,
  services: () => [],
  loadDrivers: jest.fn().mockResolvedValue(undefined),
  loadServices: jest.fn().mockResolvedValue(undefined),
  createDriver: jest.fn().mockResolvedValue(undefined),
  updateDriver: jest.fn().mockResolvedValue(undefined),
  removeDriver: jest.fn().mockResolvedValue(undefined),
  createCar: jest.fn().mockResolvedValue(undefined),
  removeCar: jest.fn().mockResolvedValue(undefined),
});

describe('TaxiDriversComponent', () => {
  let fixture: ComponentFixture<TaxiDriversComponent>;
  let serviceMock: ReturnType<typeof makeServiceMock>;

  beforeEach(async () => {
    // jsdom не реализует scrollIntoView — «Изменить» скроллит к форме (D14).
    Element.prototype.scrollIntoView = jest.fn();
    serviceMock = makeServiceMock();
    await TestBed.configureTestingModule({
      imports: [TaxiDriversComponent],
      providers: [{ provide: TaxiService, useValue: serviceMock }],
    }).compileComponents();

    fixture = TestBed.createComponent(TaxiDriversComponent);
  });

  /** Flushes pending microtasks (service promise chains, NgModel write-back). */
  const flushPromises = async (): Promise<void> => {
    await new Promise((resolve) => setTimeout(resolve, 0));
    fixture.detectChanges();
  };

  /** Header action buttons of the first driver card (cars list is empty). */
  const headerButtons = (): {
    edit: HTMLButtonElement;
    remove: HTMLButtonElement;
  } => {
    const compiled = fixture.nativeElement as HTMLElement;
    return {
      edit: compiled.querySelector('.card-header .link') as HTMLButtonElement,
      remove: compiled.querySelector(
        '.card-header .link.danger',
      ) as HTMLButtonElement,
    };
  };

  it('renders the driver card with edit/delete buttons in the header', () => {
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.driver-card h2')?.textContent).toContain(
      'Шофёр Один',
    );
    const { edit, remove } = headerButtons();
    expect(edit.textContent).toContain('Изменить');
    expect(remove.textContent).toContain('Удалить');
    expect(serviceMock.loadDrivers).toHaveBeenCalled();
  });

  it('«Изменить» activates edit mode, prefills the bottom form and scrolls to it', async () => {
    fixture.detectChanges();

    headerButtons().edit.click();
    await flushPromises();

    const compiled = fixture.nativeElement as HTMLElement;
    const heading = compiled.querySelector(
      'form.entity-form h3',
    ) as HTMLElement;
    expect(heading.textContent).toContain('Редактировать водителя');
    const fullNameInput = compiled.querySelector(
      'input[name="fullName"]',
    ) as HTMLInputElement;
    const phoneInput = compiled.querySelector(
      'input[name="phone"]',
    ) as HTMLInputElement;
    const activeInput = compiled.querySelector(
      'input[name="isActive"]',
    ) as HTMLInputElement;
    // NgModel откладывает write-value микротаской — ждём стабилизации зоны.
    expect(fullNameInput.value).toBe('Шофёр Один');
    expect(phoneInput.value).toBe('+7-900-000-00-01');
    expect(activeInput.checked).toBe(true);
    expect(Element.prototype.scrollIntoView).toHaveBeenCalledWith({
      behavior: 'smooth',
      block: 'start',
    });
  });

  it('submits the prefilled form through updateDriver (not createDriver)', async () => {
    fixture.detectChanges();
    headerButtons().edit.click();
    await flushPromises();

    // jsdom не сабмитит форму кликом по кнопке type=submit — сабмитим явно.
    (
      (fixture.nativeElement as HTMLElement).querySelector(
        'form.entity-form',
      ) as HTMLFormElement
    ).requestSubmit();
    await flushPromises();

    expect(serviceMock.updateDriver).toHaveBeenCalledWith('d1', {
      fullName: 'Шофёр Один',
      phone: '+7-900-000-00-01',
      isActive: true,
    });
    expect(serviceMock.createDriver).not.toHaveBeenCalled();
  });

  it('deletes a driver only after confirmation', async () => {
    const confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(false);
    fixture.detectChanges();

    headerButtons().remove.click();
    expect(confirmSpy).toHaveBeenCalledWith(
      expect.stringContaining('Удалить водителя «Шофёр Один»?'),
    );
    expect(serviceMock.removeDriver).not.toHaveBeenCalled();

    confirmSpy.mockReturnValue(true);
    headerButtons().remove.click();
    await flushPromises();

    expect(serviceMock.removeDriver).toHaveBeenCalledWith('d1');
    confirmSpy.mockRestore();
  });
});
