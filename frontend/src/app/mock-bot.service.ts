import { HttpClient } from '@angular/common/http';
import { inject, Injectable, signal } from '@angular/core';
import { catchError, map, Observable, of, switchMap, timer } from 'rxjs';
import { SessionService } from './session.service';

const API_V1 = '/api/v1';

/** Inline keyboard button; matches backend `KeyboardButtonDto`. */
export interface KeyboardButton {
  title: string;
  callbackData: string;
}

/** Reusable named button set owned by the calling ADMIN. */
export interface ButtonPreset {
  id: string;
  name: string;
  buttons: KeyboardButton[];
  ownerId: string;
  createdAt: string;
  updatedAt: string;
}

export interface ConversationSummary {
  id: string;
  userId: string;
  userEmail: string;
  lastMessage: string | null;
  lastMessageSenderRole: 'USER' | 'BOT' | null;
  lastMessageAt: string | null;
  unreadCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ConversationMessage {
  id: string;
  conversationId: string;
  senderRole: 'USER' | 'BOT';
  content: string;
  /** Inline keyboard snapshot (null when the reply was text-only). */
  buttons: KeyboardButton[] | null;
  readAt: string | null;
  createdAt: string;
}

export interface MockBotStreamEvent {
  messageId: string;
  conversationId: string;
  userId: string;
  senderRole: 'USER' | 'BOT';
  content: string;
  buttons?: KeyboardButton[] | null;
  createdAt: string;
}

/**
 * Service for the mock-bot operator console. Handles listing conversations,
 * viewing message history, sending bot replies, and SSE stream for real-time
 * updates across all conversations.
 */
@Injectable({ providedIn: 'root' })
export class MockBotService {
  private http = inject(HttpClient);
  private session = inject(SessionService);

  /** List of all conversations (sorted by activity). */
  readonly conversations = signal<ConversationSummary[]>([]);

  /** Messages for the currently selected conversation. */
  readonly messages = signal<ConversationMessage[]>([]);

  /** The userId of the currently selected conversation. */
  readonly selectedUserId = signal<string | null>(null);

  /**
   * Presets owned by the calling ADMIN. Loaded once on console init via
   * `listPresets` and mutated locally by `createPreset` / `updatePreset` /
   * `deletePreset`; the console never sees foreign presets because the
   * backend filters by `ownerId`.
   */
  readonly presets = signal<ButtonPreset[]>([]);

  /** Whether the SSE connection is active. */
  readonly connected = signal(false);

  private eventSource: EventSource | null = null;
  private readonly reconnectDelay = 3000;

  /**
   * Fetches all conversations from GET /api/v1/mock-bot/conversations.
   */
  loadConversations(): Observable<ConversationSummary[]> {
    return this.http
      .get<ConversationSummary[]>(`${API_V1}/mock-bot/conversations`)
      .pipe(catchError(() => of([])));
  }

  /**
   * Fetches messages for a specific user's conversation.
   * GET /api/v1/mock-bot/conversations/:userId/messages
   */
  loadMessages(userId: string): Observable<ConversationMessage[]> {
    return this.http
      .get<
        ConversationMessage[]
      >(`${API_V1}/mock-bot/conversations/${userId}/messages`)
      .pipe(catchError(() => of([])));
  }

  /**
   * Sends a bot reply to a user's conversation. Both `content` and
   * `buttons` are optional here but the backend requires at least one
   * non-empty; the console validates before calling.
   * POST /api/v1/mock-bot/conversations/:userId/messages
   */
  sendReply(
    userId: string,
    content: string,
    buttons?: KeyboardButton[],
  ): Observable<ConversationMessage | null> {
    const body: Record<string, unknown> = { content: content.trim() };
    if (buttons && buttons.length > 0) {
      body['buttons'] = buttons;
    }
    return this.http
      .post<ConversationMessage>(
        `${API_V1}/mock-bot/conversations/${userId}/messages`,
        body,
      )
      .pipe(catchError(() => of(null)));
  }

  /**
   * Lists presets owned by the calling ADMIN. Errors resolve to `[]` so
   * a transient outage does not blank the console UI.
   */
  listPresets(): Observable<ButtonPreset[]> {
    return this.http
      .get<ButtonPreset[]>(`${API_V1}/mock-bot/presets`)
      .pipe(catchError(() => of([])));
  }

  /** Creates a preset from `name` + `buttons` (backend enforces 1..12). */
  createPreset(
    name: string,
    buttons: KeyboardButton[],
  ): Observable<ButtonPreset | null> {
    return this.http
      .post<ButtonPreset>(`${API_V1}/mock-bot/presets`, { name, buttons })
      .pipe(catchError(() => of(null)));
  }

  /** Patches name and/or buttons of a preset the caller owns. */
  updatePreset(
    id: string,
    body: { name?: string; buttons?: KeyboardButton[] },
  ): Observable<ButtonPreset | null> {
    return this.http
      .patch<ButtonPreset>(`${API_V1}/mock-bot/presets/${id}`, body)
      .pipe(catchError(() => of(null)));
  }

  /** Deletes a caller-owned preset; already-sent messages keep buttons. */
  deletePreset(id: string): Observable<boolean> {
    return this.http.delete<void>(`${API_V1}/mock-bot/presets/${id}`).pipe(
      map(() => true),
      catchError(() => of(false)),
    );
  }

  /**
   * Selects a conversation by userId and loads its messages.
   */
  selectConversation(userId: string): void {
    this.selectedUserId.set(userId);
    this.loadMessages(userId).subscribe((msgs) => {
      this.messages.set(msgs);
    });
  }

  /**
   * Opens SSE connection to /api/v1/mock-bot/stream?apiKey=...
   * Emits events for all conversations (any user).
   */
  connectStream(): Observable<MockBotStreamEvent> {
    this.disconnectStream();

    const apiKey = this.session.apiKey();
    if (!apiKey) {
      return of();
    }

    return new Observable<MockBotStreamEvent>((subscriber) => {
      const url = `${API_V1}/mock-bot/stream?apiKey=${encodeURIComponent(apiKey)}`;
      const es = new EventSource(url);
      this.eventSource = es;
      this.connected.set(true);

      es.onmessage = (event) => {
        try {
          const data: MockBotStreamEvent = JSON.parse(event.data);
          subscriber.next(data);
        } catch {
          // Ignore malformed events
        }
      };

      es.onerror = () => {
        this.connected.set(false);
        es.close();
        this.eventSource = null;

        // Reconnect after delay
        timer(this.reconnectDelay)
          .pipe(
            switchMap(() => {
              if (this.session.apiKey()) {
                return this.connectStream();
              }
              return of();
            }),
          )
          .subscribe({
            next: (evt) => subscriber.next(evt as MockBotStreamEvent),
            error: (err) => subscriber.error(err),
          });
      };

      return () => {
        this.disconnectStream();
      };
    });
  }

  /**
   * Closes the SSE connection.
   */
  disconnectStream(): void {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
      this.connected.set(false);
    }
  }
}
