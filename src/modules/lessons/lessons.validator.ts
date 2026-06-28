import { z } from 'zod';

export const createLessonForModuleSchema = z.object({
  title: z.string().min(1).max(255),
  vimeoUrl: z.string().url(),
  orderIndex: z.number().int(),
  isPublished: z.boolean().optional(),
});

export const createLessonForCourseSchema = z.object({
  title: z.string().min(1).max(255),
  vimeoUrl: z.string().url(),
  orderIndex: z.number().int(),
  isPublished: z.boolean().optional(),
});

export const updateLessonSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  vimeoUrl: z.string().url().optional(),
  orderIndex: z.number().int().optional(),
  isPublished: z.boolean().optional(),
});

export const reorderSchema = z.array(
  z.object({ id: z.string().uuid(), orderIndex: z.number().int() }),
);

export type CreateLessonForModuleInput = z.infer<
  typeof createLessonForModuleSchema
>;
export type CreateLessonForCourseInput = z.infer<
  typeof createLessonForCourseSchema
>;
export type UpdateLessonInput = z.infer<typeof updateLessonSchema>;
export type ReorderInput = z.infer<typeof reorderSchema>;
