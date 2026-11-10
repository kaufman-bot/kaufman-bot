import { HttpErrorResponse } from '@angular/common/http';

/**
 * Maps an HTTP failure to a human-readable Russian message so the UI never
 * collapses "backend is down" and "your key is wrong" into the same text.
 *
 * The backend answers 4xx with an `ApiErrorDto` body carrying a
 * human-readable `message`, so anything not covered by the well-known
 * status codes below is shown verbatim.
 */
export function describeApiError(error: unknown): string {
  if (!(error instanceof HttpErrorResponse)) {
    return 'Неизвестная ошибка — попробуйте ещё раз.';
  }

  // No response at all: the request never reached the backend (server down,
  // dev-proxy failure, network/CORS problem).
  if (error.status === 0) {
    return 'Сервер недоступен — проверьте, что бэкенд запущен';
  }

  if (error.status === 401 || error.status === 403) {
    return 'API-ключ недействителен, отозван или истёк';
  }

  if (error.status === 404) {
    return 'Ресурс не найден';
  }

  if (error.status >= 500) {
    return 'Ошибка на сервере, попробуйте позже';
  }

  return extractBodyMessage(error.error) ?? `Ошибка запроса (${error.status})`;
}

/** Pulls the `message` out of an `ApiErrorDto` body (string or string[]). */
function extractBodyMessage(body: unknown): string | null {
  if (!body || typeof body !== 'object') {
    return null;
  }

  const message = (body as { message?: unknown }).message;
  if (typeof message === 'string' && message.trim()) {
    return message.trim();
  }
  if (Array.isArray(message) && message.length > 0) {
    const parts = message.filter(
      (item): item is string => typeof item === 'string' && !!item.trim(),
    );
    if (parts.length > 0) {
      return parts.join(', ');
    }
  }
  return null;
}
