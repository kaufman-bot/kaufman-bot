import { isPlatformBrowser } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import {
  computed,
  inject,
  Injectable,
  PLATFORM_ID,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';
import { catchError, Observable, of, tap } from 'rxjs';

const API_BASE = '/api';
const API_V1 = `${API_BASE}/v1`;

const STORAGE_KEY = 'kaufman_bot_api_key';

export interface AuthProfileUser {
  id: string;
  email: string;
  role: 'USER' | 'ADMIN' | 'GUEST';
  isActive: boolean;
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
 * for components to observe.
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

  constructor() {
    // Restore session from localStorage on init (browser-only)
    if (isPlatformBrowser(this.platformId)) {
      const storedKey = localStorage.getItem(STORAGE_KEY);
      if (storedKey) {
        this.apiKeySignal.set(storedKey);
        // Validate the stored key by fetching profile
        this.validateStoredKey(storedKey);
      }
    }
  }

  /**
   * Logs in with the given API key by calling POST /auth/login. On success,
   * stores the key in localStorage and updates the profile signal. On failure,
   * clears any existing session.
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
        }),
        catchError((err) => {
          this.logout();
          return of(null);
        }),
      );
  }

  /**
   * Clears the session: removes the key from memory and localStorage,
   * resets the profile signal, and redirects to /login.
   */
  logout(): void {
    this.apiKeySignal.set(null);
    this.profileSignal.set(null);
    if (isPlatformBrowser(this.platformId)) {
      localStorage.removeItem(STORAGE_KEY);
    }
    this.router.navigate(['/login']);
  }

  /**
   * Called when a request returns 401 (key expired/revoked). Clears the
   * session and redirects to /login without showing an error.
   */
  expire(): void {
    this.apiKeySignal.set(null);
    this.profileSignal.set(null);
    if (isPlatformBrowser(this.platformId)) {
      localStorage.removeItem(STORAGE_KEY);
    }
    this.router.navigate(['/login']);
  }

  /**
   * Validates a stored key by fetching the profile. If the key is invalid,
   * clears the session.
   */
  private validateStoredKey(apiKey: string): void {
    this.http
      .get<AuthProfile>(`${API_V1}/auth/me`, {
        headers: { 'x-api-key': apiKey },
      })
      .subscribe({
        next: (profile) => this.profileSignal.set(profile),
        error: () => {
          // Stored key is invalid; clear session
          this.apiKeySignal.set(null);
          if (isPlatformBrowser(this.platformId)) {
            localStorage.removeItem(STORAGE_KEY);
          }
        },
      });
  }
}
