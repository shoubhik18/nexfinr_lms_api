import type { Server } from 'node:http';
import type express from 'express';
import { env } from '../config/env';
import { logger } from '../shared/logger';
import {
  logBootstrapFailure,
  logDatabaseConnectionFailure,
} from '../shared/utils/pgError.utils';
import { pool } from './pool';
import { syncSchema } from './syncSchema';
import { seedAdmin } from './seed';

async function verifyDatabaseConnection(): Promise<void> {
  logger.info('Connecting to PostgreSQL...');
  logger.info(`SSL Enabled: ${env.database.sslEnabled}`);

  const client = await pool.connect();
  try {
    await client.query('SELECT 1 AS ok');
    logger.info('Connected successfully.');
  } catch (err) {
    logDatabaseConnectionFailure(err, env.database);
    throw err;
  } finally {
    client.release();
  }
}

export async function bootstrapApplication(
  app: express.Express,
): Promise<Server> {
  try {
    await verifyDatabaseConnection();

    logger.info('Syncing schema...');
    await syncSchema();
    logger.info('Schema synced.');

    logger.info('Seeding admin...');
    await seedAdmin();

    const server = app.listen(env.PORT, () => {
      logger.info('Server started.');
      logger.info(
        `lms-backend listening on http://localhost:${env.PORT} (${env.NODE_ENV})`,
      );
      logger.info(`CORS origins: ${env.FRONTEND_ORIGINS.join(', ')}`);
    });

    const shutdown = (signal: string) => {
      logger.info(`${signal} received — shutting down...`);
      server.close(async () => {
        try {
          await pool.end();
          logger.info('pg pool closed. Bye.');
          process.exit(0);
        } catch (err) {
          logBootstrapFailure(err, env.database);
          process.exit(1);
        }
      });
      setTimeout(() => {
        logger.error('Forced shutdown (timeout).');
        process.exit(1);
      }, 10_000).unref();
    };

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('unhandledRejection', (reason) => {
      logger.error('unhandledRejection', { reason });
    });
    process.on('uncaughtException', (err) => {
      logBootstrapFailure(err, env.database);
    });

    return server;
  } catch (err) {
    logBootstrapFailure(err, env.database);
    throw err;
  }
}
