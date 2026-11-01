import { HttpClient } from '@angular/common/http';
import { inject, Injectable, signal } from '@angular/core';
import { catchError, Observable, of, switchMap, timer } from 'rxjs';
import { SessionService } from './session.service';

const API_V1 = '/api/v1';

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
  readAt: string | null;
  createdAt: string;
}

export interface MockBotStreamEvent {
  messageId: string;
  conversationId: string;
  userId: string;
  senderRole: 'USER' | 'BOT';
  content: string;
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
   * Sends a bot reply to a user's conversation.
   * POST /api/v1/mock-bot/conversations/:userId/messages
   */
  sendReply(
    userId: string,
    content: string,
  ): Observable<ConversationMessage | null> {
    return this.http
      .post<ConversationMessage>(
        `${API_V1}/mock-bot/conversations/${userId}/messages`,
        { content: content.trim() },
      )
      .pipe(catchError(() => of(null)));
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
