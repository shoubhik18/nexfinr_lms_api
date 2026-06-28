import type { Request } from 'express';
import { HttpError } from './response.utils';

/**
 * Express 5 types `req.params[key]` as `string | string[]` because wildcard
 * routes can produce arrays. None of our routes use that pattern, so we
 * narrow to `string` once at the boundary and reject any array values that
 * somehow leak through.
 */
export function param(req: Request, key: string): string {
  const value = req.params[key];
  if (typeof value !== 'string') {
    throw new HttpError(`Missing or invalid parameter: ${key}`, 400);
  }
  return value;
}
