import { Body, Controller, Delete, Get, HttpCode, Patch, Post, UploadedFiles, UseInterceptors } from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { memoryStorage } from 'multer';
import { z } from 'zod';
import { type AuthUser, CurrentUser, Public } from '../../core/auth/auth.decorators.js';
import { badRequest, DomainError } from '../../core/errors/domain-error.js';
import { MAX_IMAGE_BYTES } from '../../integrations/storage/image.js';
import { AccountsService } from './accounts.service.js';

const registerBody = z.object({
  email: z.email(),
  password: z.string().min(6),
  first_name: z.string().optional(),
  last_name: z.string().optional(),
  locale: z.string().optional(),
  role: z.string().optional(),
});
const loginBody = z.object({ email: z.email(), password: z.string().min(1) });
const profileBody = z.object({
  first_name: z.string().optional(),
  last_name: z.string().optional(),
  display_name: z.string().optional(),
  phone: z.string().optional(),
  locale: z.string().optional(),
  diet_preferences: z.array(z.string()).optional(),
  favorite_venues: z.array(z.string()).optional(),
});
const emailBody = z.object({ email: z.string('invalid_email').min(1, 'invalid_email') }, 'invalid_email');
// old_password: not for an account created with Google that sets its first password.
const passwordBody = z.object({ old_password: z.string().optional(), new_password: z.string().min(6) });
// password: required for accounts that have one (checked by the service).
const deleteBody = z.object({ password: z.string('password_required').optional() }, 'password_required');
// A Google ID token as Google's sign-in libraries hand it over (a signed JWT, ~1 KB).
const credential = z.string().min(1).max(4096);
const googleBody = z.object({ credential, role: z.string().optional(), locale: z.string().optional() });
const connectGoogleBody = z.object({ credential, password: z.string().max(128).optional() });

/** Sign-in limit per client address, as the Go API (40 per minute). */
const AUTH_LIMIT = { default: { limit: 40, ttl: 60_000 } };

@Controller('api/v1')
export class AccountsController {
  constructor(private readonly accounts: AccountsService) {}

  @Public()
  @Throttle(AUTH_LIMIT)
  @Post('auth/register')
  register(@Body({ schema: registerBody }) body: z.infer<typeof registerBody>) {
    return this.accounts.register(body);
  }

  @Public()
  @Throttle(AUTH_LIMIT)
  @Post('auth/login')
  @HttpCode(200)
  login(@Body({ schema: loginBody }) body: z.infer<typeof loginBody>) {
    return this.accounts.login(body.email, body.password);
  }

  /** Which sign-in buttons the site and the app show (Google client ID). */
  @Public()
  @Get('auth/providers')
  providers() {
    return this.accounts.providers();
  }

  /** Sign in or sign up with a Google ID token; answers like /auth/login (+ created). */
  @Public()
  @Throttle(AUTH_LIMIT)
  @Post('auth/google')
  @HttpCode(200)
  google(@Body({ schema: googleBody }) body: z.infer<typeof googleBody>) {
    return this.accounts.signInWithGoogle(body);
  }

  @Get('me/identities')
  identities(@CurrentUser() user: AuthUser) {
    return this.accounts.identities(user.id);
  }

  /** It checks a password, so it is limited like sign-in. */
  @Throttle({ default: { limit: 10, ttl: 15 * 60_000 } })
  @Post('me/identities/google')
  @HttpCode(200)
  connectGoogle(@CurrentUser() user: AuthUser, @Body({ schema: connectGoogleBody }) body: z.infer<typeof connectGoogleBody>) {
    return this.accounts.connectGoogle(user.id, body.credential, body.password);
  }

  @Delete('me/identities/google')
  disconnectGoogle(@CurrentUser() user: AuthUser) {
    return this.accounts.disconnectGoogle(user.id);
  }

  @Get('me')
  async me(@CurrentUser() user: AuthUser) {
    return { user: await this.accounts.me(user.id) };
  }

  /** Guests cannot grant themselves 18+: unknown fields are ignored. */
  @Patch('me')
  async update(@CurrentUser() user: AuthUser, @Body({ schema: profileBody }) body: z.infer<typeof profileBody>) {
    return { user: await this.accounts.updateProfile(user.id, body) };
  }

  @Patch('me/email')
  async email(@CurrentUser() user: AuthUser, @Body({ schema: emailBody }) body: z.infer<typeof emailBody>) {
    return { user: await this.accounts.updateEmail(user.id, body.email) };
  }

  @Patch('me/password')
  password(@CurrentUser() user: AuthUser, @Body({ schema: passwordBody }) body: z.infer<typeof passwordBody>) {
    return this.accounts.updatePassword(user.id, body.old_password, body.new_password);
  }

  /** GDPR: anonymises the guest account; needs the current password. */
  @Delete('me')
  remove(@CurrentUser() user: AuthUser, @Body({ schema: deleteBody }) body: z.infer<typeof deleteBody>) {
    return this.accounts.deleteAccount(user.id, body.password);
  }

  /** Multipart field "file" (or "avatar"): JPEG, PNG or WebP up to 5 MB, stored as a 512×512 JPEG. */
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('me/avatar')
  @HttpCode(200)
  @UseInterceptors(
    FileFieldsInterceptor([{ name: 'file', maxCount: 1 }, { name: 'avatar', maxCount: 1 }], {
      storage: memoryStorage(),
      limits: { fileSize: 2 * MAX_IMAGE_BYTES, files: 1 },
    }),
  )
  async avatar(@CurrentUser() user: AuthUser, @UploadedFiles() files?: { file?: Express.Multer.File[]; avatar?: Express.Multer.File[] }) {
    const file = files?.file?.[0] ?? files?.avatar?.[0];
    if (!file) throw badRequest('file_required');
    if (file.size > MAX_IMAGE_BYTES) throw new DomainError('file_too_large', 413);
    return { user: await this.accounts.setAvatar(user.id, new Uint8Array(file.buffer)) };
  }

  @Delete('me/avatar')
  async deleteAvatar(@CurrentUser() user: AuthUser) {
    return { user: await this.accounts.deleteAvatar(user.id) };
  }
}
