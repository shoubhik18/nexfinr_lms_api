import { eq } from 'drizzle-orm';
import { db } from './index';
import { users } from './schema';
import { env } from '../config/env';
import { hashPassword } from '../shared/utils/hash.utils';
import { logger } from '../shared/logger';

/**
 * Idempotent admin seed. Safe to call on every boot.
 * In production, set SEED_ADMIN_PASSWORD before first deploy.
 */
export async function seedAdmin(): Promise<void> {
  const email = env.SEED_ADMIN_EMAIL;

  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (existing.length > 0) {
    logger.info('Admin already exists', { email });
    return;
  }

  const password = env.SEED_ADMIN_PASSWORD;
  if (!password) {
    if (env.IS_PROD) {
      logger.warn(
        'SEED_ADMIN_PASSWORD is not set — skipping admin seed in production',
      );
    } else {
      logger.warn(
        'SEED_ADMIN_PASSWORD is not set — skipping admin seed. Set it in .env.prod.',
      );
    }
    return;
  }

  if (env.IS_PROD && password.length < 12) {
    throw new Error(
      'SEED_ADMIN_PASSWORD must be at least 12 characters in production',
    );
  }

  const passwordHash = await hashPassword(password);

  await db.insert(users).values({
    name: 'Super Admin',
    email,
    passwordHash,
    role: 'admin',
    isActive: true,
  });

  logger.info('Seeded admin user', { email });
}
