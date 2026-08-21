import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().default(4000),

  /**
   * MySQL connection. Discrete variables rather than a single URL, so a
   * password containing `@` or `/` cannot silently corrupt the DSN — a
   * genuinely common production failure.
   *
   * DATABASE_URL is still honoured when present and overrides the parts, which
   * is what most managed hosts hand you.
   */
  DB_HOST: z.string().default('127.0.0.1'),
  DB_PORT: z.coerce.number().int().default(3306),
  DB_NAME: z.string().default('deliveryos'),
  DB_USER: z.string().default('root'),
  DB_PASSWORD: z.string().default(''),
  /** Managed MySQL usually requires TLS; local development almost never does. */
  DB_SSL: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  DB_POOL_MIN: z.coerce.number().int().default(2),
  DB_POOL_MAX: z.coerce.number().int().default(10),
  DATABASE_URL: z.string().optional(),
  JWT_SECRET: z.string().min(24, 'JWT_SECRET must be at least 24 characters'),
  JWT_EXPIRES_IN: z.string().default('12h'),
  WEB_ORIGIN: z.string().default('http://localhost:5173'),

  STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
  STORAGE_LOCAL_PATH: z.string().default('./storage'),

  ANTHROPIC_API_KEY: z.string().default(''),
  OPENAI_API_KEY: z.string().default(''),
  AI_DEFAULT_PROVIDER: z.enum(['ANTHROPIC', 'OPENAI']).default('ANTHROPIC'),
  AI_MAX_INPUT_CHARS: z.coerce.number().int().default(400_000),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
  // Fail loudly at boot rather than at the first request that needs the value.
  throw new Error(`Invalid environment configuration:\n${issues}\n\nCopy .env.example to .env and fill it in.`);
}

export const env = parsed.data;
export const isProduction = env.NODE_ENV === 'production';

/**
 * One place that decides how to reach the database, so the connection is
 * described identically by the app, the migrations and the seed.
 */
export function databaseConnection() {
  if (env.DATABASE_URL) {
    return env.DB_SSL
      ? { connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: true } }
      : env.DATABASE_URL;
  }
  return {
    host: env.DB_HOST,
    port: env.DB_PORT,
    database: env.DB_NAME,
    user: env.DB_USER,
    password: env.DB_PASSWORD,
    ...(env.DB_SSL ? { ssl: { rejectUnauthorized: true } } : {}),
  };
}

/** §16: the product must stay usable when no AI provider is configured. */
export const aiAvailable = Boolean(env.ANTHROPIC_API_KEY || env.OPENAI_API_KEY);
