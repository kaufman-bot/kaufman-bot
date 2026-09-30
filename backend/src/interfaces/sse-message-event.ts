import { MessageEvent } from '@nestjs/common';

/**
 * SSE message event with a typed `data` payload.
 * `MessageEvent` from @nestjs/common is not generic, so we narrow `data`
 * to the DTO emitted by the stream handler.
 */
export interface SseMessageEvent<T extends object> extends MessageEvent {
  data: T;
}
