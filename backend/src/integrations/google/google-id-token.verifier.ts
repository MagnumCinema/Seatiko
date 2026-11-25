// Verifies the ID tokens Google's sign-in libraries hand the site and the Android app
// (Google Identity Services, Credential Manager): signature against Google's published
// keys, issuer, audience (our OAuth client IDs) and expiry. No client secret involved.
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwksClient, JwtError, JwtVerifier } from '@nestjs/authentication';
import type { Env } from '../../config/env.schema.js';
import { DomainError, unauthorized, unavailable } from '../../core/errors/domain-error.js';

/** What the API takes from a verified Google ID token. */
export type GoogleAccount = {
  /** Google's id for the account: stable, never reused. */
  subject: string;
  email: string;
  /** Whether Google verified that the account owns `email`. */
  emailVerified: boolean;
  givenName: string;
  familyName: string;
};

// Google documents both values of `iss` for its ID tokens.
const GOOGLE_ISSUERS = ['https://accounts.google.com', 'accounts.google.com'];

@Injectable()
export class GoogleIdTokenVerifier {
  private readonly logger = new Logger(GoogleIdTokenVerifier.name);
  private readonly clientIds: string[];
  private readonly verifiers: Map<string, JwtVerifier>;

  constructor(config: ConfigService<Env, true>) {
    this.clientIds = config.get('GOOGLE_CLIENT_IDS', { infer: true });
    // One key set, fetched and cached (and refetched when Google rotates keys) for both issuers.
    const jwks = new JwksClient(config.get('GOOGLE_JWKS_URL', { infer: true }));
    this.verifiers = new Map(
      this.clientIds.length
        ? GOOGLE_ISSUERS.map((issuer) => [
            issuer,
            new JwtVerifier({
              jwks,
              issuer,
              // Tokens Google issued to any other site or app are refused.
              audience: this.clientIds,
              required: ['exp', 'sub'],
              clockTolerance: '30s',
            }),
          ])
        : [],
    );
  }

  /** Whether Google sign-in is configured (GOOGLE_CLIENT_IDS). */
  get enabled(): boolean {
    return this.clientIds.length > 0;
  }

  /** The web client ID, the one the site's button asks Google for. */
  get webClientId(): string {
    return this.clientIds[0] ?? '';
  }

  /**
   * 401 invalid_google_token for a bad token; 503 when Google's keys are unreachable.
   * With `nonce`, the token must carry it: the site makes one per sign-in, so a token
   * copied from another sign-in is refused.
   */
  async verify(idToken: string, nonce?: string): Promise<GoogleAccount> {
    if (!this.enabled) throw unavailable('google_signin_disabled');
    // Reading `iss` unverified only picks the verifier, which then checks it.
    const verifier = this.verifiers.get(unverifiedIssuer(idToken)) ?? this.verifiers.get(GOOGLE_ISSUERS[0])!;
    try {
      const claims = await verifier.verify(idToken);
      if (nonce !== undefined && claims.nonce !== nonce) throw unauthorized('invalid_google_token');
      const text = (v: unknown) => (typeof v === 'string' ? v : '');
      return {
        subject: claims.sub!,
        email: text(claims.email).trim().toLowerCase(),
        emailVerified: claims.email_verified === true,
        givenName: text(claims.given_name),
        familyName: text(claims.family_name),
      };
    } catch (error) {
      if (error instanceof JwtError) throw unauthorized('invalid_google_token');
      if (error instanceof DomainError) throw error;
      // Google's keys could not be fetched: not the client's fault, worth retrying.
      this.logger.error('Google ID token verification failed', error);
      throw unavailable('google_unavailable');
    }
  }
}

/** The `iss` claim, read without verifying anything. */
function unverifiedIssuer(token: string): string {
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1] ?? '', 'base64url').toString());
    return typeof payload?.iss === 'string' ? payload.iss : '';
  } catch {
    return '';
  }
}
