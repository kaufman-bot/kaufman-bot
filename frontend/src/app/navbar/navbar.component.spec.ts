import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { SessionService } from '../session.service';
import { NavbarComponent } from './navbar.component';

describe('NavbarComponent', () => {
  let component: NavbarComponent;
  let fixture: ComponentFixture<NavbarComponent>;
  let sessionService: SessionService;

  beforeEach(async () => {
    const sessionSpy = {
      isAuthenticated: jest.fn().mockReturnValue(false),
      isAdmin: jest.fn().mockReturnValue(false),
      profile: jest.fn().mockReturnValue(null),
      logout: jest.fn(),
    } as unknown as SessionService;

    await TestBed.configureTestingModule({
      imports: [NavbarComponent],
      providers: [
        provideRouter([]),
        { provide: SessionService, useValue: sessionSpy },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(NavbarComponent);
    component = fixture.componentInstance;
    sessionService = TestBed.inject(SessionService);
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should call session.logout on logout', () => {
    component.onLogout();
    expect(sessionService.logout).toHaveBeenCalled();
  });

  it('should show login link when not authenticated', () => {
    (sessionService.isAuthenticated as jest.Mock).mockReturnValue(false);
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.btn-login')).toBeTruthy();
  });

  it('should show logout button when authenticated', () => {
    (sessionService.isAuthenticated as jest.Mock).mockReturnValue(true);
    (sessionService.profile as jest.Mock).mockReturnValue({
      user: { email: 'test@example.com' },
    });
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.btn-logout')).toBeTruthy();
    expect(compiled.querySelector('.user-email')?.textContent).toContain(
      'test@example.com',
    );
  });

  it('should show chat link when authenticated', () => {
    (sessionService.isAuthenticated as jest.Mock).mockReturnValue(true);
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const links = compiled.querySelectorAll('a');
    const chatLink = Array.from(links).find((l) =>
      l.textContent?.includes('Чат с ботом'),
    );
    expect(chatLink).toBeTruthy();
  });

  it('should show mock-bot link when admin', () => {
    (sessionService.isAuthenticated as jest.Mock).mockReturnValue(true);
    (sessionService.isAdmin as jest.Mock).mockReturnValue(true);
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const links = compiled.querySelectorAll('a');
    const mockBotLink = Array.from(links).find((l) =>
      l.textContent?.includes('Мок-сервер'),
    );
    expect(mockBotLink).toBeTruthy();
  });

  it('should not show mock-bot link when not admin', () => {
    (sessionService.isAuthenticated as jest.Mock).mockReturnValue(true);
    (sessionService.isAdmin as jest.Mock).mockReturnValue(false);
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const links = compiled.querySelectorAll('a');
    const mockBotLink = Array.from(links).find((l) =>
      l.textContent?.includes('Мок-сервер'),
    );
    expect(mockBotLink).toBeFalsy();
  });

  it('should display site name in brand', () => {
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.brand-text')?.textContent).toContain(
      'Kaufman Bot',
    );
  });
});
