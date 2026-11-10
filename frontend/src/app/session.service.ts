import { isPlatformBrowser } from '@angular/common';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import {
  computed,
  inject,
  Injectable,
  PLATFORM_ID,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';
import {
  catchError,
  finalize,
  Observable,
  of,
  ReplaySubject,
  take,
  tap,
  timeout,
} from 'rxjs';

const API_BASE = '/api';
const API_V1 = `${API_BASE}/v1`;

const STORAGE_KEY = 'kaufman_bot_api_key';

/**
 * How long the boot-time key check may take before the session counts as not
 * restored. Route guards wait for it, so the wait has to stay bounded.
 */
const RESTORE_TIMEOUT_MS = 10_000;

export interface AuthProfileUser {
  id: string;
  email: string;
  role: 'USER' | 'ADMIN' | 'GUEST';
  isActive: boolean;
  timezone: string | null;
  telegramBotId?: string | null;
  telegramBotName?: string | null;
}

export interface AuthProfileApiKey {
  id: string;
  name: string;
  key: string; // Masked
  isActive: boolean;
  expiresAt: string | null;
}

export interface AuthProfile {
  user: AuthProfileUser;
  apiKey: AuthProfileApiKey;
}

export interface LoginRequest {
  apiKey: string;
}

/**
 * Manages user session state: API key + auth profile. Persists the key
 * in localStorage (browser-only, SSR-safe) and provides reactive signals
 * for components to observe. Route guards wait for `whenReady()` so that a
 * page reload restores the session instead of bouncing it to `/login`.
 */
@Injectable({ providedIn: 'root' })
export class SessionService {
  private http = inject(HttpClient);
  private platformId = inject(PLATFORM_ID);
  private router = inject(Router);

  /** The raw API key stored in memory (null when logged out). */
  private readonly apiKeySignal = signal<string | null>(null);

  /** The authenticated user's profile (null when not logged in). */
  private readonly profileSignal = signal<AuthProfile | null>(null);

  /**
   * Settles once the initial session restore is over: immediately when there
   * is nothing to restore, otherwise after the saved key has been checked.
   * Buffered (`ReplaySubject`) so subscribers that appear later — e.g. guards
   * of a navigation started after the boot one — still get a value.
   */
  private readonly ready$ = new ReplaySubject<void>(1);

  /** Whether the boot-time restore has already been started. */
  private restoreStarted = false;

  /** Reactive API key for use in templates and effects. */
  readonly apiKey = this.apiKeySignal.asReadonly();

  /** Reactive auth profile for use in templates and effects. */
  readonly profile = this.profileSignal.asReadonly();

  /** Whether the user is currently authenticated. */
  readonly isAuthenticated = computed(() => this.profileSignal() !== null);

  /** Whether the authenticated user has ADMIN role. */
  readonly isAdmin = computed(
    () => this.profileSignal()?.user.role === 'ADMIN',
  );

  /** Whether the user's active transport target is a Telegram bot (not mock). */
  readonly isTelegramTarget = computed(
    () => !!this.profileSignal()?.user.telegramBotId,
  );

  /**
   * Restores the session saved in the browser. Idempotent and deliberately not
   * done in the constructor: the request it makes travels through
   * `authInterceptor`, which injects this very service, so starting it while
   * the instance is still being built is a circular dependency and the request
   * is never sent. Called by the app initializer and, defensively, by
   * `whenReady()`.
   */
  restore(): void {
    if (this.restoreStarted) {
      return;
    }
    this.restoreStarted = true;

    if (!isPlatformBrowser(this.platformId)) {
      this.markReady();
      return;
    }

    const storedKey = this.storedApiKey();
    if (!storedKey) {
      this.markReady();
      return;
    }

    // Publish the key before asking the server: the requests the restored page
    // makes right away must already carry it.
    this.apiKeySignal.set(storedKey);
    this.restoreStoredKey(storedKey);
  }

  /**
   * Resolves when the session state after a page load is final. A router guard
   * that only reads `isAuthenticated()` would see `false` while the saved key
   * is still being validated and would send a logged-in user to `/login`.
   */
  whenReady(): Observable<void> {
    this.restore();
    return this.ready$.pipe(take(1));
  }

  /** The key saved in the browser, whether or not it has been validated yet. */
  storedApiKey(): string | null {
    if (!isPlatformBrowser(this.platformId)) {
      return null;
    }
    return localStorage.getItem(STORAGE_KEY);
  }

  /**
   * Logs in with the given API key by calling POST /auth/login. On success,
   * stores the key in localStorage and updates the profile signal. When the
   * server rejects the key, any existing session is cleared; a transport
   * failure leaves the saved key alone so a retry does not cost the session.
   */
  login(apiKey: string): Observable<AuthProfile | null> {
    return this.http
      .post<AuthProfile>(`${API_V1}/auth/login`, {
        apiKey: apiKey.trim(),
      })
      .pipe(
        tap((profile) => {
          this.apiKeySignal.set(apiKey.trim());
          this.profileSignal.set(profile);
          if (isPlatformBrowser(this.platformId)) {
            localStorage.setItem(STORAGE_KEY, apiKey.trim());
          }
          this.syncTimezone();
        }),
        catchError((error: unknown) => {
          // 400 is the login endpoint itself refusing the submitted key; a
          // lost call (status 0) is not a rejection and keeps the saved key.
          const rejected =
            error instanceof HttpErrorResponse &&
            (error.status === 400 || SessionService.isKeyRejection(error));
          if (rejected) {
            this.logout();
          }
          return of(null);
        }),
      );
  }

  /**
   * Clears the session: removes the key from memory and localStorage,
   * resets the profile signal, and redirects to /login.
   */
  logout(): void {
    this.clearSession();
    this.router.navigate(['/login']);
  }

  /**
   * Called when a request returns 401 (key expired/revoked). Clears the
   * session and redirects to /login without showing an error.
   */
  expire(): void {
    this.clearSession();
    this.router.navigate(['/login']);
  }

  /**
   * Keeps the stored user time zone in sync with the browser one: reads the
   * browser IANA zone and, when it differs from the profile value, PATCHes
   * the self-service profile endpoint (the same one as the manual update).
   * Errors are swallowed — a failed sync never breaks the session. Browser
   * only: under SSR there is no browser time zone to read.
   */
  syncTimezone(): void {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }
    const current = this.profileSignal();
    if (!current) {
      return;
    }
    const browserTimezone =
      Intl.DateTimeFormat().resolvedOptions().timeZone ?? null;
    if (!browserTimezone || current.user.timezone === browserTimezone) {
      return;
    }

    this.http
      .patch<AuthProfile>(
        `${API_V1}/auth/me`,
        { timezone: browserTimezone },
        { headers: { 'x-api-key': this.apiKeySignal() ?? '' } },
      )
      .pipe(catchError(() => of(null)))
      .subscribe((profile) => {
        if (profile) {
          this.profileSignal.set(profile);
        }
      });
  }

  /**
   * Calls POST /telegram/launch and opens the returned t.me deep-link.
   * Errors are silently swallowed (the button simply does nothing on failure).
   */
  launchTelegram(): void {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }
    this.http
      .post<{ url: string; token: string }>(
        `${API_V1}/telegram/launch`,
        {},
        { headers: { 'x-api-key': this.apiKeySignal() ?? '' } },
      )
      .pipe(catchError(() => of(null)))
      .subscribe((result) => {
        if (result?.url) {
          window.open(result.url, '_blank');
        }
      });
  }

  /**
   * Restores the session from a key saved in the browser: validates it against
   * `GET /auth/me` and settles `whenReady()`. Only a key the server rejects
   * (401/403) is dropped; any other failure — backend down, 4xx/5xx from a
   * proxy — keeps it, so a reload during a temporary outage does not force the
   * user to type the key again.
   */
  private restoreStoredKey(apiKey: string): void {
    this.http
      .get<AuthProfile>(`${API_V1}/auth/me`, {
        headers: { 'x-api-key': apiKey },
      })
      .pipe(
        timeout(RESTORE_TIMEOUT_MS),
        tap((profile) => {
          this.profileSignal.set(profile);
          this.syncTimezone();
        }),
        catchError((error: unknown) => {
          if (SessionService.isKeyRejection(error)) {
            this.clearSession();
          }
          return of(null);
        }),
        finalize(() => this.markReady()),
      )
      .subscribe();
  }

  /** Signals the guards that the session state after a page load is final. */
  private markReady(): void {
    this.ready$.next();
  }

  /** Whether the server itself rejected the key (as opposed to a lost call). */
  private static isKeyRejection(error: unknown): boolean {
    return (
      error instanceof HttpErrorResponse &&
      (error.status === 401 || error.status === 403)
    );
  }

  /** Drops the in-memory session and the key saved in the browser. */
  private clearSession(): void {
    this.apiKeySignal.set(null);
    this.profileSignal.set(null);
    if (isPlatformBrowser(this.platformId)) {
      localStorage.removeItem(STORAGE_KEY);
    }
  }
}
