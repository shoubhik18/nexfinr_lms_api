import { Pool } from 'pg';
import { env } from '../config/env';

/** Drop sslmode* query params so the URL cannot force TLS when SSL is disabled. */
function connectionStringWithoutSsl(url: string): string {
  try {
    const u = new URL(url);
    for (const key of [...u.searchParams.keys()]) {
      if (key.toLowerCase().startsWith('ssl')) {
        u.searchParams.delete(key);
      }
    }
    return u.toString();
  } catch {
    return url;
  }
}

/**
 * Local Docker Postgres has no TLS. Managed DBs (RDS, etc.) usually require it.
 * Set DATABASE_SSL=true in `.env.prod` when the server expects SSL.
 */
export const pool = new Pool({
  connectionString: env.DATABASE_SSL
    ? env.DATABASE_URL
    : connectionStringWithoutSsl(env.DATABASE_URL),
  ssl: env.DATABASE_SSL ? { rejectUnauthorized: false } : false,
  max: 20,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

pool.on('error', (err) => {
  // eslint-disable-next-line no-console
  console.error('[pg] unexpected error on idle client', err);
});
