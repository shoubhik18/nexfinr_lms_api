import fs from 'node:fs';
import path from 'node:path';
import winston from 'winston';
import { env } from '../config/env';

const LOG_DIR = path.resolve(process.cwd(), 'logs');

// Winston file transports don't auto-create the directory, so do it here.
fs.mkdirSync(LOG_DIR, { recursive: true });

// Custom log levels — adds `http` between `info` and `verbose` so morgan
// HTTP access logs sit at their own level.
const levels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  verbose: 4,
  debug: 5,
} as const;

const colors = {
  error: 'red',
  warn: 'yellow',
  info: 'green',
  http: 'magenta',
  verbose: 'cyan',
  debug: 'blue',
} as const;

winston.addColors(colors);

const devFormat = winston.format.combine(
  winston.format.colorize({ all: true }),
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
  winston.format.errors({ stack: true }),
  winston.format.printf((info) => {
    const { timestamp, level, message, stack, ...meta } = info as Record<
      string,
      unknown
    > & { timestamp?: string; level: string; message: unknown; stack?: string };
    const metaKeys = Object.keys(meta);
    const metaStr = metaKeys.length > 0 ? ` ${JSON.stringify(meta)}` : '';
    const base = `${timestamp ?? ''} [${level}] ${String(message)}`;
    return stack ? `${base}\n${stack}${metaStr}` : `${base}${metaStr}`;
  }),
);

const prodFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.json(),
);

export const logger = winston.createLogger({
  levels,
  level: env.IS_PROD ? 'info' : 'debug',
  format: env.IS_PROD ? prodFormat : devFormat,
  defaultMeta: { service: 'lms-backend' },
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({
      filename: path.join(LOG_DIR, 'error.log'),
      level: 'error',
      format: prodFormat,
      maxsize: 5 * 1024 * 1024,
      maxFiles: 5,
    }),
    new winston.transports.File({
      filename: path.join(LOG_DIR, 'combined.log'),
      format: prodFormat,
      maxsize: 5 * 1024 * 1024,
      maxFiles: 5,
    }),
  ],
  exitOnError: false,
});

export type Logger = typeof logger;
