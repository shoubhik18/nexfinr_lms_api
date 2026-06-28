import { and, eq } from 'drizzle-orm';
import { db } from '../../db';
import {
  courseModules,
  courses,
  lessons,
  type Lesson,
} from '../../db/schema';
import { HttpError } from '../../shared/utils/response.utils';
import type {
  CreateLessonForCourseInput,
  CreateLessonForModuleInput,
  ReorderInput,
  UpdateLessonInput,
} from './lessons.validator';

export async function createForModule(
  moduleId: string,
  data: CreateLessonForModuleInput,
): Promise<Lesson> {
  const [module] = await db
    .select()
    .from(courseModules)
    .where(eq(courseModules.id, moduleId))
    .limit(1);
  if (!module) throw new HttpError('Module not found', 404);

  const [lesson] = await db
    .insert(lessons)
    .values({
      moduleId,
      courseId: null,
      title: data.title,
      vimeoUrl: data.vimeoUrl,
      orderIndex: data.orderIndex,
      isPublished: data.isPublished ?? true,
    })
    .returning();
  if (!lesson) throw new HttpError('Failed to create lesson', 500);
  return lesson;
}

export async function createForCourse(
  courseId: string,
  data: CreateLessonForCourseInput,
): Promise<Lesson> {
  const [course] = await db
    .select()
    .from(courses)
    .where(eq(courses.id, courseId))
    .limit(1);
  if (!course) throw new HttpError('Course not found', 404);
  if (course.type !== 'ongoing') {
    throw new HttpError(
      'Direct lesson creation is only for ongoing courses. Use modules for recorded courses.',
      400,
    );
  }

  const [lesson] = await db
    .insert(lessons)
    .values({
      moduleId: null,
      courseId,
      title: data.title,
      vimeoUrl: data.vimeoUrl,
      orderIndex: data.orderIndex,
      isPublished: data.isPublished ?? true,
    })
    .returning();
  if (!lesson) throw new HttpError('Failed to create lesson', 500);
  return lesson;
}

export async function update(
  lessonId: string,
  data: UpdateLessonInput,
): Promise<Lesson> {
  if (Object.keys(data).length === 0) {
    const [lesson] = await db
      .select()
      .from(lessons)
      .where(eq(lessons.id, lessonId))
      .limit(1);
    if (!lesson) throw new HttpError('Lesson not found', 404);
    return lesson;
  }

  const [lesson] = await db
    .update(lessons)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(lessons.id, lessonId))
    .returning();
  if (!lesson) throw new HttpError('Lesson not found', 404);
  return lesson;
}

export async function deleteById(lessonId: string): Promise<Lesson> {
  const [lesson] = await db
    .delete(lessons)
    .where(eq(lessons.id, lessonId))
    .returning();
  if (!lesson) throw new HttpError('Lesson not found', 404);
  return lesson;
}

export async function reorderModuleLessons(
  moduleId: string,
  items: ReorderInput,
): Promise<void> {
  await db.transaction(async (tx) => {
    for (const item of items) {
      await tx
        .update(lessons)
        .set({ orderIndex: item.orderIndex, updatedAt: new Date() })
        .where(and(eq(lessons.id, item.id), eq(lessons.moduleId, moduleId)));
    }
  });
}

export async function reorderCourseLessons(
  courseId: string,
  items: ReorderInput,
): Promise<void> {
  await db.transaction(async (tx) => {
    for (const item of items) {
      await tx
        .update(lessons)
        .set({ orderIndex: item.orderIndex, updatedAt: new Date() })
        .where(and(eq(lessons.id, item.id), eq(lessons.courseId, courseId)));
    }
  });
}
