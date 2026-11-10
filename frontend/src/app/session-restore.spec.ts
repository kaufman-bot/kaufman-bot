import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { SessionService, type AuthProfile } from './session.service';

/**
 * Coverage of the reload path: the saved key is put back into memory before
 * the server has confirmed it, so the very first API call after an F5 already
 * carries the key and the guard can reopen the page afterwards.
 */
describe('SessionService — session restore after a reload', () => {
  const STORAGE_KEY = 'kaufman_bot_api_key';
  const ME_ENDPOINT = '/api/v1/auth/me';
  const BROWSER_TIMEZONE = 'Europe/Moscow';

  /**
   * A profile whose zone equals the mocked browser one, so restoring it does
   * not fire the extra `PATCH /auth/me` of syncTimezone().
   */
  function profileWith(role: 'USER' | 'ADMIN'): AuthProfile {
    return {
      user: {
        id: `user-${role.toLowerCase()}`,
        email: `${role.toLowerCase()}@kaufman.bot`,
        role,
        isActive: true,
        timezone: BROWSER_TIMEZONE,
      },
      apiKey: {
        id: 'key-1',
        name: 'Default key',
        key: 'sk-12345…',
        isActive: true,
        expiresAt: null,
      },
    };
  }

  let httpMock: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    // Deterministic browser time zone: profiles below use the same value, so
    // restoring one does not fire the extra PATCH of syncTimezone().
    jest
      .spyOn(Intl.DateTimeFormat.prototype, 'resolvedOptions')
      .mockReturnValue({
        timeZone: BROWSER_TIMEZONE,
      } as Intl.ResolvedDateTimeFormatOptions);

    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: Router, useValue: { navigate: jest.fn() } },
      ],
    });

    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
    jest.restoreAllMocks();
    localStorage.clear();
  });

  /**
   * Writes the key, creates the service and only then starts the restore: the
   * constructor must not send anything, because the request would be handled
   * by an interceptor that injects this very service.
   */
  function createWithSavedKey(key: string): SessionService {
    localStorage.setItem(STORAGE_KEY, key);
    const service = TestBed.inject(SessionService);
    service.restore();
    return service;
  }

  it('sends nothing while the service is only being created', () => {
    localStorage.setItem(STORAGE_KEY, 'sk-saved');

    const service = TestBed.inject(SessionService);

    httpMock.expectNone(ME_ENDPOINT);
    expect(service.apiKey()).toBeNull();
  });

  it('checks the saved key once, however many callers ask for it', () => {
    localStorage.setItem(STORAGE_KEY, 'sk-saved');
    const service = TestBed.inject(SessionService);

    service.restore();
    service.restore();
    service.whenReady().subscribe();

    // `expectOne` + `expectNone` together mean "exactly one request".
    httpMock.expectOne(ME_ENDPOINT).flush(profileWith('USER'));
    httpMock.expectNone(ME_ENDPOINT);
  });

  it('puts the saved key back into memory before the server confirms it', () => {
    const service = createWithSavedKey('sk-saved');

    expect(service.apiKey()).toBe('sk-saved');
    expect(service.isAuthenticated()).toBe(false);

    httpMock.expectOne(ME_ENDPOINT).flush(profileWith('USER'));
  });

  it('reports the saved key even when it has not been validated yet', () => {
    const service = createWithSavedKey('sk-saved');

    expect(service.storedApiKey()).toBe('sk-saved');

    httpMock.expectOne(ME_ENDPOINT).flush(profileWith('USER'));
  });

  it('opens the session of the saved key and settles whenReady()', () => {
    const service = createWithSavedKey('sk-saved');
    const settled = jest.fn();
    service.whenReady().subscribe(settled);

    expect(settled).not.toHaveBeenCalled();

    httpMock.expectOne(ME_ENDPOINT).flush(profileWith('ADMIN'));

    expect(settled).toHaveBeenCalledTimes(1);
    expect(service.isAuthenticated()).toBe(true);
    expect(service.isAdmin()).toBe(true);
  });

  it('settles whenReady() for subscribers that appear after the restore', () => {
    const service = createWithSavedKey('sk-saved');
    httpMock.expectOne(ME_ENDPOINT).flush(profileWith('USER'));

    const settled = jest.fn();
    service.whenReady().subscribe(settled);

    expect(settled).toHaveBeenCalledTimes(1);
  });

  it('sends no request and settles immediately when nothing was saved', () => {
    const settled = jest.fn();

    const service = TestBed.inject(SessionService);
    service.whenReady().subscribe(settled);
    httpMock.expectNone(ME_ENDPOINT);
    expect(settled).toHaveBeenCalledTimes(1);
    expect(service.apiKey()).toBeNull();
  });

  it('keeps the saved key when the backend is unreachable', () => {
    const service = createWithSavedKey('sk-saved');
    const settled = jest.fn();
    service.whenReady().subscribe(settled);

    httpMock.expectOne(ME_ENDPOINT).error(new ErrorEvent('network error'), {
      status: 0,
      statusText: 'Unknown Error',
    });

    expect(settled).toHaveBeenCalledTimes(1);
    expect(service.isAuthenticated()).toBe(false);
    expect(service.apiKey()).toBe('sk-saved');
    expect(localStorage.getItem(STORAGE_KEY)).toBe('sk-saved');
  });

  it('drops the saved key when the server rejects it', () => {
    const service = createWithSavedKey('sk-revoked');
    const settled = jest.fn();
    service.whenReady().subscribe(settled);

    httpMock
      .expectOne(ME_ENDPOINT)
      .flush(
        { message: 'Invalid API key' },
        { status: 401, statusText: 'Unauthorized' },
      );

    expect(settled).toHaveBeenCalledTimes(1);
    expect(service.apiKey()).toBeNull();
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });
});
