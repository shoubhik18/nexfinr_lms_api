import 'dotenv/config';
import path from 'node:path';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const NODE_ENV = (process.env.NODE_ENV ?? 'development') as
  | 'development'
  | 'production'
  | 'test';

const IS_PROD = NODE_ENV === 'production';

const ALWAYS_REQUIRED = [
  'DATABASE_URL',
  'JWT_ACCESS_SECRET',
  'JWT_REFRESH_SECRET',
] as const;

const PROD_SMTP_KEYS = [
  'SMTP_HOST',
  'SMTP_USER',
  'SMTP_PASS',
  'SMTP_FROM',
] as const;

function missingKeys(keys: readonly string[]): string[] {
  return keys.filter(
    (key) => !process.env[key] || String(process.env[key]).trim() === '',
  );
}

const missingAlways = missingKeys(ALWAYS_REQUIRED);
const missingSmtp = IS_PROD ? missingKeys(PROD_SMTP_KEYS) : [];
const missing = [...missingAlways, ...missingSmtp];

if (missing.length > 0) {
  // eslint-disable-next-line no-console
  console.error(
    `[env] Missing required environment variables: ${missing.join(', ')}`,
  );
  // eslint-disable-next-line no-console
  console.error('[env] Copy .env.example to .env and fill in the values.');
  throw new Error(
    `Missing required environment variables: ${missing.join(', ')}`,
  );
}

function parseIntStrict(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
}

/** Comma-separated FRONTEND_URL values → CORS allowlist. */
function parseFrontendOrigins(raw: string | undefined): readonly string[] {
  const value = raw ?? 'http://localhost:3000';
  const origins = value
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
  return origins.length > 0 ? origins : ['http://localhost:3000'];
}

export const env = Object.freeze({
  NODE_ENV,
  IS_PROD,
  IS_DEV: NODE_ENV === 'development',
  PORT: parseIntStrict(process.env.PORT, 5000),

  DATABASE_URL: process.env.DATABASE_URL!,

  JWT_ACCESS_SECRET: process.env.JWT_ACCESS_SECRET!,
  JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET!,
  JWT_ACCESS_EXPIRES_IN: process.env.JWT_ACCESS_EXPIRES_IN ?? '15m',
  JWT_REFRESH_EXPIRES_IN: process.env.JWT_REFRESH_EXPIRES_IN ?? '7d',

  FRONTEND_URL: process.env.FRONTEND_URL ?? 'http://localhost:3000',
  FRONTEND_ORIGINS: parseFrontendOrigins(process.env.FRONTEND_URL),
  /** Public base URL for uploaded assets (no trailing slash). */
  API_PUBLIC_URL:
    process.env.API_PUBLIC_URL ??
    `http://localhost:${parseIntStrict(process.env.PORT, 5000)}`,
  UPLOAD_MAX_BYTES: parseIntStrict(process.env.UPLOAD_MAX_BYTES, 5 * 1024 * 1024),

  SMTP_HOST: process.env.SMTP_HOST ?? '',
  SMTP_PORT: parseIntStrict(process.env.SMTP_PORT, 587),
  SMTP_USER: process.env.SMTP_USER ?? '',
  SMTP_PASS: process.env.SMTP_PASS ?? '',
  SMTP_FROM: process.env.SMTP_FROM ?? 'LMS Platform <noreply@localhost>',

  /** Used only when seeding the first admin account. Required in production. */
  SEED_ADMIN_EMAIL: process.env.SEED_ADMIN_EMAIL ?? 'admin@gmail.com',
  SEED_ADMIN_PASSWORD: process.env.SEED_ADMIN_PASSWORD ?? '',
  /** Default password for newly created users (override in production). */
  DEFAULT_USER_PASSWORD:
    process.env.DEFAULT_USER_PASSWORD ??
    (IS_PROD ? '' : 'lms@1234'),
});

export type Env = typeof env;
