import { HttpClient } from '@angular/common/http';
import { inject, Injectable, signal } from '@angular/core';
import { catchError, Observable, of, switchMap, timer } from 'rxjs';
import { SessionService } from './session.service';

const API_V1 = '/api/v1';

/**
 * Inline keyboard button attached to a BOT message. Matches the backend
 * `KeyboardButtonDto` (title is what the user sees, callbackData is the
 * opaque payload sent back on click).
 */
export interface KeyboardButton {
  title: string;
  callbackData: string;
}

export interface ChatMessage {
  id: string;
  conversationId: string;
  senderRole: 'USER' | 'BOT';
  content: string;
  /**
   * Inline keyboard snapshot; null when the message was sent without
   * buttons (which is the case for every USER message and for text-only
   * BOT replies).
   */
  buttons: KeyboardButton[] | null;
  readAt: string | null;
  createdAt: string;
}

export interface ChatStreamEvent {
  messageId: string;
  conversationId: string;
  senderRole: 'USER' | 'BOT';
  content: string;
  buttons?: KeyboardButton[] | null;
  createdAt: string;
}

/**
 * Service for user chat with the bot. Handles HTTP requests for message
 * history and sending, plus SSE connection for real-time message delivery.
 * Reconnects automatically on connection loss.
 */
@Injectable({ providedIn: 'root' })
export class ChatService {
  private http = inject(HttpClient);
  private session = inject(SessionService);

  /** Reactive message history (ascending by createdAt). */
  readonly messages = signal<ChatMessage[]>([]);

  /** Whether the SSE connection is currently active. */
  readonly connected = signal(false);

  /**
   * Increments every time the stream successfully reopens after a drop.
   * Consumers use it to re-fetch the history: messages delivered while the
   * connection was down (e.g. during a backend restart) must still show up.
   */
  readonly reconnected = signal(0);

  /** The native EventSource instance (null when not connected). */
  private eventSource: EventSource | null = null;

  /** Reconnect delay in ms after connection loss. */
  private readonly reconnectDelay = 3000;

  /**
   * Loads the message history from GET /api/v1/chat/messages.
   * Replaces the current messages signal with the result.
   */
  loadHistory(): Observable<ChatMessage[]> {
    return this.http
      .get<ChatMessage[]>(`${API_V1}/chat/messages`)
      .pipe(catchError(() => of([])));
  }

  /**
   * Sends a message via POST /api/v1/chat/messages. Returns the created
   * message on success, null on failure.
   */
  sendMessage(content: string): Observable<ChatMessage | null> {
    return this.http
      .post<ChatMessage>(`${API_V1}/chat/messages`, {
        content: content.trim(),
      })
      .pipe(catchError(() => of(null)));
  }

  /**
   * Reports a keyboard-button press to the backend. Persists a
   * `kind=BUTTON` USER message that the operator console sees but the
   * clicking user never does (see backend ChatService filters). The
   * response is intentionally dropped — the frontend must NOT append it
   * to `messages()` because that would create the echo the specs forbid.
   * Errors are swallowed to `null` so a failed click never surfaces an
   * inline error and never disturbs the current chat state.
   */
  sendButtonCallback(callbackData: string): Observable<ChatMessage | null> {
    return this.http
      .post<ChatMessage>(`${API_V1}/chat/button-callbacks`, { callbackData })
      .pipe(catchError(() => of(null)));
  }

  /**
   * Opens an SSE connection to /api/v1/chat/stream?apiKey=... and subscribes
   * to incoming messages. Automatically reconnects on error/close.
   * Returns an Observable that emits stream events.
   */
  connectStream(isReconnect = false): Observable<ChatStreamEvent> {
    // Close existing connection if any
    this.disconnectStream();

    const apiKey = this.session.apiKey();
    if (!apiKey) {
      return of();
    }

    return new Observable<ChatStreamEvent>((subscriber) => {
      const url = `${API_V1}/chat/stream?apiKey=${encodeURIComponent(apiKey)}`;
      const es = new EventSource(url);
      this.eventSource = es;

      // Mark as connected only on a successful open; a reopen after a drop
      // also counts as a reconnect so consumers can reload the history.
      es.onopen = () => {
        this.connected.set(true);
        if (isReconnect) {
          this.reconnected.update((count) => count + 1);
        }
      };

      es.onmessage = (event) => {
        try {
          const data: ChatStreamEvent = JSON.parse(event.data);
          subscriber.next(data);
        } catch {
          // Ignore malformed events
        }
      };

      es.onerror = () => {
        this.connected.set(false);
        es.close();
        this.eventSource = null;

        // Schedule reconnect after delay
        timer(this.reconnectDelay)
          .pipe(
            switchMap(() => {
              // Only reconnect if still authenticated
              if (this.session.apiKey()) {
                return this.connectStream(true);
              }
              return of();
            }),
          )
          .subscribe({
            next: (evt) => subscriber.next(evt as ChatStreamEvent),
            error: (err) => subscriber.error(err),
          });
      };

      // Cleanup on unsubscribe
      return () => {
        this.disconnectStream();
      };
    });
  }

  /**
   * Closes the current SSE connection if open.
   */
  disconnectStream(): void {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
      this.connected.set(false);
    }
  }
}
