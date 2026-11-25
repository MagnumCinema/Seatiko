import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { AuthGuard } from './auth.guard.js';
import { TokenService } from './token.service.js';

/** Tokens and the global auth guard. Secrets come from ConfigService per call. */
@Global()
@Module({
  imports: [JwtModule.register({})],
  providers: [TokenService, { provide: APP_GUARD, useClass: AuthGuard }],
  exports: [TokenService],
})
export class AuthCoreModule {}
