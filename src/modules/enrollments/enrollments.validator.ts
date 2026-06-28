import { z } from 'zod';

export const createEnrollmentSchema = z.object({
  learnerId: z.string().uuid(),
  courseId: z.string().uuid(),
});

export const bulkEnrollmentSchema = z.object({
  courseId: z.string().uuid(),
  emails: z
    .array(z.string().trim().email())
    .min(1, 'Provide at least one email')
    .max(100),
});

export type CreateEnrollmentInput = z.infer<typeof createEnrollmentSchema>;
export type BulkEnrollmentInput = z.infer<typeof bulkEnrollmentSchema>;
