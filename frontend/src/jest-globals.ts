// jsdom does not implement EventSource, but DashboardService opens an SSE
// stream in its constructor. Provide a minimal offline stub for unit tests.
//
// Loaded via jest.config.js `setupFiles` (runs before the test framework is
// installed), so the stub is available on globalThis for every test.
class EventSourceStub {
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onopen: ((event: Event) => void) | null = null;

  close(): void {}
}

(globalThis as Record<string, unknown>)['EventSource'] = EventSourceStub;
