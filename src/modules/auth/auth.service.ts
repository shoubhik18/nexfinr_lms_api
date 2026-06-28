import crypto from 'node:crypto';
import { eq, and, gt } from 'drizzle-orm';
import { db } from '../../db';
import { users, refreshTokens } from '../../db/schema';
import { comparePassword } from '../../shared/utils/hash.utils';
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from '../../shared/utils/jwt.utils';
import { HttpError } from '../../shared/utils/response.utils';
import { toSafeUser, type SafeUser } from '../../shared/utils/user.utils';

const REFRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Hash a refresh token before storing/comparing. We never store the raw
 * JWT; only a SHA-256 digest, so a leaked DB row can't impersonate a user.
 */
export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export interface LoginResult {
  accessToken: string;
  refreshToken: string;
  user: SafeUser;
}

export async function login(
  email: string,
  password: string,
): Promise<LoginResult> {
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (!user || !user.isActive) {
    throw new HttpError('Invalid credentials', 401);
  }

  const ok = await comparePassword(password, user.passwordHash);
  if (!ok) {
    throw new HttpError('Invalid credentials', 401);
  }

  const accessToken = signAccessToken({ userId: user.id, role: user.role });
  const refreshToken = signRefreshToken({ userId: user.id });

  await db.insert(refreshTokens).values({
    userId: user.id,
    tokenHash: hashToken(refreshToken),
    expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
  });

  return {
    accessToken,
    refreshToken,
    user: toSafeUser(user),
  };
}

export interface RefreshResult {
  accessToken: string;
  refreshToken: string;
}

export async function refresh(token: string): Promise<RefreshResult> {
  let payload: { userId: string };
  try {
    payload = verifyRefreshToken(token);
  } catch {
    throw new HttpError('Invalid or expired refresh token', 401);
  }

  const tokenHash = hashToken(token);

  const [stored] = await db
    .select()
    .from(refreshTokens)
    .where(
      and(
        eq(refreshTokens.tokenHash, tokenHash),
        eq(refreshTokens.userId, payload.userId),
        gt(refreshTokens.expiresAt, new Date()),
      ),
    )
    .limit(1);

  if (!stored) {
    throw new HttpError('Invalid or expired refresh token', 401);
  }

  // Look up the current role since it may have changed since the token was issued.
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, payload.userId))
    .limit(1);

  if (!user || !user.isActive) {
    throw new HttpError('User not found or inactive', 401);
  }

  // Rotate: delete the old token and issue a new pair.
  await db.delete(refreshTokens).where(eq(refreshTokens.id, stored.id));

  const accessToken = signAccessToken({ userId: user.id, role: user.role });
  const newRefreshToken = signRefreshToken({ userId: user.id });

  await db.insert(refreshTokens).values({
    userId: user.id,
    tokenHash: hashToken(newRefreshToken),
    expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
  });

  return { accessToken, refreshToken: newRefreshToken };
}

export async function logout(token: string | undefined): Promise<void> {
  if (!token) return;
  const tokenHash = hashToken(token);
  await db.delete(refreshTokens).where(eq(refreshTokens.tokenHash, tokenHash));
}

export async function getMe(userId: string): Promise<SafeUser> {
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user) {
    throw new HttpError('User not found', 404);
  }
  return toSafeUser(user);
}
