import type { DatabaseConfig } from '../../config/database';
import { logger } from '../logger';

/** Fields present on node-postgres / PostgreSQL errors. */
export type PgErrorLike = Error & {
  code?: string;
  severity?: string;
  detail?: string;
  hint?: string;
  routine?: string;
  schema?: string;
  table?: string;
  column?: string;
  constraint?: string;
  position?: string;
  internalPosition?: string;
  internalQuery?: string;
  where?: string;
  file?: string;
  line?: string;
};

export function isPgError(err: unknown): err is PgErrorLike {
  return err instanceof Error && typeof (err as PgErrorLike).code === 'string';
}

export function logDatabaseConnectionFailure(
  err: unknown,
  dbConfig: DatabaseConfig,
): void {
  const pg = isPgError(err) ? err : null;
  const message = pg?.message ?? (err instanceof Error ? err.message : String(err));
  const stack = pg?.stack ?? (err instanceof Error ? err.stack : undefined);

  logger.error('Database connection failed', {
    message,
    code: pg?.code,
    severity: pg?.severity,
    detail: pg?.detail,
    hint: pg?.hint,
    routine: pg?.routine,
    schema: pg?.schema,
    table: pg?.table,
    constraint: pg?.constraint,
    host: dbConfig.host,
    database: dbConfig.database,
    stack,
  });
}

export function logBootstrapFailure(
  err: unknown,
  dbConfig?: DatabaseConfig,
): void {
  const pg = isPgError(err) ? err : null;
  const message = pg?.message ?? (err instanceof Error ? err.message : String(err));
  const stack = pg?.stack ?? (err instanceof Error ? err.stack : undefined);

  logger.error('Bootstrap failed', {
    message,
    code: pg?.code,
    severity: pg?.severity,
    detail: pg?.detail,
    hint: pg?.hint,
    routine: pg?.routine,
    schema: pg?.schema,
    table: pg?.table,
    constraint: pg?.constraint,
    host: dbConfig?.host,
    database: dbConfig?.database,
    stack,
  });
}
