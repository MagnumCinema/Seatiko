import { CanActivate, ExecutionContext, Injectable, Optional } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { forbidden, unauthorized } from '../errors/domain-error.js';
import { AccountStatusPort } from './account-status.port.js';
import { IS_PUBLIC, ROLES, type AuthUser, type Role } from './auth.decorators.js';
import { TokenService } from './token.service.js';

/**
 * Global guard, same rules as the Go middleware chain:
 * no Bearer token → 401 auth_required; bad token → 401 invalid_token;
 * deleted account → 401 account_deleted; wrong role → 403 forbidden.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: TokenService,
    @Optional() private readonly accounts?: AccountStatusPort,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const targets = [ctx.getHandler(), ctx.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets)) return true;

    const req = ctx.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    const header = req.headers.authorization ?? '';
    if (!header.startsWith('Bearer ')) throw unauthorized('auth_required');
    const claims = await this.tokens.verify(header.slice('Bearer '.length));
    req.user = { id: claims.uid, email: claims.email };

    const roles = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES, targets);
    if (!this.accounts) return !roles?.length;
    const account = await this.accounts.lookup(claims.uid);
    if (!account) throw unauthorized('invalid_token');
    if (account.deleted) throw unauthorized('account_deleted');
    if (roles?.length && !roles.includes(account.role as Role)) throw forbidden();
    return true;
  }
}
