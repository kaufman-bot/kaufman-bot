import { inject } from '@angular/core';
import {
  ActivatedRouteSnapshot,
  CanActivateFn,
  Router,
  RouterStateSnapshot,
} from '@angular/router';
import { SessionService } from './session.service';

/**
 * Route guard that requires an active session. Redirects to /login if the
 * user is not authenticated, preserving the attempted URL in returnUrl.
 */
export const requireAuthGuard: CanActivateFn = (
  route: ActivatedRouteSnapshot,
  state: RouterStateSnapshot,
) => {
  const session = inject(SessionService);
  const router = inject(Router);

  if (session.isAuthenticated()) {
    return true;
  }

  // Not authenticated; redirect to login with returnUrl
  return router.createUrlTree(['/login'], {
    queryParams: { returnUrl: state.url },
  });
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
};

/**
 * Route guard that redirects authenticated users away from /login to their
 * appropriate home page (/chat for USER, /mock-bot for ADMIN).
 */
export const redirectIfAuthenticatedGuard: CanActivateFn = () => {
  const session = inject(SessionService);
  const router = inject(Router);

  if (!session.isAuthenticated()) {
    return true;
  }

  // Already authenticated; redirect to appropriate home
  if (session.isAdmin()) {
    return router.createUrlTree(['/mock-bot']);
  }
  return router.createUrlTree(['/chat']);
};
