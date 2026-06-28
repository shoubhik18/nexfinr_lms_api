// Augments Express.Request with the JWT-derived user payload.
// `import 'express'` makes this a module so the global declaration merges
// instead of replacing the existing types.
import 'express';

export type Role = 'admin' | 'support' | 'learner';

declare global {
  namespace Express {
    interface Request {
      user?: {
        userId: string;
        role: Role;
      };
    }
  }
}

export {};
