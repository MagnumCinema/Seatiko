import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { z } from 'zod';
import { type AuthUser, CurrentUser, Roles } from '../../core/auth/auth.decorators.js';
import { badRequest } from '../../core/errors/domain-error.js';
import { MAX_IMAGE_BYTES, sniffImage } from '../../integrations/storage/image.js';
import { ApplicationsService } from './applications.service.js';

const text = z.object({ ru: z.string().default(''), en: z.string().default(''), ro: z.string().default('') });
const patchBody = z.object({
  name: text.optional(),
  description: text.optional(),
  address: text.optional(),
  cuisine: z.array(z.string()).optional(),
  venue_type: z.string().max(32).optional(),
  phone: z.string().optional(),
  email: z.string().optional(),
  website: z.string().optional(),
  city_id: z.string().optional(),
  lat: z.number().optional(),
  lng: z.number().optional(),
  price_level: z.number().int().optional(),
  average_check: z.number().int().optional(),
  hours_text: z.string().optional(),
});
const photoBody = z.object({ url: z.string().min(1) });
const reviewBody = z.object({ status: z.string().min(1), reject_reason: z.string().optional() });
const changeReviewBody = z.object({ status: z.string().min(1), note: z.string().optional() });

/** Owner side of onboarding (roles restaurant, admin). */
@Roles('restaurant', 'admin')
@Controller('api/v1/restaurant')
export class ApplicationsController {
  constructor(private readonly apps: ApplicationsService) {}

  @Post('applications')
  async create(@CurrentUser() user: AuthUser) {
    return { application: await this.apps.create(user.id) };
  }

  @Get('applications')
  async mine(@CurrentUser() user: AuthUser) {
    return { applications: await this.apps.mine(user.id) };
  }

  @Get('applications/:id')
  async get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return { application: await this.apps.get(user.id, id) };
  }

  @Delete('applications/:id')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.apps.remove(user.id, id);
  }

  @Get('applications/:id/activity')
  async activity(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return { activity: await this.apps.activity(user.id, id) };
  }

  @Patch('applications/:id')
  async update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body({ schema: patchBody }) body: z.infer<typeof patchBody>) {
    return { application: await this.apps.update(user.id, id, body) };
  }

  /** Multipart field "photo": JPEG, PNG or WebP up to 5 MB. */
  @Post('applications/:id/photos')
  @UseInterceptors(FileInterceptor('photo', { storage: memoryStorage(), limits: { fileSize: 2 * MAX_IMAGE_BYTES, files: 1 } }))
  addPhoto(@CurrentUser() user: AuthUser, @Param('id') id: string, @UploadedFile() file?: Express.Multer.File) {
    if (!file) throw badRequest('photo_required');
    if (file.size > MAX_IMAGE_BYTES) throw badRequest('file_too_large');
    const data = new Uint8Array(file.buffer);
    if (!sniffImage(data)) throw badRequest('invalid_file_type');
    return this.apps.addPhoto(user.id, id, data);
  }

  @Delete('applications/:id/photos')
  async removePhoto(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body({ schema: photoBody }) body: z.infer<typeof photoBody>) {
    return { application: await this.apps.removePhoto(user.id, id, body.url) };
  }

  @Post('applications/:id/submit')
  @HttpCode(200)
  async submit(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return { application: await this.apps.submit(user.id, id) };
  }

  @Post('applications/:id/change-requests')
  async requestChange(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body({ schema: patchBody }) body: z.infer<typeof patchBody>) {
    return { change_request: await this.apps.requestChange(user.id, id, body) };
  }

  @Get('change-requests')
  async changes(@CurrentUser() user: AuthUser) {
    return { change_requests: await this.apps.changes(user.id) };
  }
}

/** Moderation (admin). */
@Roles('admin')
@Controller('api/v1/admin')
export class AdminApplicationsController {
  constructor(private readonly apps: ApplicationsService) {}

  @Get('applications')
  async list(@Query('status') status?: string) {
    return { applications: await this.apps.all(status) };
  }

  @Post('applications/:id/review')
  @HttpCode(200)
  async review(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body({ schema: reviewBody }) body: z.infer<typeof reviewBody>) {
    return { application: await this.apps.review(user.id, id, body.status, body.reject_reason) };
  }

  @Post('applications/:id/publish')
  @HttpCode(200)
  publish(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.apps.publish(user.id, id);
  }

  @Get('change-requests')
  async changes() {
    return { change_requests: await this.apps.changes() };
  }

  @Post('change-requests/:id/review')
  @HttpCode(200)
  async reviewChange(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body({ schema: changeReviewBody }) body: z.infer<typeof changeReviewBody>) {
    return { change_request: await this.apps.reviewChange(user.id, id, body.status, body.note) };
  }
}
