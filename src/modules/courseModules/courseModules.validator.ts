import { z } from 'zod';

export const createModuleSchema = z.object({
  title: z.string().trim().min(1).max(255),
  orderIndex: z.number().int(),
});

export const updateModuleSchema = createModuleSchema.partial();

export const reorderSchema = z
  .array(
    z.object({
      id: z.string().uuid(),
      orderIndex: z.number().int(),
    }),
  )
  .min(1);

export type CreateModuleInput = z.infer<typeof createModuleSchema>;
export type UpdateModuleInput = z.infer<typeof updateModuleSchema>;
export type ReorderInput = z.infer<typeof reorderSchema>;
