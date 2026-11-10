import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { SessionService, type AuthProfile } from './session.service';

describe('SessionService', () => {
  const STORAGE_KEY = 'kaufman_bot_api_key';

  let service: SessionService;
  let httpMock: HttpTestingController;
  let router: Router;

  beforeEach(() => {
    const routerSpy = {
      navigate: jest.fn(),
    } as unknown as Router;

    TestBed.configureTestingModule({
      providers: [
        SessionService,
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: Router, useValue: routerSpy },
      ],
    });

    service = TestBed.inject(SessionService);
    httpMock = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);

    // Deterministic browser time zone for syncTimezone (jsdom reports the
    // host one, which is machine-dependent). Profiles below use the same
    // value so that login does not fire an extra PATCH in unrelated tests.
    jest
      .spyOn(Intl.DateTimeFormat.prototype, 'resolvedOptions')
      .mockReturnValue({
        timeZone: 'Europe/Moscow',
      } as Intl.ResolvedDateTimeFormatOptions);

    // Clear localStorage before each test. Creating the service sends nothing:
    // the key check lives in restore(), which these tests call explicitly.
    localStorage.clear();
  });

  afterEach(() => {
    httpMock.verify();
    jest.restoreAllMocks();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should start with no authentication', () => {
    expect(service.isAuthenticated()).toBe(false);
    expect(service.apiKey()).toBeNull();
    expect(service.profile()).toBeNull();
  });

  it('should login successfully with valid API key', () => {
    const mockProfile = {
      user: {
        id: 'user-1',
        email: 'test@example.com',
        role: 'USER' as const,
        isActive: true,
        timezone: 'Europe/Moscow',
      },
      apiKey: {
        id: 'key-1',
        name: 'Test Key',
        key: 'sk-…',
        isActive: true,
        expiresAt: null,
      },
    };

    service.login('sk-test-key').subscribe((profile) => {
      expect(profile).toEqual(mockProfile);
      expect(service.isAuthenticated()).toBe(true);
      expect(service.apiKey()).toBe('sk-test-key');
      expect(service.profile()).toEqual(mockProfile);
    });

    const req = httpMock.expectOne('/api/v1/auth/login');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ apiKey: 'sk-test-key' });
    req.flush(mockProfile);
  });

  it('should clear session on login failure', () => {
    service.login('sk-invalid-key').subscribe((profile) => {
      expect(profile).toBeNull();
      expect(service.isAuthenticated()).toBe(false);
      expect(service.apiKey()).toBeNull();
    });

    const req = httpMock.expectOne('/api/v1/auth/login');
    req.flush(
      { message: 'Invalid API key' },
      { status: 401, statusText: 'Unauthorized' },
    );
  });

  it('should logout and clear session', () => {
    // First login
    const mockProfile = {
      user: {
        id: 'user-1',
        email: 'test@example.com',
        role: 'USER' as const,
        isActive: true,
        timezone: 'Europe/Moscow',
      },
      apiKey: {
        id: 'key-1',
        name: 'Test Key',
        key: 'sk-…',
        isActive: true,
        expiresAt: null,
      },
    };

    service.login('sk-test-key').subscribe();
    const loginReq = httpMock.expectOne('/api/v1/auth/login');
    loginReq.flush(mockProfile);

    expect(service.isAuthenticated()).toBe(true);
    expect(localStorage.getItem(STORAGE_KEY)).toBe('sk-test-key');

    // Then logout
    service.logout();

    expect(service.isAuthenticated()).toBe(false);
    expect(service.apiKey()).toBeNull();
    expect(service.profile()).toBeNull();
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(router.navigate).toHaveBeenCalledWith(['/login']);
  });

  it('should expire session and redirect to login', () => {
    // First login
    const mockProfile = {
      user: {
        id: 'user-1',
        email: 'test@example.com',
        role: 'USER' as const,
        isActive: true,
        timezone: 'Europe/Moscow',
      },
      apiKey: {
        id: 'key-1',
        name: 'Test Key',
        key: 'sk-…',
        isActive: true,
        expiresAt: null,
      },
    };

    service.login('sk-test-key').subscribe();
    const loginReq = httpMock.expectOne('/api/v1/auth/login');
    loginReq.flush(mockProfile);

    // Then expire
    service.expire();

    expect(service.isAuthenticated()).toBe(false);
    expect(service.apiKey()).toBeNull();
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(router.navigate).toHaveBeenCalledWith(['/login']);
  });

  it('should detect admin role', () => {
    const adminProfile = {
      user: {
        id: 'admin-1',
        email: 'admin@example.com',
        role: 'ADMIN' as const,
        isActive: true,
        timezone: 'Europe/Moscow',
      },
      apiKey: {
        id: 'key-1',
        name: 'Admin Key',
        key: 'sk-…',
        isActive: true,
        expiresAt: null,
      },
    };

    service.login('sk-admin-key').subscribe();
    const loginReq = httpMock.expectOne('/api/v1/auth/login');
    loginReq.flush(adminProfile);

    expect(service.isAdmin()).toBe(true);
  });

  it('should not be admin for USER role', () => {
    const userProfile = {
      user: {
        id: 'user-1',
        email: 'user@example.com',
        role: 'USER' as const,
        isActive: true,
        timezone: 'Europe/Moscow',
      },
      apiKey: {
        id: 'key-1',
        name: 'User Key',
        key: 'sk-…',
        isActive: true,
        expiresAt: null,
      },
    };

    service.login('sk-user-key').subscribe();
    const loginReq = httpMock.expectOne('/api/v1/auth/login');
    loginReq.flush(userProfile);

    expect(service.isAdmin()).toBe(false);
  });

  describe('syncTimezone', () => {
    /** Logs in with the given stored zone (browser one is Europe/Moscow). */
    const loginWithTimezone = (timezone: string | null): AuthProfile => {
      const mockProfile = {
        user: {
          id: 'user-1',
          email: 'tz@example.com',
          role: 'USER' as const,
          isActive: true,
          timezone,
        },
        apiKey: {
          id: 'key-1',
          name: 'Test Key',
          key: 'sk-…',
          isActive: true,
          expiresAt: null,
        },
      };

      service.login('sk-test-key').subscribe();
      httpMock.expectOne('/api/v1/auth/login').flush(mockProfile);
      return mockProfile;
    };

    it('sends PATCH when the browser time zone differs from the stored one', () => {
      const profile = loginWithTimezone(null);

      const req = httpMock.expectOne('/api/v1/auth/me');
      expect(req.request.method).toBe('PATCH');
      expect(req.request.body).toEqual({ timezone: 'Europe/Moscow' });
      expect(req.request.headers.get('x-api-key')).toBe('sk-test-key');
      req.flush({
        ...profile,
        user: { ...profile.user, timezone: 'Europe/Moscow' },
      });

      expect(service.profile()!.user.timezone).toBe('Europe/Moscow');
    });

    it('does not send PATCH when the time zones already match', () => {
      loginWithTimezone('Europe/Moscow');

      // The login request was flushed and nothing else is pending.
      httpMock.verify();
    });

    it('keeps the session when the PATCH fails', () => {
      const profile = loginWithTimezone(null);

      httpMock
        .expectOne('/api/v1/auth/me')
        .flush(
          { message: 'boom' },
          { status: 500, statusText: 'Server Error' },
        );

      expect(service.isAuthenticated()).toBe(true);
      expect(service.profile()).toEqual(profile);
    });
  });

  describe('telegram target', () => {
    it('isTelegramTarget is true when telegramBotId is present', () => {
      const mockProfile = {
        user: {
          id: 'user-1',
          email: 'tg@example.com',
          role: 'USER' as const,
          isActive: true,
          timezone: 'Europe/Moscow',
          telegramBotId: 'bot-123',
          telegramBotName: 'My Bot',
        },
        apiKey: {
          id: 'key-1',
          name: 'Test Key',
          key: 'sk-…',
          isActive: true,
          expiresAt: null,
        },
      };

      service.login('sk-tg-key').subscribe();
      const req = httpMock.expectOne('/api/v1/auth/login');
      req.flush(mockProfile);

      expect(service.isTelegramTarget()).toBe(true);
    });

    it('isTelegramTarget is false when telegramBotId is null', () => {
      const mockProfile = {
        user: {
          id: 'user-2',
          email: 'mock@example.com',
          role: 'USER' as const,
          isActive: true,
          timezone: 'Europe/Moscow',
          telegramBotId: null,
          telegramBotName: null,
        },
        apiKey: {
          id: 'key-2',
          name: 'Test Key',
          key: 'sk-…',
          isActive: true,
          expiresAt: null,
        },
      };

      service.login('sk-mock-key').subscribe();
      const req = httpMock.expectOne('/api/v1/auth/login');
      req.flush(mockProfile);

      expect(service.isTelegramTarget()).toBe(false);
    });

    it('launchTelegram POSTs to /telegram/launch and opens url', () => {
      // First login with bot target
      const mockProfile = {
        user: {
          id: 'user-1',
          email: 'tg@example.com',
          role: 'USER' as const,
          isActive: true,
          timezone: 'Europe/Moscow',
          telegramBotId: 'bot-1',
          telegramBotName: 'My Bot',
        },
        apiKey: {
          id: 'key-1',
          name: 'Test Key',
          key: 'sk-…',
          isActive: true,
          expiresAt: null,
        },
      };

      service.login('sk-launch-key').subscribe();
      httpMock.expectOne('/api/v1/auth/login').flush(mockProfile);

      const openSpy = jest.spyOn(window, 'open').mockImplementation();
      service.launchTelegram();

      const req = httpMock.expectOne('/api/v1/telegram/launch');
      expect(req.request.method).toBe('POST');
      req.flush({ url: 't.me/my_bot?start=abc', token: 'abc' });

      expect(openSpy).toHaveBeenCalledWith('t.me/my_bot?start=abc', '_blank');
      openSpy.mockRestore();
    });
  });
});
