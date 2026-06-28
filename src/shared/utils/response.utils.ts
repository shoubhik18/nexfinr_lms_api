import type { Response } from 'express';

/**
 * Standard API response shape:
 *   success: { success: true, message: string, data: T }
 *   error:   { success: false, message: string, errors?: unknown }
 */

export interface ApiError {
  field?: string;
  message: string;
  code?: string;
  [key: string]: unknown;
}

export function success<T>(
  res: Response,
  data: T,
  message: string | null = null,
  statusCode = 200,
): Response {
  return res.status(statusCode).json({
    success: true,
    message,
    data,
  });
}

export function error(
  res: Response,
  message: string,
  statusCode = 400,
  errors?: ApiError[] | unknown,
): Response {
  const body: Record<string, unknown> = { success: false, message };
  if (errors !== undefined) body.errors = errors;
  return res.status(statusCode).json(body);
}

/**
 * Throwable application error. Services / controllers can throw this
 * and the global error middleware will serialize it into the standard
 * error response.
 */
export class HttpError extends Error {
  public readonly statusCode: number;
  public readonly errors?: unknown;

  constructor(message: string, statusCode = 400, errors?: unknown) {
    super(message);
    this.name = 'HttpError';
    this.statusCode = statusCode;
    this.errors = errors;
  }
}
