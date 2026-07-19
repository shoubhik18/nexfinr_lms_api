import { Pool } from 'pg';
import { env } from '../config/env';

/**
 * Normalize DATABASE_URL SSL behavior.
 * - DATABASE_SSL=false → strip ssl* params and force sslmode=disable
 * - DATABASE_SSL=true  → leave URL as-is; Pool enables TLS
 */
function buildConnectionString(url: string, useSsl: boolean): string {
  try {
    const u = new URL(url);
    for (const key of [...u.searchParams.keys()]) {
      if (key.toLowerCase().startsWith('ssl')) {
        u.searchParams.delete(key);
      }
    }
    if (!useSsl) {
      u.searchParams.set('sslmode', 'disable');
    }
    return u.toString();
  } catch {
    return url;
  }
}

const connectionString = buildConnectionString(
  env.DATABASE_URL,
  env.DATABASE_SSL,
);

// Safe host log (no password) so deploy issues are diagnosable.
try {
  const u = new URL(connectionString);
  // eslint-disable-next-line no-console
  console.info(
    `[pg] connecting to ${u.hostname}:${u.port || '5432'}${u.pathname} ssl=${env.DATABASE_SSL}`,
  );
} catch {
  // ignore malformed URL — Pool will surface the real error
}

/**
 * Local Docker Postgres has no TLS. Managed DBs (RDS, etc.) usually require it.
 * Set DATABASE_SSL=true in `.env.prod` when the server expects SSL.
 */
export const pool = new Pool({
  connectionString,
  ssl: env.DATABASE_SSL ? { rejectUnauthorized: false } : false,
  max: 20,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

pool.on('error', (err) => {
  // eslint-disable-next-line no-console
  console.error('[pg] unexpected error on idle client', err);
});
