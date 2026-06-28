import { z } from 'zod';

export const userRoleSchema = z.enum(['admin', 'support', 'learner']);

export const createUserSchema = z.object({
  name: z.string().trim().min(1).max(255),
  email: z.string().email(),
  role: userRoleSchema,
});

export const updateUserSchema = z
  .object({
    name: z.string().trim().min(1).max(255),
    email: z.string().email(),
    isActive: z.boolean(),
  })
  .partial();

export const resetPasswordSchema = z.object({
  newPassword: z.string().min(6),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
