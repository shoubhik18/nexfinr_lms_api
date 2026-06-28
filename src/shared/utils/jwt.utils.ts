import jwt, { type SignOptions } from 'jsonwebtoken';
import { env } from '../../config/env';
import type { Role } from '../types/express';

export interface AccessTokenPayload {
  userId: string;
  role: Role;
}

export interface RefreshTokenPayload {
  userId: string;
}

export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, {
    expiresIn: env.JWT_ACCESS_EXPIRES_IN,
  } as SignOptions);
}

export function signRefreshToken(payload: RefreshTokenPayload): string {
  return jwt.sign(payload, env.JWT_REFRESH_SECRET, {
    expiresIn: env.JWT_REFRESH_EXPIRES_IN,
  } as SignOptions);
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET);
  if (
    typeof decoded !== 'object' ||
    decoded === null ||
    typeof (decoded as Record<string, unknown>).userId !== 'string' ||
    typeof (decoded as Record<string, unknown>).role !== 'string'
  ) {
    throw new jwt.JsonWebTokenError('Malformed access token payload');
  }
  return {
    userId: (decoded as { userId: string }).userId,
    role: (decoded as { role: Role }).role,
  };
}

export function verifyRefreshToken(token: string): RefreshTokenPayload {
  const decoded = jwt.verify(token, env.JWT_REFRESH_SECRET);
  if (
    typeof decoded !== 'object' ||
    decoded === null ||
    typeof (decoded as Record<string, unknown>).userId !== 'string'
  ) {
    throw new jwt.JsonWebTokenError('Malformed refresh token payload');
  }
  return { userId: (decoded as { userId: string }).userId };
}
