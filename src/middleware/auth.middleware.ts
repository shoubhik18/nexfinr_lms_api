import type { Request, Response, NextFunction } from 'express';
import { eq } from 'drizzle-orm';
import { db } from '../db';
import { users } from '../db/schema';
import { verifyAccessToken } from '../shared/utils/jwt.utils';
import { error } from '../shared/utils/response.utils';
import type { Role } from '../shared/types/express';

/**
 * Verifies a Bearer access token, confirms the account is active, and attaches
 * `req.user = { userId, role }` using the live role from the database.
 */
export async function verifyToken(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const header = req.headers.authorization || req.headers.Authorization;

  if (!header || typeof header !== 'string' || !header.startsWith('Bearer ')) {
    error(res, 'Authentication required', 401);
    return;
  }

  const token = header.slice(7).trim();
  if (!token) {
    error(res, 'Authentication required', 401);
    return;
  }

  try {
    const payload = verifyAccessToken(token);
    const [user] = await db
      .select({ isActive: users.isActive, role: users.role })
      .from(users)
      .where(eq(users.id, payload.userId))
      .limit(1);

    if (!user?.isActive) {
      error(res, 'Account inactive or not found', 401);
      return;
    }

    req.user = { userId: payload.userId, role: user.role as Role };
    next();
  } catch {
    error(res, 'Invalid or expired token', 401);
  }
}

/**
 * Role-based authorization. Use AFTER verifyToken.
 *
 *   router.delete('/users/:id', verifyToken, requireRole('admin'), handler);
 */
export function requireRole(...roles: Role[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      error(res, 'Authentication required', 401);
      return;
    }
    if (roles.length > 0 && !roles.includes(req.user.role)) {
      error(res, 'Forbidden: insufficient permissions', 403);
      return;
    }
    next();
  };
}

// Common shorthands so route files read cleanly.
export const adminOnly = requireRole('admin');
export const staffOnly = requireRole('admin', 'support');
export const canDelete = adminOnly;
