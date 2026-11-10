import { inject } from '@angular/core';
import {
  ActivatedRouteSnapshot,
  CanActivateFn,
  Router,
  RouterStateSnapshot,
} from '@angular/router';
import { map } from 'rxjs';
import { SessionService } from './session.service';

/**
 * Route guard that requires an active session. Redirects to /login if the
 * user is not authenticated, preserving the attempted URL in returnUrl.
 *
 * Every guard first waits for `SessionService.whenReady()`: after a page
 * reload the saved key is validated asynchronously, and deciding on the spot
 * would send a logged-in user to /login just to make them type the key again.
 */
export const requireAuthGuard: CanActivateFn = (
  route: ActivatedRouteSnapshot,
  state: RouterStateSnapshot,
) => {
  const session = inject(SessionService);
  const router = inject(Router);

  return session.whenReady().pipe(
    map(() =>
      session.isAuthenticated()
        ? true
        : router.createUrlTree(['/login'], {
            queryParams: { returnUrl: state.url },
          }),
    ),
  );
};

/**
 * Route guard that requires ADMIN role. Redirects to /login if not
 * authenticated, or to /chat (user home) if authenticated but not admin.
 */
export const requireAdminGuard: CanActivateFn = (
  route: ActivatedRouteSnapshot,
  state: RouterStateSnapshot,
) => {
  const session = inject(SessionService);
  const router = inject(Router);

  return session.whenReady().pipe(
    map(() => {
      if (!session.isAuthenticated()) {
        return router.createUrlTree(['/login'], {
          queryParams: { returnUrl: state.url },
        });
      }

      if (session.isAdmin()) {
        return true;
      }

      // Authenticated but not admin; redirect to user chat
      return router.createUrlTree(['/chat']);
    }),
  );
};

/**
 * Route guard that redirects authenticated users away from /login to their
 * appropriate home page (/chat for USER, /mock-bot for ADMIN).
 */
export const redirectIfAuthenticatedGuard: CanActivateFn = () => {
  const session = inject(SessionService);
  const router = inject(Router);

  return session.whenReady().pipe(
    map(() => {
      if (!session.isAuthenticated()) {
        return true;
      }

      // Already authenticated; redirect to appropriate home
      if (session.isAdmin()) {
        return router.createUrlTree(['/mock-bot']);
      }
      return router.createUrlTree(['/chat']);
    }),
  );
};
