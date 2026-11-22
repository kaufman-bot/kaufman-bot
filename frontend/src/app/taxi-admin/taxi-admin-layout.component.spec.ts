import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { routes } from '../app.routes';
import { requireAdminGuard } from '../auth.guard';
import { TaxiAdminLayoutComponent } from './taxi-admin-layout.component';

describe('TaxiAdminLayoutComponent', () => {
  let fixture: ComponentFixture<TaxiAdminLayoutComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TaxiAdminLayoutComponent],
      providers: [provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(TaxiAdminLayoutComponent);
  });

  it('renders the sidebar with the seven section links', () => {
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const links = Array.from(compiled.querySelectorAll('.sidebar-nav a'));
    expect(links.map((link) => link.textContent?.trim())).toEqual([
      'Города',
      'Услуги',
      'Слоты выезда',
      'Кол-во человек',
      'Водители',
      'Цены',
      'Заказы',
    ]);
  });

  it('points the sidebar links at the seven child routes', () => {
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const hrefs = Array.from(compiled.querySelectorAll('.sidebar-nav a')).map(
      (link) => link.getAttribute('href'),
    );
    expect(hrefs).toEqual([
      '/cities',
      '/services',
      '/departure-slots',
      '/passenger-options',
      '/drivers',
      '/prices',
      '/orders',
    ]);
  });

  it('renders the child router outlet', () => {
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('router-outlet')).toBeTruthy();
  });
});

describe('taxi routes configuration', () => {
  it('guards the /taxi section with requireAdminGuard', () => {
    const taxi = routes.find((route) => route.path === 'taxi');
    expect(taxi?.canActivate).toContain(requireAdminGuard);
  });

  it('lazily declares the seven child pages under /taxi', () => {
    const taxi = routes.find((route) => route.path === 'taxi');
    const paths = (taxi?.children ?? []).map((child) => child.path);
    expect(paths).toEqual([
      '',
      'cities',
      'services',
      'departure-slots',
      'passenger-options',
      'drivers',
      'prices',
      'orders',
    ]);
  });
});
