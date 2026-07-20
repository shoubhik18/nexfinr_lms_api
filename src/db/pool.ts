import { Pool } from 'pg';
import { env } from '../config/env';
import { logDatabaseStartupConfig } from '../config/database';

const { database: dbConfig } = env;

logDatabaseStartupConfig(dbConfig, env.NODE_ENV);

/**
 * PostgreSQL connection pool.
 *
 * SSL is always enabled for AWS RDS hosts and when DATABASE_URL contains
 * sslmode=require (or similar). Local Docker Postgres can use DATABASE_SSL=false.
 */
export const pool = new Pool({
  connectionString: dbConfig.connectionString,
  ssl: dbConfig.ssl,
  max: 20,
  idleTimeoutMillis: 60_000,
  connectionTimeoutMillis: 15_000,
  allowExitOnIdle: true,
});

pool.on('error', (err: Error) => {
  // eslint-disable-next-line no-console
  console.error('[pg] unexpected error on idle client', err.message);
});
