import type { Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { ZodError } from 'zod';
import { JsonWebTokenError, TokenExpiredError } from 'jsonwebtoken';
import { error, HttpError } from '../shared/utils/response.utils';
import { logger } from '../shared/logger';

interface PgError extends Error {
  code?: string;
  detail?: string;
  constraint?: string;
}

function isPgError(err: unknown): err is PgError {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    typeof (err as { code?: unknown }).code === 'string' &&
    /^[0-9A-Z]{5}$/.test((err as { code: string }).code)
  );
}

/**
 * Global Express error handler. Must have 4 args for Express to recognize it.
 * Mount LAST, after all routes.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorMiddleware(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  // Always log first.
  logger.error('Request failed', {
    path: req.path,
    method: req.method,
    error: err instanceof Error ? err.message : String(err),
    stack: err instanceof Error ? err.stack : undefined,
  });

  // ---- Custom HttpError -----------------------------------------------------
  if (err instanceof HttpError) {
    error(res, err.message, err.statusCode, err.errors);
    return;
  }

  // ---- Plain {statusCode,message} thrown from services ----------------------
  if (
    typeof err === 'object' &&
    err !== null &&
    'statusCode' in err &&
    typeof (err as { statusCode?: unknown }).statusCode === 'number'
  ) {
    const e = err as { statusCode: number; message?: string; errors?: unknown };
    error(res, e.message ?? 'Request failed', e.statusCode, e.errors);
    return;
  }

  // ---- Multer / upload ------------------------------------------------------
  if (err instanceof multer.MulterError) {
    const message =
      err.code === 'LIMIT_FILE_SIZE'
        ? 'Image file is too large'
        : err.message;
    error(res, message, 400);
    return;
  }
  if (err instanceof Error && err.message.includes('images are allowed')) {
    error(res, err.message, 400);
    return;
  }

  // ---- Zod ------------------------------------------------------------------
  if (err instanceof ZodError) {
    const errors = err.issues.map((issue) => ({
      field: issue.path.map(String).join('.') || '(root)',
      message: issue.message,
    }));
    error(res, 'Validation failed', 400, errors);
    return;
  }

  // ---- JWT ------------------------------------------------------------------
  if (err instanceof TokenExpiredError) {
    error(res, 'Token expired', 401);
    return;
  }
  if (err instanceof JsonWebTokenError) {
    error(res, 'Invalid token', 401);
    return;
  }

  // ---- Postgres -------------------------------------------------------------
  if (isPgError(err)) {
    if (err.code === '23505') {
      error(res, 'Duplicate entry', 409, [
        { detail: err.detail, constraint: err.constraint },
      ]);
      return;
    }
    if (err.code === '23503') {
      error(res, 'Referenced record not found', 400, [
        { detail: err.detail, constraint: err.constraint },
      ]);
      return;
    }
  }

  // ---- Fallback -------------------------------------------------------------
  error(res, 'Internal server error', 500);
}
