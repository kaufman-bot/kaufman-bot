import { firstValueFrom, take, toArray } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { ChatEvent, ChatEventsService } from './chat-events.service.js';

describe('ChatEventsService', () => {
  const makeEvent = (overrides: Partial<ChatEvent> = {}): ChatEvent => ({
    conversationId: 'conv-1',
    messageId: 'msg-1',
    senderRole: 'USER',
    content: 'Hello',
    createdAt: new Date().toISOString(),
    ...overrides,
  });

  it('should emit published events to subscribers', async () => {
    const service = new ChatEventsService();
    const event = makeEvent();

    const promise = firstValueFrom(service.streamAll());
    service.publish(event);

    const received = await promise;
    expect(received).toEqual(event);
  });

  it('should filter events by conversationId', async () => {
    const service = new ChatEventsService();
    const event1 = makeEvent({ conversationId: 'conv-1', messageId: 'msg-1' });
    const event2 = makeEvent({ conversationId: 'conv-2', messageId: 'msg-2' });
    const event3 = makeEvent({ conversationId: 'conv-1', messageId: 'msg-3' });

    const stream$ = service
      .streamByConversation('conv-1')
      .pipe(take(2), toArray());
    const collected = firstValueFrom(stream$);

    service.publish(event1);
    service.publish(event2); // Should be filtered out
    service.publish(event3);

    const received = await collected;
    expect(received).toHaveLength(2);
    expect(received[0].messageId).toBe('msg-1');
    expect(received[1].messageId).toBe('msg-3');
  });

  it('should emit all events regardless of conversation', async () => {
    const service = new ChatEventsService();
    const event1 = makeEvent({ conversationId: 'conv-1' });
    const event2 = makeEvent({ conversationId: 'conv-2' });

    const stream$ = service.streamAll().pipe(take(2), toArray());
    const collected = firstValueFrom(stream$);

    service.publish(event1);
    service.publish(event2);

    const received = await collected;
    expect(received).toHaveLength(2);
  });

  it('should map events before emitting', async () => {
    const service = new ChatEventsService();
    const event = makeEvent({ content: 'Test message' });

    const stream$ = service.streamMapped((e) => ({
      text: e.content,
      from: e.senderRole,
    }));
    const promise = firstValueFrom(stream$);

    service.publish(event);

    const received = await promise;
    expect(received).toEqual({ text: 'Test message', from: 'USER' });
  });

  it('should complete the subject on module destroy', () => {
    const service = new ChatEventsService();
    const completeSpy = vi.spyOn(service['subject'], 'complete');

    service.onModuleDestroy();

    expect(completeSpy).toHaveBeenCalled();
  });

  it('should not emit events published before subscription', async () => {
    const service = new ChatEventsService();
    const oldEvent = makeEvent({ messageId: 'old' });
    const newEvent = makeEvent({ messageId: 'new' });

    service.publish(oldEvent); // Published before subscription

    const stream$ = service.streamAll().pipe(take(1));
    const promise = firstValueFrom(stream$);

    service.publish(newEvent); // Published after subscription

    const received = await promise;
    expect(received.messageId).toBe('new');
  });
});
