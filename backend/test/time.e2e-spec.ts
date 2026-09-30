import { lastValueFrom, take, toArray } from 'rxjs';
import type {
  ServerTimeDto,
  TimeControllerStreamV1Data,
} from './generated/client/types.gen.js';
import { ActivityHelper } from './utils/activity-helper.js';

/** Single time format of the API: ISO-8601 string with millisecond precision. */
const ISO_8601 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

describe('Time (e2e, running backend)', () => {
  const activity = new ActivityHelper();
  const streamUrl: TimeControllerStreamV1Data['url'] = '/api/v1/time/stream';

  beforeAll(async () => {
    await activity.ensureBackendRunning();
  });

  it('GET /api/v1/time returns the server time as an ISO-8601 string', async () => {
    const result = await activity.sdk.timeControllerTimeV1();

    expect(result.response?.status).toBe(200);
    expect(result.data?.time).toMatch(ISO_8601);
  });

  it('SSE /api/v1/time/stream emits ServerTimeDto events', async () => {
    const events = await lastValueFrom(
      activity.sse<ServerTimeDto>({ url: streamUrl }).pipe(take(2), toArray()),
    );

    expect(events).toHaveLength(2);
    for (const event of events) {
      expect(event.time).toMatch(ISO_8601);
    }
  });

  it('REST and SSE return the time in one and the same format', async () => {
    const rest = await activity.sdk.timeControllerTimeV1();
    const stream = await lastValueFrom(
      activity.sse<ServerTimeDto>({ url: streamUrl }).pipe(take(1)),
    );

    expect(rest.data?.time).toMatch(ISO_8601);
    expect(stream.time).toMatch(ISO_8601);
    expect(
      Math.abs(+new Date(stream.time) - +new Date(rest.data!.time)),
    ).toBeLessThan(60_000);
  });
});
