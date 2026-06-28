import { and, eq } from 'drizzle-orm';
import { db } from '../../db';
import {
  assignments,
  courseModules,
  enrollments,
  lessons,
} from '../../db/schema';
import { HttpError } from './response.utils';
import type { Role } from '../types/express';

export function isStaff(role: Role): boolean {
  return role === 'admin' || role === 'support';
}

export async function assertEnrolledOrStaff(
  courseId: string,
  userId: string,
  role: Role,
): Promise<void> {
  if (isStaff(role)) return;

  const [row] = await db
    .select({ id: enrollments.id })
    .from(enrollments)
    .where(
      and(
        eq(enrollments.courseId, courseId),
        eq(enrollments.learnerId, userId),
      ),
    )
    .limit(1);

  if (!row) {
    throw new HttpError('Not enrolled in this course', 403);
  }
}

export async function resolveCourseIdForLesson(
  lessonId: string,
): Promise<string> {
  const [lesson] = await db
    .select({
      moduleId: lessons.moduleId,
      courseId: lessons.courseId,
    })
    .from(lessons)
    .where(eq(lessons.id, lessonId))
    .limit(1);

  if (!lesson) throw new HttpError('Lesson not found', 404);

  if (lesson.moduleId) {
    const [mod] = await db
      .select({ courseId: courseModules.courseId })
      .from(courseModules)
      .where(eq(courseModules.id, lesson.moduleId))
      .limit(1);
    if (!mod) throw new HttpError('Module not found', 404);
    return mod.courseId;
  }

  if (lesson.courseId) return lesson.courseId;

  throw new HttpError('Lesson is not linked to a course', 400);
}

export async function assertLessonAccess(
  lessonId: string,
  userId: string,
  role: Role,
): Promise<string> {
  const courseId = await resolveCourseIdForLesson(lessonId);
  await assertEnrolledOrStaff(courseId, userId, role);
  return courseId;
}

export async function assertAssignmentAccess(
  assignmentId: string,
  userId: string,
  role: Role,
): Promise<string> {
  const [row] = await db
    .select({ lessonId: assignments.lessonId })
    .from(assignments)
    .where(eq(assignments.id, assignmentId))
    .limit(1);

  if (!row) throw new HttpError('Assignment not found', 404);

  return assertLessonAccess(row.lessonId, userId, role);
}
