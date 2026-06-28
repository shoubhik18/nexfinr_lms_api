import type { Request, Response, NextFunction } from 'express';
import type { ZodSchema } from 'zod';
import { error } from '../shared/utils/response.utils';

/**
 * Zod request-body validator.
 *   - On failure: 400 with `errors: [{ field, message }]`
 *   - On success: replaces `req.body` with the parsed (coerced) value.
 */
export function validate<T>(schema: ZodSchema<T>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const errors = result.error.issues.map((issue) => ({
        field: issue.path.map(String).join('.') || '(root)',
        message: issue.message,
      }));
      error(res, 'Validation failed', 400, errors);
      return;
    }
    req.body = result.data;
    next();
  };
}
