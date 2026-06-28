import { z } from 'zod';

export const courseTypeSchema = z.enum(['recorded', 'ongoing']);

export const createCourseSchema = z.object({
  title: z.string().trim().min(1).max(255),
  description: z.string().optional(),
  type: courseTypeSchema,
  thumbnailUrl: z.string().url().optional(),
});

export const updateCourseSchema = createCourseSchema.partial();

export type CreateCourseInput = z.infer<typeof createCourseSchema>;
export type UpdateCourseInput = z.infer<typeof updateCourseSchema>;
