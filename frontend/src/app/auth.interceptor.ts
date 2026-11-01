import {
  HttpErrorResponse,
  HttpEvent,
  HttpHandlerFn,
  HttpInterceptorFn,
  HttpRequest,
} from '@angular/common/http';
import { inject } from '@angular/core';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { SessionService } from './session.service';

/**
 * Functional HTTP interceptor that:
 * 1. Attaches the x-api-key header to all requests to /api (if a key is stored)
 * 2. Catches 401 responses and calls SessionService.expire() to clear the session
 *    and redirect to /login
 *
 * This interceptor is registered in app.config.ts via withInterceptors().
 */
export const authInterceptor: HttpInterceptorFn = (
  req: HttpRequest<unknown>,
  next: HttpHandlerFn,
): Observable<HttpEvent<unknown>> => {
  const session = inject(SessionService);

  // Only attach the key to requests going to /api
  if (req.url.startsWith('/api') && session.apiKey()) {
    req = req.clone({
      setHeaders: {
        'x-api-key': session.apiKey()!,
      },
    });
  }

  return next(req).pipe(
    catchError((error: HttpErrorResponse) => {
      // If we get a 401, the key is invalid/expired/revoked
      if (error.status === 401) {
        session.expire();
      }
      return throwError(() => error);
    }),
  );
};
