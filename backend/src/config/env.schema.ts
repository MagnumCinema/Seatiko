import { z } from 'zod';

/**
 * Environment of the API. Same variable names as the Go service, so the
 * docker-compose and .env files work for both during the migration.
 */
export const envSchema = z.object({
  APP_ENV: z.enum(['development', 'test', 'production']).default('development'),
  /** Go style listen address (":8080", "127.0.0.1:18090"); PORT wins when set. */
  ADDR: z.string().default(':8080'),
  PORT: z.coerce.number().int().positive().optional(),
  JWT_SECRET: z.string().min(16, 'JWT_SECRET must be at least 16 characters'),
  DATABASE_URL: z.url(),
  UPLOAD_DIR: z.string().default('./data/uploads'),

  S3_ENDPOINT: z.string().optional(),
  S3_REGION: z.string().default('us-east-1'),
  S3_BUCKET: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  S3_PUBLIC_URL: z.string().optional(),
  S3_PATH_STYLE: z.stringbool().default(true),

  GROQ_API_KEY: z.string().optional(),
  GROQ_MODEL: z.string().default('openai/gpt-oss-120b'),

  TWENTY_BASE_URL: z.string().optional(),
  TWENTY_PUBLIC_URL: z.string().optional(),
  TWENTY_API_KEY: z.string().optional(),
  TWENTY_WEBHOOK_SECRET: z.string().optional(),
  TWENTY_SYNC_INTERVAL_SECONDS: z.coerce.number().int().min(5).default(15),

  GOOGLE_CONFIG_FILE: z.string().optional(),
  GOOGLE_PLACES_API_KEY: z.string().optional(),
  GOOGLE_MAPS_BROWSER_KEY: z.string().optional(),
  GOOGLE_MAPS_MAP_ID: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

/** Validates process.env at startup; a missing or bad variable stops the app with a clear message. */
export function validateEnv(raw: Record<string, unknown>): Env {
  const result = envSchema.safeParse(raw);
  if (!result.success) {
    const lines = result.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`);
    throw new Error(`Invalid environment:\n${lines.join('\n')}`);
  }
  return result.data;
}

/** Host and port from PORT or the Go style ADDR. */
export function listenAddress(env: Pick<Env, 'ADDR' | 'PORT'>): { host?: string; port: number } {
  if (env.PORT) return { port: env.PORT };
  const i = env.ADDR.lastIndexOf(':');
  const host = env.ADDR.slice(0, i) || undefined;
  return { host, port: Number(env.ADDR.slice(i + 1)) || 8080 };
}
