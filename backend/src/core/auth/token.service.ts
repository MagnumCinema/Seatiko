import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { Env } from '../../config/env.schema.js';
import { unauthorized } from '../errors/domain-error.js';

/** Claims of Seatiko access tokens; identical to the Go API so issued tokens stay valid. */
export type AccessClaims = { uid: string; email: string; iss: 'seatiko'; iat: number; exp: number };

export const TOKEN_TTL_SECONDS = 7 * 24 * 3600;

@Injectable()
export class TokenService {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  private get secret(): string {
    return this.config.get('JWT_SECRET', { infer: true });
  }

  issue(userId: string, email: string): Promise<string> {
    return this.jwt.signAsync({ uid: userId, email }, { secret: this.secret, algorithm: 'HS256', issuer: 'seatiko', expiresIn: TOKEN_TTL_SECONDS });
  }

  /** Throws 401 invalid_token for a bad, expired or foreign token. */
  async verify(token: string): Promise<AccessClaims> {
    try {
      const claims = await this.jwt.verifyAsync<AccessClaims>(token, { secret: this.secret, algorithms: ['HS256'], issuer: 'seatiko' });
      if (typeof claims.uid !== 'string' || !claims.uid) throw new Error('no uid');
      return claims;
    } catch {
      throw unauthorized('invalid_token');
    }
  }
}
