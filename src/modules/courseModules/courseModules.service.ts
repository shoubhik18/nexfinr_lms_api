import { eq } from 'drizzle-orm';
import { db } from '../../db';
import {
  courseModules,
  courses,
  type CourseModule,
} from '../../db/schema';
import { HttpError } from '../../shared/utils/response.utils';
import type {
  CreateModuleInput,
  ReorderInput,
  UpdateModuleInput,
} from './courseModules.validator';

export async function create(
  courseId: string,
  data: CreateModuleInput,
): Promise<CourseModule> {
  const [course] = await db
    .select({ id: courses.id })
    .from(courses)
    .where(eq(courses.id, courseId))
    .limit(1);
  if (!course) throw new HttpError('Course not found', 404);

  const [created] = await db
    .insert(courseModules)
    .values({ ...data, courseId })
    .returning();
  if (!created) throw new HttpError('Failed to create module', 500);
  return created;
}

export async function update(
  moduleId: string,
  data: UpdateModuleInput,
): Promise<CourseModule> {
  if (Object.keys(data).length === 0) {
    const [module] = await db
      .select()
      .from(courseModules)
      .where(eq(courseModules.id, moduleId))
      .limit(1);
    if (!module) throw new HttpError('Module not found', 404);
    return module;
  }

  const [updated] = await db
    .update(courseModules)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(courseModules.id, moduleId))
    .returning();
  if (!updated) throw new HttpError('Module not found', 404);
  return updated;
}

export async function deleteById(moduleId: string): Promise<CourseModule> {
  const [deleted] = await db
    .delete(courseModules)
    .where(eq(courseModules.id, moduleId))
    .returning();
  if (!deleted) throw new HttpError('Module not found', 404);
  return deleted;
}

export async function reorder(items: ReorderInput): Promise<void> {
  await db.transaction(async (tx) => {
    for (const item of items) {
      await tx
        .update(courseModules)
        .set({ orderIndex: item.orderIndex, updatedAt: new Date() })
        .where(eq(courseModules.id, item.id));
    }
  });
}
