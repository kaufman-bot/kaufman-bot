import type { ApiErrorDto } from '../generated/client/types.gen.js';

/** Shape shared by every generated SDK result (throwOnError is false). */
export type SdkResult<T> = {
  data?: T;
  error?: ApiErrorDto;
  response?: Response;
};

/**
 * Rejection reason of a non-2xx body. Nest sends `message` either as a string
 * or as an array of strings (validation errors).
 */
export function messageOf(error: unknown): string {
  const body = error as ApiErrorDto | null | undefined;
  return Array.isArray(body?.message)
    ? body.message.join('; ')
    : (body?.message ?? '');
}

/**
 * Unwraps a fixture call that must succeed. Tests are not allowed to touch the
 * database, so fixtures are prepared over HTTP — this is where a failed
 * preparation is turned into a readable error.
 */
export function unwrap<T>(result: SdkResult<T>, what: string): T {
  if (result.data === undefined) {
    throw new Error(
      `${what} failed with ${result.response?.status ?? 'no response'}: ${messageOf(result.error)}`,
    );
  }

  return result.data;
}
