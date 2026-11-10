import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Route, Router } from '@angular/router';
import {
  redirectIfAuthenticatedGuard,
  requireAdminGuard,
  requireAuthGuard,
} from './auth.guard';
import { SessionService, type AuthProfile } from './session.service';

const STORAGE_KEY = 'kaufman_bot_api_key';
const ME_ENDPOINT = '/api/v1/auth/me';

/** jsdom reports the host zone; pin it so no time zone PATCH is ever fired. */
const BROWSER_TIMEZONE = 'Europe/Moscow';

function makeProfile(role: 'USER' | 'ADMIN'): AuthProfile {
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

@Component({ standalone: true, selector: 'app-fake-login', template: 'login' })
class FakeLoginComponent {}

@Component({ standalone: true, selector: 'app-fake-chat', template: 'chat' })
class FakeChatComponent {}

@Component({
  standalone: true,
  selector: 'app-fake-admin',
  template: 'admin',
})
class FakeAdminComponent {}

@Component({ standalone: true, selector: 'app-fake-mock', template: 'mock' })
class FakeMockBotComponent {}

const ROUTES: Route[] = [
  {
    path: 'login',
    component: FakeLoginComponent,
    canActivate: [redirectIfAuthenticatedGuard],
  },
  {
    path: 'chat',
    component: FakeChatComponent,
    canActivate: [requireAuthGuard],
  },
  {
    path: 'telegram-bots',
    component: FakeAdminComponent,
    canActivate: [requireAdminGuard],
  },
  // Landing point of the admin redirect made by redirectIfAuthenticatedGuard.
  { path: 'mock-bot', component: FakeMockBotComponent },
];

describe('auth guards — restoring the session after a page reload', () => {
  let router: Router;
  let httpMock: HttpTestingController;

  /**
   * Saves a key and boots the service the way the app initializer does: the
   * key check is under way before the first navigation, so the guard has
   * something to wait for.
   */
  function bootWithSavedKey(key: string): SessionService {
    localStorage.setItem(STORAGE_KEY, key);
    const session = TestBed.inject(SessionService);
    session.restore();
    return session;
  }

  /** Answers the pending boot-time `GET /auth/me` with a valid profile. */
  function answerRestore(profile: AuthProfile): void {
    httpMock.expectOne(ME_ENDPOINT).flush(profile);
  }

  /** Rejects the pending boot-time `GET /auth/me` as an invalid key. */
  function rejectRestore(): void {
    httpMock
      .expectOne(ME_ENDPOINT)
      .flush(
        { message: 'Invalid API key' },
        { status: 401, statusText: 'Unauthorized' },
      );
  }

  beforeEach(() => {
    localStorage.clear();
    jest
      .spyOn(Intl.DateTimeFormat.prototype, 'resolvedOptions')
      .mockReturnValue({
        timeZone: BROWSER_TIMEZONE,
      } as Intl.ResolvedDateTimeFormatOptions);

    TestBed.configureTestingModule({
      providers: [
        provideRouter(ROUTES),
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });

    router = TestBed.inject(Router);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
    jest.restoreAllMocks();
    localStorage.clear();
  });

  it('holds the navigation open while the saved key is being checked', async () => {
    bootWithSavedKey('sk-saved');

    let settled = false;
    const navigation = router
      .navigate(['/chat'])
      .then((result) => (settled = result));
    await Promise.resolve();

    // The guard must not decide before the profile has arrived: deciding on
    // the spot is what used to send a logged-in user to the login page.
    expect(settled).toBe(false);
    expect(router.url).not.toBe('/chat');

    answerRestore(makeProfile('USER'));
    expect(await navigation).toBe(true);
    expect(router.url).toBe('/chat');
  });

  it('reopens the page without asking for the key again after a reload', async () => {
    const session = bootWithSavedKey('sk-saved');

    const navigation = router.navigate(['/chat']);
    answerRestore(makeProfile('USER'));
    await navigation;

    expect(session.isAuthenticated()).toBe(true);
    expect(router.url).toBe('/chat');

    // A later navigation reuses the restored session: no second key check.
    await router.navigate(['/telegram-bots']);
    expect(router.url).toBe('/chat'); // a USER is not allowed in the admin area
  });

  it('keeps the admin on the admin screen after a reload', async () => {
    bootWithSavedKey('sk-admin');

    const navigation = router.navigate(['/telegram-bots']);
    answerRestore(makeProfile('ADMIN'));
    await navigation;

    expect(router.url).toBe('/telegram-bots');
  });

  it('redirects to /login with returnUrl when no key has ever been saved', async () => {
    TestBed.inject(SessionService);

    await router.navigate(['/chat']);

    expect(router.url).toBe('/login?returnUrl=%2Fchat');
    httpMock.expectNone(ME_ENDPOINT);
  });

  it('drops a saved key the server rejects and goes to /login', async () => {
    const session = bootWithSavedKey('sk-revoked');

    const navigation = router.navigate(['/chat']);
    rejectRestore();
    await navigation;

    expect(router.url).toContain('/login');
    expect(session.apiKey()).toBeNull();
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('keeps the saved key when the backend is unreachable', async () => {
    const session = bootWithSavedKey('sk-saved');

    const navigation = router.navigate(['/chat']);
    httpMock.expectOne(ME_ENDPOINT).error(new ErrorEvent('network error'), {
      status: 0,
      statusText: 'Unknown Error',
    });
    await navigation;

    // The login page is shown, but the key survived the outage: the user only
    // confirms it instead of typing it again.
    expect(router.url).toContain('/login');
    expect(session.apiKey()).toBe('sk-saved');
    expect(localStorage.getItem(STORAGE_KEY)).toBe('sk-saved');
  });

  it('sends an authenticated non-admin away from an admin page to /chat', async () => {
    const session = bootWithSavedKey('sk-user');

    const navigation = router.navigate(['/telegram-bots']);
    answerRestore(makeProfile('USER'));
    await navigation;

    expect(session.isAdmin()).toBe(false);
    expect(router.url).toBe('/chat');
  });

  it('redirects a restored admin away from /login once the key is checked', async () => {
    bootWithSavedKey('sk-admin');

    let settled = false;
    const navigation = router
      .navigate(['/login'])
      .then((result) => (settled = result));
    await Promise.resolve();
    expect(settled).toBe(false);

    answerRestore(makeProfile('ADMIN'));
    await navigation;

    expect(router.url).toBe('/mock-bot');
  });
});
