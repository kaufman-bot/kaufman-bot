import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Observable, Subject } from 'rxjs';
import { filter, map } from 'rxjs/operators';
import { KeyboardButtonDto } from '../dto/keyboard.dto.js';

/**
 * Shape of a chat event published through the bus. The `conversationId`
 * identifies the dialogue the message belongs to; consumers filter by it.
 *
 * `kind` distinguishes ordinary messages (`TEXT`, default when omitted by
 * a legacy publisher) from button callbacks (`BUTTON`). The user-side SSE
 * stream suppresses `BUTTON` events so a click does not echo back into the
 * clicking user's own chat. The operator console keeps them and renders
 * them as ordinary USER messages.
 *
 * `buttons` is the inline keyboard attached to a BOT message. Null/omitted
 * for text-only replies and for USER messages.
 */
export interface ChatEvent {
  conversationId: string;
  messageId: string;
  senderRole: 'USER' | 'BOT';
  content: string;
  createdAt: string;
  kind?: 'TEXT' | 'BUTTON';
  buttons?: KeyboardButtonDto[] | null;
}

/**
 * In-memory event bus for real-time chat message delivery. Both ChatService
 * (user sends a message) and MockBotService (operator replies) publish events
 * here after writing to the database; SSE endpoints subscribe to filtered
 * observables.
 *
 * The Subject is hot — subscribers only receive events published after they
 * subscribe. This is intentional: SSE clients reconnect and reload history
 * via REST, so missed events during disconnection are recovered.
 */
@Injectable()
export class ChatEventsService implements OnModuleDestroy {
  // In-memory only: events do not survive a restart and do not reach other
  // instances in cluster mode (clients compensate by reloading history on
  // SSE reconnect). After Redis is adopted, move delivery to a real event
  // bus / queue — see BACKLOG.md.
  private readonly subject = new Subject<ChatEvent>();

  /**
   * Publishes a new chat event. Called by use-case services after persisting
   * the message to the database.
   */
  publish(event: ChatEvent): void {
    this.subject.next(event);
  }

  /**
   * Returns an Observable that emits only events for the given conversation.
   * Used by SSE endpoints to stream messages to connected clients.
   */
  streamByConversation(conversationId: string): Observable<ChatEvent> {
    return this.subject
      .asObservable()
      .pipe(filter((event) => event.conversationId === conversationId));
  }

  /**
   * Returns an Observable that emits all chat events regardless of
   * conversation. Used by the mock-bot console SSE endpoint to stream
   * messages from all users.
   */
  streamAll(): Observable<ChatEvent> {
    return this.subject.asObservable();
  }

  /**
   * Maps a chat event to a different shape before emitting. Useful for
   * SSE endpoints that need to wrap events in SseMessageEvent<T>.
   */
  streamMapped<T>(mapFn: (event: ChatEvent) => T): Observable<T> {
    return this.subject.asObservable().pipe(map(mapFn));
  }

  onModuleDestroy(): void {
    this.subject.complete();
  }
}
