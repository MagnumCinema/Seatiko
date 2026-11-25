import { Injectable, Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDisk, LocalDisk, S3Disk, StorageDisk, StorageModule } from '@nestjs/storage';
import type { Env } from '../../config/env.schema.js';

const DISK = 'media';
/** Every upload gets a new key, so browsers and the CDN may cache it forever. */
const CACHE = 'public, max-age=31536000, immutable';

/** Public URL base: S3_PUBLIC_URL, the bucket on the endpoint, or the app's /uploads route. */
export function mediaUrlBase(env: Pick<Env, 'S3_BUCKET' | 'S3_ENDPOINT' | 'S3_PUBLIC_URL'>): string {
  if (!env.S3_BUCKET) return '/uploads';
  if (env.S3_PUBLIC_URL) return env.S3_PUBLIC_URL.replace(/\/+$/, '');
  return `${(env.S3_ENDPOINT ?? '').replace(/\/+$/, '')}/${env.S3_BUCKET}`;
}

/**
 * Avatars and venue photos: S3 / MinIO / R2 when S3_BUCKET is set (same variables
 * as the Go API), else UPLOAD_DIR served at /uploads.
 */
@Injectable()
export class MediaStorage {
  private readonly logger = new Logger(MediaStorage.name);
  private readonly base: string;

  constructor(
    @InjectDisk(DISK) private readonly disk: StorageDisk,
    config: ConfigService<Env, true>,
  ) {
    this.base = mediaUrlBase({
      S3_BUCKET: config.get('S3_BUCKET', { infer: true }),
      S3_ENDPOINT: config.get('S3_ENDPOINT', { infer: true }),
      S3_PUBLIC_URL: config.get('S3_PUBLIC_URL', { infer: true }),
    });
  }

  /** Stores the bytes and returns their public URL. */
  async put(key: string, contentType: string, data: Uint8Array): Promise<string> {
    await this.disk.put(key, data, { contentType, cacheControl: CACHE });
    return `${this.base}/${key.split('/').map(encodeURIComponent).join('/')}`;
  }

  /** Best effort: a missing file is not an error. */
  async delete(key: string): Promise<void> {
    if (!key) return;
    try {
      await this.disk.delete(key);
    } catch (error) {
      this.logger.warn(`delete ${key}: ${String(error)}`);
    }
  }
}

@Module({
  imports: [
    StorageModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => {
        const bucket = config.get('S3_BUCKET', { infer: true });
        if (!bucket) {
          return { default: DISK, disks: { [DISK]: new LocalDisk({ root: config.get('UPLOAD_DIR', { infer: true }) }) } };
        }
        return {
          default: DISK,
          disks: {
            [DISK]: new S3Disk({
              bucket,
              endpoint: config.get('S3_ENDPOINT', { infer: true }) || undefined,
              region: config.get('S3_REGION', { infer: true }),
              forcePathStyle: config.get('S3_PATH_STYLE', { infer: true }),
              credentials: {
                accessKeyId: config.get('S3_ACCESS_KEY_ID', { infer: true }) ?? '',
                secretAccessKey: config.get('S3_SECRET_ACCESS_KEY', { infer: true }) ?? '',
              },
            }),
          },
        };
      },
    }),
  ],
  providers: [MediaStorage],
  exports: [MediaStorage],
})
export class MediaStorageModule {}
