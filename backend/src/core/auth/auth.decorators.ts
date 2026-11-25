import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import type { Request } from 'express';

export const IS_PUBLIC = 'seatiko:public';
export const ROLES = 'seatiko:roles';

export type Role = 'guest' | 'restaurant' | 'staff' | 'admin';

/** The route needs no token (catalogue, map, sign-in…). */
export const Public = () => SetMetadata(IS_PUBLIC, true);

/** Only these roles may call the route (checked against the stored user, not the token). */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES, roles);

/** The signed-in user on a request, set by AuthGuard. */
export type AuthUser = { id: string; email: string };

export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthUser => {
  const req = ctx.switchToHttp().getRequest<Request & { user?: AuthUser }>();
  if (!req.user) throw new Error('CurrentUser used on a public route');
  return req.user;
});
