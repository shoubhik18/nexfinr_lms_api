import { and, count, eq, ilike, or, sql, type SQL } from 'drizzle-orm';
import { db } from '../../db';
import {
  assignments,
  courseModules,
  courses,
  enrollments,
  lessons,
  type Course,
} from '../../db/schema';
import { HttpError } from '../../shared/utils/response.utils';
import { publicUploadUrl } from '../../shared/upload/courseThumbnail.upload';
import {
  assertEnrolledOrStaff,
  isStaff,
} from '../../shared/utils/access.utils';
import type { Role } from '../../shared/types/express';
import type {
  CreateCourseInput,
  UpdateCourseInput,
} from './courses.validator';

// ----------------------------------------------------------------------------
// Subqueries used for the staff list view to surface module/lesson counts.
//
// NOTE: `sql` template column refs (e.g. `${courses.id}`) render *unqualified*
// inside subqueries, which makes Postgres resolve them to the inner FROM
// scope and either hit ambiguous-column errors or silently return 0 rows.
// We therefore write the correlated subqueries with fully qualified names.
// ----------------------------------------------------------------------------

const moduleCountExpr = sql<number>`(
  SELECT COUNT(*)::int FROM course_modules
  WHERE course_modules.course_id = courses.id
)`;

const lessonCountExpr = sql<number>`(
  SELECT COUNT(*)::int FROM lessons
  LEFT JOIN course_modules ON lessons.module_id = course_modules.id
  WHERE course_modules.course_id = courses.id
     OR lessons.course_id = courses.id
)`;

const enrollmentCountExpr = sql<number>`(
  SELECT COUNT(*)::int FROM enrollments
  WHERE enrollments.course_id = courses.id
)`;

const courseListColumns = {
  id: courses.id,
  title: courses.title,
  description: courses.description,
  type: courses.type,
  thumbnailUrl: courses.thumbnailUrl,
  isPublished: courses.isPublished,
  createdBy: courses.createdBy,
  createdAt: courses.createdAt,
  updatedAt: courses.updatedAt,
  moduleCount: moduleCountExpr,
  lessonCount: lessonCountExpr,
  enrollmentCount: enrollmentCountExpr,
};

export interface ListCoursesQuery {
  type?: 'recorded' | 'ongoing';
  isPublished?: boolean;
  search?: string;
  page: number;
  limit: number;
}

export interface ListCoursesResult {
  courses: Array<
    Course & {
      moduleCount: number;
      lessonCount: number;
      enrollmentCount: number;
    }
  >;
  total: number;
  page: number;
  limit: number;
}

export async function list(
  role: Role,
  userId: string,
  query: ListCoursesQuery,
): Promise<ListCoursesResult> {
  const { type, isPublished, search, page, limit } = query;
  const offset = (page - 1) * limit;

  const filters: SQL[] = [];
  if (type) filters.push(eq(courses.type, type));
  if (typeof isPublished === 'boolean') {
    filters.push(eq(courses.isPublished, isPublished));
  }
  if (search) {
    const term = `%${search}%`;
    filters.push(
      or(
        ilike(courses.title, term),
        ilike(courses.description, term),
      )!,
    );
  }

  if (role === 'learner') {
    // Learner sees only courses they're enrolled in.
    const learnerCourseIdsExpr = sql`(
      SELECT ${enrollments.courseId} FROM ${enrollments}
      WHERE ${enrollments.learnerId} = ${userId}
    )`;
    filters.push(sql`${courses.id} IN ${learnerCourseIdsExpr}`);
  }

  const whereClause = filters.length > 0 ? and(...filters) : undefined;

  const rows = await db
    .select(courseListColumns)
    .from(courses)
    .where(whereClause)
    .orderBy(courses.updatedAt)
    .limit(limit)
    .offset(offset);

  const [{ value: total }] = await db
    .select({ value: count() })
    .from(courses)
    .where(whereClause);

  return {
    courses: rows as ListCoursesResult['courses'],
    total: Number(total),
    page,
    limit,
  };
}

// ----------------------------------------------------------------------------
// Detail (course → modules → lessons → assignment count)
// ----------------------------------------------------------------------------

export interface CourseDetailLesson {
  id: string;
  moduleId?: string | null;
  courseId?: string | null;
  title: string;
  vimeoUrl: string;
  orderIndex: number;
  isPublished: boolean;
  assignments?: Array<{
    id: string;
    lessonId: string;
    title: string;
    description: string | null;
    type: 'mcq' | 'text' | 'code';
    orderIndex: number;
  }>;
  assignmentCount?: number;
}
export interface CourseDetailModule {
  id: string;
  title: string;
  orderIndex: number;
  lessons: CourseDetailLesson[];
}
export interface CourseDetail extends Course {
  modules: CourseDetailModule[];
  lessons: CourseDetailLesson[];
}

export async function getById(
  id: string,
  userId: string,
  role: Role,
): Promise<CourseDetail> {
  const [course] = await db
    .select()
    .from(courses)
    .where(eq(courses.id, id))
    .limit(1);
  if (!course) throw new HttpError('Course not found', 404);

  await assertEnrolledOrStaff(id, userId, role);

  const forLearner = !isStaff(role);

  async function attachAssignments<
    T extends { id: string; isPublished: boolean },
  >(lessonRows: T[]) {
    const visible = forLearner
      ? lessonRows.filter((l) => l.isPublished)
      : lessonRows;

    return Promise.all(
      visible.map(async (lesson) => {
        const assignmentList = await db
          .select()
          .from(assignments)
          .where(eq(assignments.lessonId, lesson.id))
          .orderBy(assignments.orderIndex);
        return { ...lesson, assignments: assignmentList };
      }),
    );
  }

  if (course.type === 'recorded') {
    const modules = await db
      .select()
      .from(courseModules)
      .where(eq(courseModules.courseId, id))
      .orderBy(courseModules.orderIndex);

    const modulesWithLessons = await Promise.all(
      modules.map(async (mod) => {
        const modLessons = await db
          .select()
          .from(lessons)
          .where(eq(lessons.moduleId, mod.id))
          .orderBy(lessons.orderIndex);

        const lessonsWithAssignments = await attachAssignments(modLessons);
        return { ...mod, lessons: lessonsWithAssignments };
      }),
    );

    return { ...course, modules: modulesWithLessons, lessons: [] };
  }

  if (course.type === 'ongoing') {
    const courseLessons = await db
      .select()
      .from(lessons)
      .where(eq(lessons.courseId, id))
      .orderBy(lessons.orderIndex);

    const lessonsWithAssignments = await attachAssignments(courseLessons);
    return { ...course, modules: [], lessons: lessonsWithAssignments };
  }

  return { ...course, modules: [], lessons: [] };
}

async function courseHasContent(courseId: string): Promise<boolean> {
  const [mod] = await db
    .select({ id: courseModules.id })
    .from(courseModules)
    .where(eq(courseModules.courseId, courseId))
    .limit(1);
  if (mod) return true;

  const [directLesson] = await db
    .select({ id: lessons.id })
    .from(lessons)
    .where(eq(lessons.courseId, courseId))
    .limit(1);
  if (directLesson) return true;

  const [moduleLesson] = await db
    .select({ id: lessons.id })
    .from(lessons)
    .innerJoin(courseModules, eq(lessons.moduleId, courseModules.id))
    .where(eq(courseModules.courseId, courseId))
    .limit(1);

  return Boolean(moduleLesson);
}

// ----------------------------------------------------------------------------
// Mutations
// ----------------------------------------------------------------------------

export async function create(
  data: CreateCourseInput,
  createdBy: string,
): Promise<Course> {
  const [created] = await db
    .insert(courses)
    .values({ ...data, createdBy })
    .returning();
  if (!created) throw new HttpError('Failed to create course', 500);
  return created;
}

export async function update(
  id: string,
  data: UpdateCourseInput,
): Promise<Course> {
  if (Object.keys(data).length === 0) {
    const [course] = await db
      .select()
      .from(courses)
      .where(eq(courses.id, id))
      .limit(1);
    if (!course) throw new HttpError('Course not found', 404);
    return course;
  }

  const [existing] = await db
    .select()
    .from(courses)
    .where(eq(courses.id, id))
    .limit(1);
  if (!existing) throw new HttpError('Course not found', 404);

  if (data.type !== undefined && data.type !== existing.type) {
    const hasContent = await courseHasContent(id);
    if (hasContent) {
      throw new HttpError(
        'Cannot change course type after modules, lessons, or assignments exist',
        400,
      );
    }
  }

  const [updated] = await db
    .update(courses)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(courses.id, id))
    .returning();
  if (!updated) throw new HttpError('Course not found', 404);
  return updated;
}

export async function deleteById(id: string): Promise<Course> {
  const [deleted] = await db
    .delete(courses)
    .where(eq(courses.id, id))
    .returning();
  if (!deleted) throw new HttpError('Course not found', 404);
  return deleted;
}

export async function togglePublish(id: string): Promise<Course> {
  const [course] = await db
    .select()
    .from(courses)
    .where(eq(courses.id, id))
    .limit(1);
  if (!course) throw new HttpError('Course not found', 404);

  const [updated] = await db
    .update(courses)
    .set({ isPublished: !course.isPublished, updatedAt: new Date() })
    .where(eq(courses.id, id))
    .returning();
  if (!updated) throw new HttpError('Course not found', 404);
  return updated;
}

export async function setThumbnailFromUpload(
  id: string,
  filename: string,
): Promise<Course> {
  const thumbnailUrl = publicUploadUrl(`/uploads/courses/${filename}`);
  return update(id, { thumbnailUrl });
}
