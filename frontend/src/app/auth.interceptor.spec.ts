import {
  HttpClient,
  provideHttpClient,
  withInterceptors,
} from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
  TestRequest,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { authInterceptor } from './auth.interceptor';
import { SessionService, type AuthProfile } from './session.service';

const STORAGE_KEY = 'kaufman_bot_api_key';
const ME_ENDPOINT = '/api/v1/auth/me';
const CHATS_ENDPOINT = '/api/v1/chat/conversations';

/**
 * The interceptor is the single place that puts the key on outgoing requests,
 * so a session restored from localStorage has to authorise the first request
 * a reloaded page makes — without the caller knowing anything about the key.
 */
describe('authInterceptor — passing the saved key to the API', () => {
  let http: HttpClient;
  let httpMock: HttpTestingController;
  let session: SessionService;

  /** A profile whose zone matches the browser one, so no PATCH /auth/me follows. */
  function acceptedKey(): AuthProfile {
    return {
      user: {
        id: 'user-1',
        email: 'user1@kaufman.bot',
        role: 'USER',
        isActive: true,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone ?? null,
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

  beforeEach(() => {
    localStorage.clear();

    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        { provide: Router, useValue: { navigate: jest.fn() } },
      ],
    });

    http = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
    localStorage.clear();
  });

  /**
   * Saves a key, creates the service and starts the restore, which is the
   * order of a real page load (the app initializer calls `restore()`).
   */
  function startRestore(key: string): TestRequest {
    localStorage.setItem(STORAGE_KEY, key);
    session = TestBed.inject(SessionService);
    session.restore();
    return httpMock.expectOne(ME_ENDPOINT);
  }

  /** As above, with the key accepted by the server. */
  function bootWithSavedKey(key: string): void {
    startRestore(key).flush(acceptedKey());
  }

  function askForConversations(): void {
    http.get<string[]>(CHATS_ENDPOINT).subscribe();
  }

  /**
   * The restore request itself goes through the interceptor while the service
   * is still settling, so it has to carry the key that was just read from
   * localStorage — otherwise the check could never succeed.
   */
  it('authorises its own key check with the saved key', () => {
    const request = startRestore('sk-saved');

    expect(request.request.headers.get('x-api-key')).toBe('sk-saved');
    request.flush(acceptedKey());
  });

  it('adds the restored key to an API request', () => {
    bootWithSavedKey('sk-saved');

    askForConversations();

    const request = httpMock.expectOne(CHATS_ENDPOINT);
    expect(request.request.headers.get('x-api-key')).toBe('sk-saved');
    request.flush([]);
  });

  it('leaves requests outside /api unauthorised', () => {
    bootWithSavedKey('sk-saved');

    http.get<{ ok: boolean }>('/assets/health.json').subscribe();

    const request = httpMock.expectOne('/assets/health.json');
    expect(request.request.headers.get('x-api-key')).toBeNull();
    request.flush({ ok: true });
  });

  it('sends no key when nothing has been saved', () => {
    session = TestBed.inject(SessionService);

    askForConversations();

    const request = httpMock.expectOne(CHATS_ENDPOINT);
    expect(request.request.headers.has('x-api-key')).toBe(false);
    request.flush([]);
  });

  it('drops the saved key when the API answers 401', () => {
    bootWithSavedKey('sk-saved');

    askForConversations();
    httpMock
      .expectOne(CHATS_ENDPOINT)
      .flush(
        { message: 'Invalid API key' },
        { status: 401, statusText: 'Unauthorized' },
      );

    expect(session.apiKey()).toBeNull();
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('keeps the saved key on a server error that is not a rejection', () => {
    bootWithSavedKey('sk-saved');

    askForConversations();
    httpMock
      .expectOne(CHATS_ENDPOINT)
      .flush({}, { status: 503, statusText: 'Service Unavailable' });

    expect(session.apiKey()).toBe('sk-saved');
    expect(localStorage.getItem(STORAGE_KEY)).toBe('sk-saved');
  });
});
