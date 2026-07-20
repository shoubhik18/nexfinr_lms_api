const AWS_RDS_HOST_MARKERS = ['amazonaws.com', 'rds.amazonaws.com'] as const;

const SSL_REQUIRE_MODES = new Set([
  'require',
  'verify-ca',
  'verify-full',
  'prefer',
]);

export type DatabaseSslConfig = { rejectUnauthorized: false };

export interface DatabaseConfig {
  connectionString: string;
  host: string;
  port: number;
  database: string;
  user: string;
  sslEnabled: boolean;
  ssl: DatabaseSslConfig | false;
  isAwsRds: boolean;
}

export interface LoadDatabaseConfigInput {
  url: string;
  sslOverride?: string;
}

export function isAwsRdsHost(host: string): boolean {
  const h = host.toLowerCase();
  return AWS_RDS_HOST_MARKERS.some((marker) => h.includes(marker));
}

function parseBool(value: string | undefined): boolean | undefined {
  if (value === undefined || value.trim() === '') return undefined;
  const v = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(v)) return true;
  if (['0', 'false', 'no', 'off'].includes(v)) return false;
  return undefined;
}

function readSslMode(url: URL): string | null {
  const mode = url.searchParams.get('sslmode');
  return mode ? mode.trim().toLowerCase() : null;
}

function resolveSslEnabled(
  host: string,
  sslMode: string | null,
  sslOverride: boolean | undefined,
): boolean {
  if (isAwsRdsHost(host)) return true;
  if (sslMode && SSL_REQUIRE_MODES.has(sslMode)) return true;
  if (sslMode === 'disable') return false;
  if (sslOverride === true) return true;
  if (sslOverride === false) return false;
  return false;
}

/**
 * Normalize ssl* URL params before passing to `pg`.
 *
 * Why:
 * - Recent pg/pg-connection-string emits warnings and can map sslmode=require
 *   to stricter behavior than expected unless extra flags are set.
 * - We already resolve SSL intent ourselves (RDS/sslmode/DATABASE_SSL) and pass
 *   explicit `ssl` options to Pool.
 *
 * Behavior:
 * - Always strip ssl* params from the URL.
 * - If SSL is disabled, force `sslmode=disable`.
 * - If SSL is enabled, do not set sslmode in URL; rely on Pool `ssl` config.
 */
function buildConnectionString(rawUrl: string, sslEnabled: boolean): string {
  const url = new URL(rawUrl);

  for (const key of [...url.searchParams.keys()]) {
    if (key.toLowerCase().startsWith('ssl')) {
      url.searchParams.delete(key);
    }
  }

  if (!sslEnabled) {
    url.searchParams.set('sslmode', 'disable');
    return url.toString();
  }

  return url.toString();
}

function hasSslIntent(sslMode: string | null): boolean {
  return Boolean(sslMode && SSL_REQUIRE_MODES.has(sslMode));
}

function shouldWarnOnSslMode(url: URL, sslEnabled: boolean): boolean {
  if (!sslEnabled) return false;
  const sslMode = readSslMode(url);
  return hasSslIntent(sslMode);
}

function maybeWarnOnSslMode(url: URL, sslEnabled: boolean): void {
  if (shouldWarnOnSslMode(url, sslEnabled)) {
    // eslint-disable-next-line no-console
    console.info(
      '[env] sslmode detected in DATABASE_URL; SSL remains enabled, URL ssl params normalized for pg compatibility.',
    );
  }
}

function buildNormalizedConnectionString(
  rawUrl: string,
  sslEnabled: boolean,
): string {
  const url = new URL(rawUrl);
  maybeWarnOnSslMode(url, sslEnabled);
  return buildConnectionString(rawUrl, sslEnabled);
}

function resolveConnectionString(rawUrl: string, sslEnabled: boolean): string {
  try {
    return buildNormalizedConnectionString(rawUrl, sslEnabled);
  } catch {
    // Fallback: if URL parsing fails unexpectedly, keep original and let pg report.
    return rawUrl;
  }
}

function finalSslConfig(sslEnabled: boolean): DatabaseSslConfig | false {
  if (!sslEnabled) return false;
  return { rejectUnauthorized: false };
}

export function loadDatabaseConfig(
  input: LoadDatabaseConfigInput,
): DatabaseConfig {
  const trimmed = input.url.trim();
  if (!trimmed) {
    throw new Error('[env] DATABASE_URL is required but empty');
  }

  const parsed = parseDatabaseUrl(trimmed);
  const url = new URL(trimmed);
  const sslMode = readSslMode(url);
  const sslOverride = parseBool(input.sslOverride);
  const sslEnabled = resolveSslEnabled(
    parsed.host,
    sslMode,
    sslOverride,
  );

  if (parsed.isAwsRds && sslOverride === false) {
    // eslint-disable-next-line no-console
    console.warn(
      '[env] DATABASE_SSL=false ignored for AWS RDS — SSL is always enabled for RDS hosts',
    );
  }

  const connectionString = resolveConnectionString(trimmed, sslEnabled);

  return {
    ...parsed,
    connectionString,
    sslEnabled,
    ssl: finalSslConfig(sslEnabled),
  };
}

export function parseDatabaseUrl(rawUrl: string): Omit<
  DatabaseConfig,
  'connectionString' | 'sslEnabled' | 'ssl' | 'isAwsRds'
> & { isAwsRds: boolean } {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error(
      `[env] DATABASE_URL is not a valid URL. Expected postgresql://user:pass@host:5432/dbname`,
    );
  }

  if (url.protocol !== 'postgresql:' && url.protocol !== 'postgres:') {
    throw new Error(
      `[env] DATABASE_URL must use the postgresql:// or postgres:// scheme`,
    );
  }

  const host = url.hostname.trim();
  const user = decodeURIComponent(url.username).trim();
  const database = url.pathname.replace(/^\//, '').trim();
  const portRaw = url.port || '5432';
  const port = Number.parseInt(portRaw, 10);

  const missing: string[] = [];
  if (!host) missing.push('host');
  if (!user) missing.push('username');
  if (!database) missing.push('database name');
  if (!Number.isFinite(port) || port < 1 || port > 65535) missing.push('port');

  if (missing.length > 0) {
    throw new Error(
      `[env] DATABASE_URL is missing required parts: ${missing.join(', ')}`,
    );
  }

  return {
    host,
    port,
    database,
    user,
    isAwsRds: isAwsRdsHost(host),
  };
}


export function logDatabaseStartupConfig(
  dbConfig: DatabaseConfig,
  nodeEnv: string,
): void {
  const lines = [
    '--------------------------------',
    '[PostgreSQL]',
    `Host: ${dbConfig.host}`,
    `Port: ${dbConfig.port}`,
    `Database: ${dbConfig.database}`,
    `User: ${dbConfig.user}`,
    `SSL Enabled: ${dbConfig.sslEnabled}`,
    `NODE_ENV: ${nodeEnv}`,
    '--------------------------------',
  ];

  for (const line of lines) {
    // eslint-disable-next-line no-console
    console.info(line);
  }
}
