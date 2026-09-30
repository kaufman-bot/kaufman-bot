import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Role } from '../generated/prisma/client.js';
import type { AuthenticatedRequest } from './api-key.guard.js';

/**
 * Allows only administrators. Must run after ApiKeyGuard, which fills
 * `req.authUser` — without it every request is rejected.
 */
@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();

    if (req.authUser?.role !== Role.ADMIN) {
      throw new ForbiddenException('Admin access required');
    }

    return true;
  }
}
