import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { X_API_KEY } from '../constants/api-key.constants.js';
import { ApiKey, User } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';

/** Request payload attached by the ApiKeyGuard after successful validation. */
export interface AuthenticatedRequest {
  headers: Record<string, string | string[] | undefined>;
  /** Express-style request URL (Fastify would use `raw.url`). */
  originalUrl?: string;
  url?: string;
  authUser?: User;
  authApiKey?: ApiKey;
}

/** User attached by ApiKeyGuard; guards always run before the handler. */
export function requireAuthUser(req: AuthenticatedRequest): User {
  if (!req.authUser) {
    throw new UnauthorizedException('Unauthenticated request');
  }

  return req.authUser;
}

/** API key attached by ApiKeyGuard that authenticated the request. */
export function requireAuthApiKey(req: AuthenticatedRequest): ApiKey {
  if (!req.authApiKey) {
    throw new UnauthorizedException('Unauthenticated request');
  }

  return req.authApiKey;
}

/**
 * Validates the `x-api-key` header (or `?apiKey=` query param for SSE clients
 * like browser EventSource, which cannot set headers) against the api_keys
 * table and attaches the resolved user/key to the request.
 */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const headerKey = req.headers[X_API_KEY];
    const provided =
      typeof headerKey === 'string' && headerKey.length > 0
        ? headerKey
        : new URL(this.getRequestUrl(req)).searchParams.get('apiKey') || '';

    if (!provided) {
      throw new UnauthorizedException('API key is required');
    }

    const apiKey = await this.prisma.apiKey.findUnique({
      where: { key: provided },
      include: { user: true },
    });

    if (!apiKey || !apiKey.isActive) {
      throw new UnauthorizedException('Invalid API key');
    }
    if (apiKey.expiresAt && apiKey.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedException('API key expired');
    }
    if (!apiKey.user.isActive) {
      throw new UnauthorizedException('User is inactive');
    }

    req.authUser = apiKey.user;
    req.authApiKey = apiKey;
    return true;
  }

  private getRequestUrl(req: AuthenticatedRequest): string {
    return `http://localhost${req.originalUrl ?? req.url ?? ''}`;
  }
}
