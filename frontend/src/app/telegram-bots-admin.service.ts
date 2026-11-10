import { HttpClient } from '@angular/common/http';
import { inject, Injectable, signal } from '@angular/core';
import { catchError, finalize, Observable, of, tap, throwError } from 'rxjs';
import { describeApiError } from './utils/api-error';

const API_V1 = '/api/v1';

export interface TelegramBot {
  id: string;
  name: string;
  botToken: string; // masked on read
  botUsername: string | null;
  isActive: boolean;
  settings: Record<string, unknown> | null;
  ownerId: string;
  createdAt: string;
  updatedAt: string;
}

export interface AdminUser {
  id: string;
  email: string;
  role: string;
  isActive: boolean;
  /** Assigned Telegram bot target, or null when the user talks to the mock server. */
  telegramBotId?: string | null;
}

/**
 * HTTP service for the admin Telegram-bot management screen.
 */
@Injectable({ providedIn: 'root' })
export class TelegramBotsAdminService {
  private http = inject(HttpClient);

  /** Reactive list of caller-owned bots. */
  readonly bots = signal<TelegramBot[]>([]);

  /** Reactive list of all users (for target assignment). */
  readonly users = signal<AdminUser[]>([]);

  /** Per-user id of an in-flight target assignment (`true` = saving). */
  readonly savingTargets = signal<Record<string, boolean>>({});

  /** Per-user human-readable reason of the last failed target assignment. */
  readonly targetErrors = signal<Record<string, string | null>>({});

  loading = signal(false);

  fetchBots(): void {
    this.loading.set(true);
    this.http
      .get<TelegramBot[]>(`${API_V1}/telegram/bots`)
      .pipe(
        catchError(() => of([] as TelegramBot[])),
        tap(() => this.loading.set(false)),
      )
      .subscribe((bots) => this.bots.set(bots));
  }

  createBot(body: {
    name: string;
    botToken: string;
    botUsername?: string;
    settings?: Record<string, unknown> | null;
    isActive?: boolean;
  }): void {
    this.http
      .post<TelegramBot>(`${API_V1}/telegram/bots`, body)
      .pipe(catchError(() => of(null)))
      .subscribe(() => this.fetchBots());
  }

  updateBot(
    id: string,
    body: Partial<{
      name: string;
      botToken: string;
      botUsername: string | null;
      isActive: boolean;
      settings: Record<string, unknown> | null;
    }>,
  ): void {
    this.http
      .patch<TelegramBot>(`${API_V1}/telegram/bots/${id}`, body)
      .pipe(catchError(() => of(null)))
      .subscribe(() => this.fetchBots());
  }

  deleteBot(id: string): void {
    this.http
      .delete<void>(`${API_V1}/telegram/bots/${id}`)
      .pipe(catchError(() => of(null)))
      .subscribe(() => this.fetchBots());
  }

  fetchUsers(): void {
    this.http
      .get<{ items: AdminUser[] }>(`${API_V1}/admin/users`)
      .pipe(catchError(() => of({ items: [] })))
      .subscribe((res) => this.users.set(res.items));
  }

  /**
   * Assigns (or resets to mock-server) the user's Telegram bot. Returns the
   * request observable so the caller can decide what to do with the pending
   * row selection: on success the `users` list is patched in place (the
   * endpoint answers `200` with an empty body, so there is nothing to re-read),
   * on failure the mapped reason lands in `targetErrors` and the error is
   * rethrown for the caller to keep its choice.
   */
  setTarget(userId: string, telegramBotId: string | null): Observable<void> {
    this.savingTargets.update((s) => ({ ...s, [userId]: true }));

    return this.http
      .put<void>(`${API_V1}/admin/users/${userId}/telegram-target`, {
        telegramBotId,
      })
      .pipe(
        tap(() => {
          this.users.update((list) =>
            list.map((user) =>
              user.id === userId ? { ...user, telegramBotId } : user,
            ),
          );
          this.targetErrors.update((e) => ({ ...e, [userId]: null }));
        }),
        catchError((error: unknown) => {
          this.targetErrors.update((e) => ({
            ...e,
            [userId]: describeApiError(error),
          }));
          return throwError(() => error);
        }),
        finalize(() =>
          this.savingTargets.update((s) => ({ ...s, [userId]: false })),
        ),
      );
  }
}
